import { rmSync } from 'node:fs';
import { Hono, type Context } from 'hono';
import { applyReplacement, createAnchor, isInsideRange, reanchor } from '../../shared/anchor';
import type { Anchor, Comment, CorrectionVersion, Id } from '../../shared/types';
import { withDb, type AppDeps } from '../app';
import { buildRequest, type AiAction } from '../claude/prompts';
import { parseSections } from '../claude/sections';
import * as repo from '../db/repo';
import type { Db } from '../db/schema';
import { absolutePath } from '../files/storage';
import { streamProvider } from '../sse';
import { filesFromBody, storeUploads } from './library';

const notFound = (c: Context) => c.json({ message: 'Introuvable.' }, 404);
const noVersion = (c: Context) => c.json({ message: "Génère d'abord la correction." }, 409);

/**
 * Moves every comment of the exercise onto a new version of the correction.
 * Comments whose passage was rewritten (inside `replaced`) or only found approximately get `changed`;
 * comments that cannot be found any more become `detached` (never deleted).
 */
export function reanchorAll(
  db: Db, exerciseId: Id, version: CorrectionVersion,
  replaced: { start: number; end: number } | null, trigger: { id: Id; anchor: Anchor } | null,
): Comment[] {
  for (const cm of repo.listComments(db, exerciseId)) {
    if (trigger && cm.id === trigger.id) {
      repo.updateComment(db, cm.id, { anchor: trigger.anchor, status: 'resolved', changed: false, versionId: version.id });
      continue;
    }
    if (!cm.anchor || cm.status === 'detached') continue;
    const r = reanchor(cm.anchor, version.markdown);
    if (r.status === 'lost') {
      repo.updateComment(db, cm.id, { status: 'detached' });
      continue;
    }
    const touched = replaced ? isInsideRange(r.anchor, replaced.start, replaced.end) : false;
    repo.updateComment(db, cm.id, {
      anchor: r.anchor, versionId: version.id, changed: cm.changed || r.status === 'fuzzy' || touched,
    });
  }
  return repo.listComments(db, exerciseId);
}

