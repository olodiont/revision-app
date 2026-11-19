/*
 * Opens the app in its own window (Microsoft Edge "app" mode, with a separate profile), so that:
 *  - closing that window stops the server (and its console), see presence.ts;
 *  - closing the console closes that window (index.ts kills it on shutdown).
 * The separate profile means this window never touches the user's own browser windows.
 */
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function findEdge(
  exists: (p: string) => boolean = existsSync,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter((r): r is string => !!r);
  for (const root of roots) {
    const p = join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (exists(p)) return p;
  }
  return null;
}

export function appWindowArgs(url: string, profileDir: string): string[] {
  return [
    `--app=${url}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,920',
  ];
}

export interface AppWindow { close(): void }

export function openAppWindow(opts: {
  url: string;
  profileDir: string;
  edge?: string | null;
  onClosed: () => void;
  spawnFn?: typeof nodeSpawn;
  kill?: (pid: number) => void;
}): AppWindow | null {
  const edge = opts.edge === undefined ? findEdge() : opts.edge;
  if (!edge) return null;
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const kill = opts.kill ?? ((pid: number) => { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }); });
  const child = spawnFn(edge, appWindowArgs(opts.url, opts.profileDir), { stdio: 'ignore', windowsHide: false });
  child.on('error', () => opts.onClosed());
  child.on('exit', () => opts.onClosed());
  return {
    close() {
      if (child.pid) kill(child.pid);
    },
  };
}
