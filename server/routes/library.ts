import { createReadStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import type { Id, Message } from '../../shared/types';
import { withDb, type AppDeps } from '../app';
import * as repo from '../db/repo';
import { search } from '../db/search';
import { docxToText } from '../files/docx';
import {
  absolutePath, AttachmentError, deleteExerciseFiles, DOCX_MIME, resolveMime, saveAttachment,
} from '../files/storage';

const notFound = { message: 'Introuvable.' };

export function exerciseDetail(deps: AppDeps, id: Id) {
  return withDb(deps, (db) => {
    const exercise = repo.getExercise(db, id);
    if (!exercise) return null;
    const comments = repo.listComments(db, id);
    const messagesByComment: Record<Id, Message[]> = {};
    for (const c of comments) messagesByComment[c.id] = repo.listMessages(db, c.id);
    return {
      exercise,
      attachments: repo.listAttachments(db, id),
      versions: repo.listVersions(db, id),
      comments,
      messagesByComment,
      children: repo.listChildren(db, id),
    };
  });
}

export interface RejectedFile { fileName: string; reason: 'type' | 'size' }

/** Saves uploaded files for an exercise, extracting text from Word documents. */
export async function storeUploads(
  deps: AppDeps, exerciseId: Id, files: File[], subdir = '',
): Promise<{ rejected: RejectedFile[]; saved: { relPath: string; mime: string; fileName: string; size: number; extractedText: string | null }[] }> {
  const rejected: RejectedFile[] = [];
  const saved = [];
  for (const file of files) {
    const mime = resolveMime(file.name, file.type);
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const { relPath, size } = saveAttachment(deps.config.dataDir, exerciseId, file.name, mime, bytes, subdir);
      let extractedText: string | null = null;
      if (mime === DOCX_MIME) extractedText = await docxToText(bytes);
      else if (mime === 'text/plain' || mime === 'text/markdown') extractedText = new TextDecoder().decode(bytes);
      saved.push({ relPath, mime, fileName: file.name, size, extractedText });
    } catch (e) {
      if (e instanceof AttachmentError) rejected.push({ fileName: file.name, reason: e.reason });
      else throw e;
    }
  }
  return { rejected, saved };
}

export function filesFromBody(body: Record<string, unknown>): File[] {
  const raw = body['files'] ?? body['files[]'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.filter((f): f is File => f instanceof File);
}

export function libraryRoutes(deps: AppDeps): Hono {
  const r = new Hono();

  r.get('/library', (c) => c.json(withDb(deps, (db) => repo.getLibraryTree(db))));

  r.get('/search', (c) => c.json(withDb(deps, (db) => search(db, c.req.query('q') ?? ''))));

  // ----- subjects -----
  r.post('/subjects', async (c) => {
    const { name } = await c.req.json<{ name: string }>();
    return c.json(withDb(deps, (db) => repo.createSubject(db, name)));
  });
  r.patch('/subjects/:id', async (c) => {
    const { name } = await c.req.json<{ name: string }>();
    withDb(deps, (db) => repo.renameSubject(db, Number(c.req.param('id')), name));
    return c.json({ ok: true });
  });
  r.delete('/subjects/:id', (c) => {
    const id = Number(c.req.param('id'));
    const ids = withDb(deps, (db) => {
      const ex = db.prepare('SELECT e.id FROM exercises e JOIN chapters ch ON ch.id = e.chapter_id WHERE ch.subject_id = ?').all(id);
      repo.deleteSubject(db, id);
      return ex.map((row) => Number((row as { id: number }).id));
    });
    ids.forEach((e) => deleteExerciseFiles(deps.config.dataDir, e));
    return c.json({ ok: true });
  });

  // ----- chapters -----
  r.post('/chapters', async (c) => {
    const { subjectId, name } = await c.req.json<{ subjectId: Id; name: string }>();
    return c.json(withDb(deps, (db) => repo.createChapter(db, subjectId, name)));
  });
  r.patch('/chapters/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body = await c.req.json<{ name?: string; subjectId?: Id }>();
    withDb(deps, (db) => {
      if (body.name !== undefined) repo.renameChapter(db, id, body.name);
      if (body.subjectId !== undefined) repo.moveChapter(db, id, body.subjectId);
    });
    return c.json({ ok: true });
  });
  r.delete('/chapters/:id', (c) => {
    const id = Number(c.req.param('id'));
    const ids = withDb(deps, (db) => {
      const ex = db.prepare('SELECT id FROM exercises WHERE chapter_id = ?').all(id);
      repo.deleteChapter(db, id);
      return ex.map((row) => Number((row as { id: number }).id));
    });
    ids.forEach((e) => deleteExerciseFiles(deps.config.dataDir, e));
    return c.json({ ok: true });
  });

  // ----- exercises -----
  r.post('/exercises', async (c) => {
    const body = await c.req.parseBody({ all: true });
    const chapterId = Number(body.chapterId);
    const title = String(body.title ?? '').trim() || 'Sans titre';
    const statementText = String(body.statementText ?? '');
    const exercise = withDb(deps, (db) => {
      if (!repo.getChapter(db, chapterId)) return null;
      return repo.createExercise(db, { chapterId, title, statementText });
    });
    if (!exercise) return c.json({ message: 'Chapitre introuvable.' }, 400);
    const { rejected, saved } = await storeUploads(deps, exercise.id, filesFromBody(body));
    withDb(deps, (db) => saved.forEach((s) => repo.addAttachment(db, { exerciseId: exercise.id, ...s })));
    return c.json({ exercise, rejected });
  });

  r.get('/exercises/:id', (c) => {
    const detail = exerciseDetail(deps, Number(c.req.param('id')));
    return detail ? c.json(detail) : c.json(notFound, 404);
  });

  r.patch('/exercises/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body = await c.req.json<{ title?: string; chapterId?: Id }>();
    withDb(deps, (db) => repo.updateExercise(db, id, { title: body.title, chapterId: body.chapterId }));
    return c.json({ ok: true });
  });

  r.delete('/exercises/:id', (c) => {
    const id = Number(c.req.param('id'));
    const ids = withDb(deps, (db) => {
      const all = repo.exerciseAndDescendantIds(db, id);
      repo.deleteExercise(db, id);
      return all;
    });
    ids.forEach((e) => deleteExerciseFiles(deps.config.dataDir, e));
    return c.json({ ok: true });
  });

  // ----- attachments -----
  r.get('/attachments/:id', (c) => {
    const att = withDb(deps, (db) => repo.getAttachment(db, Number(c.req.param('id'))));
    if (!att) return c.json(notFound, 404);
    const path = absolutePath(deps.config.dataDir, att.relPath);
    if (!existsSync(path)) return c.json(notFound, 404);
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return new Response(stream, {
      headers: {
        'content-type': att.mime,
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      },
    });
  });

  return r;
}