export function aiRoutes(deps: AppDeps): Hono {
  const r = new Hono();
  const ctx = () => ({ dataDir: deps.config.dataDir, model: deps.config.model });
  const run = (c: Context, action: AiAction, onDone: (text: string) => unknown, onFail?: () => void) =>
    streamProvider(c, deps.provider, buildRequest(action, ctx()), onDone, onFail);

  /** Loads what most actions need: exercise, attachments, current version. */
  const load = (exerciseId: Id) => withDb(deps, (db) => {
    const exercise = repo.getExercise(db, exerciseId);
    if (!exercise) return null;
    return { exercise, attachments: repo.listAttachments(db, exerciseId), current: repo.currentVersion(db, exerciseId) };
  });

  const loadComment = (commentId: Id) => withDb(deps, (db) => {
    const comment = repo.getComment(db, commentId);
    if (!comment) return null;
    const base = load(comment.exerciseId);
    if (!base) return null;
    return { ...base, comment, thread: repo.listMessages(db, commentId) };
  });

  // ----- correction -----
  r.post('/exercises/:id/generate', async (c) => {
    const { instruction } = await c.req.json<{ instruction?: string }>().catch(() => ({ instruction: undefined }));
    const base = load(Number(c.req.param('id')));
    if (!base) return notFound(c);
    if (base.current) return c.json({ message: 'La correction existe déjà : utilise « Refaire ».' }, 409);
    const { exercise, attachments } = base;
    return run(c, { kind: 'generate', exercise, attachments, instruction: instruction?.trim() || null }, (text) => {
      const s = parseSections(text);
      return withDb(deps, (db) => {
        if (s.ENONCE) repo.updateExercise(db, exercise.id, { statementTranscription: s.ENONCE });
        const version = repo.addVersion(db, {
          exerciseId: exercise.id, markdown: s.CORRECTION ?? text.trim(), reason: 'initial',
          triggerCommentId: null, instruction: instruction?.trim() || null,
        });
        return { version, exercise: repo.getExercise(db, exercise.id) };
      });
    });
  });

  r.post('/exercises/:id/regenerate', async (c) => {
    const { instruction } = await c.req.json<{ instruction: string }>();
    const base = load(Number(c.req.param('id')));
    if (!base) return notFound(c);
    if (!base.current) return noVersion(c);
    return run(c, {
      kind: 'regenerate', exercise: base.exercise, attachments: base.attachments,
      current: base.current.markdown, instruction: instruction ?? '',
    }, (text) => ({ proposal: parseSections(text).CORRECTION ?? text.trim() }));
  });

  r.post('/exercises/:id/regenerate/accept', async (c) => {
    const id = Number(c.req.param('id'));
    const { proposal, instruction } = await c.req.json<{ proposal: string; instruction: string }>();
    const res = withDb(deps, (db) => {
      if (!repo.getExercise(db, id)) return null;
      const version = repo.addVersion(db, { exerciseId: id, markdown: proposal, reason: 'regenerate', triggerCommentId: null, instruction: instruction || null });
      return { version, comments: reanchorAll(db, id, version, null, null) };
    });
    return res ? c.json(res) : notFound(c);
  });

  // ----- comments -----
  r.post('/comments', async (c) => {
    const { exerciseId, anchor, question } = await c.req.json<{ exerciseId: Id; anchor: Anchor; question: string }>();
    const base = load(exerciseId);
    if (!base) return notFound(c);
    if (!base.current) return noVersion(c);
    const current = base.current;
    // Nothing is stored until Claude has answered: a retry after a failure never duplicates anything.
    return run(c, {
      kind: 'comment', exercise: base.exercise, attachments: base.attachments, current: current.markdown,
      quote: anchor.exact, thread: [], question,
    }, (text) => withDb(deps, (db) => {
      const cm = repo.createComment(db, { exerciseId, versionId: current.id, anchor, kind: 'passage' });
      repo.addMessage(db, cm.id, 'user', question);
      repo.addMessage(db, cm.id, 'assistant', text.trim());
      return { comment: repo.getComment(db, cm.id), messages: repo.listMessages(db, cm.id) };
    }));
  });

  r.post('/comments/:id/messages', async (c) => {
    const { question } = await c.req.json<{ question: string }>();
    const ld = loadComment(Number(c.req.param('id')));
    if (!ld || !ld.current) return notFound(c);
    const { comment } = ld;
    return run(c, {
      kind: 'comment', exercise: ld.exercise, attachments: ld.attachments, current: ld.current.markdown,
      quote: comment.anchor?.exact ?? '', thread: ld.thread, question,
    }, (text) => withDb(deps, (db) => {
      repo.addMessage(db, comment.id, 'user', question);
      repo.addMessage(db, comment.id, 'assistant', text.trim());
      return { messages: repo.listMessages(db, comment.id) };
    }));
  });

  r.post('/comments/:id/diagram', async (c) => {
    const { request } = await c.req.json<{ request?: string }>().catch(() => ({ request: undefined }));
    const ld = loadComment(Number(c.req.param('id')));
    if (!ld || !ld.current) return notFound(c);
    const { comment } = ld;
    const label = request?.trim() ? `Schéma demandé : ${request.trim()}` : 'Schéma demandé';
    return run(c, {
      kind: 'diagram', exercise: ld.exercise, attachments: ld.attachments, current: ld.current.markdown,
      quote: comment.anchor?.exact ?? '', thread: ld.thread, request: request?.trim() || null,
    }, (text) => withDb(deps, (db) => {
      repo.addMessage(db, comment.id, 'user', label);
      repo.addMessage(db, comment.id, 'assistant', text.trim());
      return { messages: repo.listMessages(db, comment.id) };
    }));
  });

  r.post('/comments/:id/fix', async (c) => {
    const { instruction } = await c.req.json<{ instruction?: string }>().catch(() => ({ instruction: undefined }));
    const ld = loadComment(Number(c.req.param('id')));
    if (!ld || !ld.current) return notFound(c);
    const anchor = ld.comment.anchor;
    if (!anchor || ld.comment.status === 'detached') return c.json({ message: "Ce commentaire n'est plus accroché à la correction." }, 409);
    const before = ld.current.markdown.slice(anchor.start, anchor.end);
    return run(c, {
      kind: 'fix', exercise: ld.exercise, attachments: ld.attachments, current: ld.current.markdown,
      quote: before, thread: ld.thread, instruction: instruction?.trim() || null,
    }, (text) => ({ proposal: { start: anchor.start, end: anchor.end, before, after: parseSections(text).REMPLACEMENT ?? text.trim() } }));
  });

  r.post('/comments/:id/fix/accept', async (c) => {
    const commentId = Number(c.req.param('id'));
    const { start, end, before, after } = await c.req.json<{ start: number; end: number; before: string; after: string }>();
    const res = withDb(deps, (db) => {
      const cm = repo.getComment(db, commentId);
      if (!cm) return null;
      const current = repo.currentVersion(db, cm.exerciseId);
      // The proposal was computed on a given text: refuse it if that text is no longer at that place.
      if (!current || typeof before !== 'string' || start < 0 || start > end || current.markdown.slice(start, end) !== before) {
        return 'bad' as const;
      }
      const markdown = applyReplacement(current.markdown, start, end, after);
      db.exec('BEGIN');
      try {
        const version = repo.addVersion(db, {
          exerciseId: cm.exerciseId, markdown, reason: 'fix', triggerCommentId: cm.id, instruction: null,
        });
        const triggerAnchor = createAnchor(markdown, start, start + after.length, cm.anchor?.kind ?? 'text');
        const comments = reanchorAll(db, cm.exerciseId, version, { start, end: start + after.length }, { id: cm.id, anchor: triggerAnchor });
        db.exec('COMMIT');
        return { version, comments };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    });
    if (res === null) return notFound(c);
    if (res === 'bad') return c.json({ message: 'La correction a changé entre-temps : redemande la modification.' }, 409);
    return c.json(res);
  });

  // ----- revision -----
  r.post('/exercises/:id/similar', (c) => {
    const base = load(Number(c.req.param('id')));
    if (!base) return notFound(c);
    if (!base.current) return noVersion(c);
    const { exercise } = base;
    return run(c, { kind: 'similar', exercise, attachments: base.attachments, current: base.current.markdown }, (text) => {
      const s = parseSections(text);
      return withDb(deps, (db) => {
        const n = repo.listChildren(db, exercise.id).length + 1;
        const child = repo.createExercise(db, {
          chapterId: exercise.chapterId, parentId: exercise.id,
          title: `${exercise.title} — variante ${n}`, statementText: s.ENONCE ?? '',
        });
        repo.addVersion(db, { exerciseId: child.id, markdown: s.CORRECTION ?? text.trim(), reason: 'initial', triggerCommentId: null, instruction: null });
        return { exercise: child };
      });
    });
  });

  r.post('/exercises/:id/check', async (c) => {
    const id = Number(c.req.param('id'));
    const base = load(id);
    if (!base) return notFound(c);
    if (!base.current) return noVersion(c);
    const current = base.current;
    const body = await c.req.parseBody({ all: true });
    const answerText = String(body.answerText ?? '').trim() || null;
    const { saved, rejected } = await storeUploads(deps, id, filesFromBody(body), 'reponses');
    if (!answerText && !saved.length) {
      return c.json({ message: rejected.length ? 'Fichier refusé (type ou taille).' : 'Écris ta réponse ou joins une photo.' }, 400);
    }
    const answerFiles = saved.map((s) => absolutePath(deps.config.dataDir, s.relPath));
    const userText = [answerText, ...saved.map((s) => `📎 ${s.fileName}`)].filter(Boolean).join('\n');
    return run(c, {
      kind: 'check', exercise: base.exercise, attachments: base.attachments, current: current.markdown, answerText, answerFiles,
    }, (text) => withDb(deps, (db) => {
      const cm = repo.createComment(db, { exerciseId: id, versionId: current.id, anchor: null, kind: 'check-answer' });
      repo.addMessage(db, cm.id, 'user', userText);
      repo.addMessage(db, cm.id, 'assistant', text.trim());
      return { comment: repo.getComment(db, cm.id), messages: repo.listMessages(db, cm.id) };
    }), () => answerFiles.forEach((f) => rmSync(f, { force: true })));
  });

  return r;
}
