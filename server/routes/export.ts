import { existsSync, readFileSync } from 'node:fs';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { Hono, type Context } from 'hono';
import type { Id, Message } from '../../shared/types';
import { withDb, type AppDeps } from '../app';
import * as repo from '../db/repo';
import type { Db } from '../db/schema';
import { exerciseToMarkdown, safeFileName } from '../export/markdown';
import { absolutePath } from '../files/storage';

function addExercise(db: Db, deps: AppDeps, files: Zippable, folder: string, exerciseId: Id): void {
  const ex = repo.getExercise(db, exerciseId);
  if (!ex) return;
  const comments = repo.listComments(db, ex.id);
  const messages: Record<Id, Message[]> = {};
  for (const c of comments) messages[c.id] = repo.listMessages(db, c.id);
  const attachments = repo.listAttachments(db, ex.id);
  const md = exerciseToMarkdown(ex, repo.currentVersion(db, ex.id), comments, messages, attachments);

  let name = `${folder}${safeFileName(ex.title)}.md`;
  for (let i = 2; name in files; i++) name = `${folder}${safeFileName(ex.title)} (${i}).md`;
  files[name] = strToU8(md);
  for (const a of attachments) {
    const path = absolutePath(deps.config.dataDir, a.relPath);
    if (existsSync(path)) files[`${folder}fichiers/${ex.id}/${a.relPath.split('/').pop()}`] = new Uint8Array(readFileSync(path));
  }
}

function zipResponse(c: Context, files: Zippable, name: string) {
  const zip = zipSync(files, { level: 6 });
  return c.body(zip as Uint8Array<ArrayBuffer>, 200, {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="export.zip"; filename*=UTF-8''${encodeURIComponent(`${safeFileName(name)}.zip`)}`,
  });
}

export function exportRoutes(deps: AppDeps): Hono {
  const r = new Hono();

  r.get('/export/exercise/:id', (c) => {
    const id = Number(c.req.param('id'));
    const res = withDb(deps, (db) => {
      const ex = repo.getExercise(db, id);
      if (!ex) return null;
      const files: Zippable = {};
      addExercise(db, deps, files, '', id);
      return { files, name: ex.title };
    });
    return res ? zipResponse(c, res.files, res.name) : c.json({ message: 'Introuvable.' }, 404);
  });

  r.get('/export/subject/:id', (c) => {
    const id = Number(c.req.param('id'));
    const res = withDb(deps, (db) => {
      const subject = repo.getSubject(db, id);
      if (!subject) return null;
      const tree = repo.getLibraryTree(db).subjects.find((s) => s.id === id)!;
      const files: Zippable = {};
      for (const ch of tree.chapters) {
        for (const e of ch.exercises) addExercise(db, deps, files, `${safeFileName(ch.name)}/`, e.id);
      }
      return { files, name: subject.name };
    });
    return res ? zipResponse(c, res.files, res.name) : c.json({ message: 'Introuvable.' }, 404);
  });

  return r;
}
