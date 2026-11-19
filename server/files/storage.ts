import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { Id } from '../../shared/types';

export function dataPaths(dataDir: string) {
  return {
    db: join(dataDir, 'revision.db'),
    files: join(dataDir, 'fichiers'),
    claudeCwd: join(dataDir, 'claude-cwd'),
  };
}

export function ensureDataDir(dataDir: string): void {
  const p = dataPaths(dataDir);
  mkdirSync(p.files, { recursive: true });
  mkdirSync(p.claudeCwd, { recursive: true });
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ACCEPTED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', DOCX_MIME, 'text/plain', 'text/markdown',
]);

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.docx': DOCX_MIME, '.txt': 'text/plain', '.md': 'text/markdown',
};

/** Trusts the extension when the browser sends a generic or empty type. */
export function resolveMime(fileName: string, declared: string): string {
  const fromExt = EXT_MIME[extname(fileName).toLowerCase()];
  if (!declared || declared === 'application/octet-stream') return fromExt ?? declared ?? 'application/octet-stream';
  if (!ACCEPTED_TYPES.has(declared) && fromExt) return fromExt;
  return declared;
}

export class AttachmentError extends Error {
  constructor(public reason: 'type' | 'size') { super(reason); }
}

function safeName(fileName: string): string {
  const b = basename(fileName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return b || 'fichier';
}

export function saveAttachment(
  dataDir: string, exerciseId: Id, fileName: string, mime: string, bytes: Uint8Array, subdir = '',
): { relPath: string; size: number } {
  if (!ACCEPTED_TYPES.has(mime)) throw new AttachmentError('type');
  if (bytes.byteLength > MAX_FILE_BYTES) throw new AttachmentError('size');
  const dir = join(dataPaths(dataDir).files, String(exerciseId), subdir);
  mkdirSync(dir, { recursive: true });
  let name = safeName(fileName);
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 2; existsSync(join(dir, name)); i++) name = `${stem} (${i})${ext}`;
  writeFileSync(join(dir, name), bytes);
  const relPath = ['fichiers', String(exerciseId), ...(subdir ? [subdir] : []), name].join('/');
  return { relPath, size: bytes.byteLength };
}

export function deleteExerciseFiles(dataDir: string, exerciseId: Id): void {
  rmSync(join(dataPaths(dataDir).files, String(exerciseId)), { recursive: true, force: true });
}

export function absolutePath(dataDir: string, relPath: string): string {
  return join(dataDir, ...relPath.split('/'));
}

export function folderSize(path: string): number {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const entry of readdirSync(path)) total += folderSize(join(path, entry));
  return total;
}

export function openInExplorer(path: string): void {
  const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(cmd, [path], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
}
