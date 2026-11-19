import type {
  Anchor, Attachment, Chapter, Comment, CommentKind, CorrectionVersion, Exercise, Id, LibraryTree, Message, Subject,
} from '../../shared/types';
import type { Db } from './schema';
import { pruneIndex, reindexExercise } from './search';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const nullableNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const nullableStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

// ---------- mappers ----------
const toSubject = (r: Row): Subject => ({ id: Number(r.id), name: String(r.name), position: Number(r.position) });
const toChapter = (r: Row): Chapter => ({
  id: Number(r.id), subjectId: Number(r.subject_id), name: String(r.name), position: Number(r.position),
});
const toExercise = (r: Row): Exercise => ({
  id: Number(r.id), chapterId: Number(r.chapter_id), parentId: nullableNum(r.parent_id), title: String(r.title),
  statementText: String(r.statement_text), statementTranscription: nullableStr(r.statement_transcription),
  createdAt: String(r.created_at),
});
const toAttachment = (r: Row): Attachment => ({
  id: Number(r.id), exerciseId: Number(r.exercise_id), fileName: String(r.file_name), mime: String(r.mime),
  relPath: String(r.rel_path), size: Number(r.size), extractedText: nullableStr(r.extracted_text),
});
const toVersion = (r: Row): CorrectionVersion => ({
  id: Number(r.id), exerciseId: Number(r.exercise_id), number: Number(r.number), markdown: String(r.markdown),
  reason: r.reason as CorrectionVersion['reason'], triggerCommentId: nullableNum(r.trigger_comment_id),
  instruction: nullableStr(r.instruction), createdAt: String(r.created_at),
});
const toComment = (r: Row): Comment => ({
  id: Number(r.id), exerciseId: Number(r.exercise_id), versionId: Number(r.version_id),
  anchor: r.anchor ? (JSON.parse(String(r.anchor)) as Anchor) : null,
  status: r.status as Comment['status'], changed: Number(r.changed) === 1, kind: r.kind as CommentKind,
  createdAt: String(r.created_at),
});
const toMessage = (r: Row): Message => ({
  id: Number(r.id), commentId: Number(r.comment_id), role: r.role as Message['role'], content: String(r.content),
  createdAt: String(r.created_at),
});

function nextPosition(db: Db, table: 'subjects' | 'chapters', where = '', arg?: number): number {
  const sql = `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ${table} ${where}`;
  const r = (arg === undefined ? db.prepare(sql).get() : db.prepare(sql).get(arg)) as Row;
  return Number(r.p);
}

// ---------- subjects ----------
export function createSubject(db: Db, name: string): Subject {
  const position = nextPosition(db, 'subjects');
  const r = db.prepare('INSERT INTO subjects (name, position) VALUES (?, ?) RETURNING *').get(name, position) as Row;
  return toSubject(r);
}
export function renameSubject(db: Db, id: Id, name: string): void {
  db.prepare('UPDATE subjects SET name = ? WHERE id = ?').run(name, id);
}
export function deleteSubject(db: Db, id: Id): void {
  db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
  pruneIndex(db);
}
export function getSubject(db: Db, id: Id): Subject | null {
  const r = db.prepare('SELECT * FROM subjects WHERE id = ?').get(id) as Row | undefined;
  return r ? toSubject(r) : null;
}

// ---------- chapters ----------
export function createChapter(db: Db, subjectId: Id, name: string): Chapter {
  const position = nextPosition(db, 'chapters', 'WHERE subject_id = ?', subjectId);
  const r = db.prepare('INSERT INTO chapters (subject_id, name, position) VALUES (?, ?, ?) RETURNING *')
    .get(subjectId, name, position) as Row;
  return toChapter(r);
}
export function renameChapter(db: Db, id: Id, name: string): void {
  db.prepare('UPDATE chapters SET name = ? WHERE id = ?').run(name, id);
}
export function moveChapter(db: Db, id: Id, subjectId: Id): void {
  db.prepare('UPDATE chapters SET subject_id = ? WHERE id = ?').run(subjectId, id);
}
export function deleteChapter(db: Db, id: Id): void {
  db.prepare('DELETE FROM chapters WHERE id = ?').run(id);
  pruneIndex(db);
}
export function getChapter(db: Db, id: Id): Chapter | null {
  const r = db.prepare('SELECT * FROM chapters WHERE id = ?').get(id) as Row | undefined;
  return r ? toChapter(r) : null;
}

// ---------- exercises ----------
export function createExercise(
  db: Db, input: { chapterId: Id; title: string; statementText: string; parentId?: Id | null },
): Exercise {
  const r = db.prepare(
    'INSERT INTO exercises (chapter_id, parent_id, title, statement_text, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *',
  ).get(input.chapterId, input.parentId ?? null, input.title, input.statementText, now()) as Row;
  const ex = toExercise(r);
  reindexExercise(db, ex.id);
  return ex;
}
export function getExercise(db: Db, id: Id): Exercise | null {
  const r = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id) as Row | undefined;
  return r ? toExercise(r) : null;
}
export function listChildren(db: Db, parentId: Id): Exercise[] {
  return (db.prepare('SELECT * FROM exercises WHERE parent_id = ? ORDER BY id').all(parentId) as Row[]).map(toExercise);
}
export function updateExercise(
  db: Db, id: Id, patch: Partial<Pick<Exercise, 'title' | 'chapterId' | 'statementTranscription'>>,
): void {
  if (patch.title !== undefined) db.prepare('UPDATE exercises SET title = ? WHERE id = ?').run(patch.title, id);
  if (patch.chapterId !== undefined) db.prepare('UPDATE exercises SET chapter_id = ? WHERE id = ?').run(patch.chapterId, id);
  if (patch.statementTranscription !== undefined) {
    db.prepare('UPDATE exercises SET statement_transcription = ? WHERE id = ?').run(patch.statementTranscription, id);
  }
  reindexExercise(db, id);
}
/** Ids of the exercise and all its descendants (children, grandchildren…). */
export function exerciseAndDescendantIds(db: Db, id: Id): Id[] {
  const rows = db.prepare(`
    WITH RECURSIVE t(id) AS (SELECT ? UNION ALL SELECT e.id FROM exercises e JOIN t ON e.parent_id = t.id)
    SELECT id FROM t
  `).all(id) as Row[];
  return rows.map((r) => Number(r.id));
}
export function deleteExercise(db: Db, id: Id): void {
  db.prepare('DELETE FROM exercises WHERE id = ?').run(id);
  pruneIndex(db);
}

// ---------- attachments ----------
export function addAttachment(db: Db, a: Omit<Attachment, 'id'>): Attachment {
  const r = db.prepare(
    'INSERT INTO attachments (exercise_id, file_name, mime, rel_path, size, extracted_text) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
  ).get(a.exerciseId, a.fileName, a.mime, a.relPath, a.size, a.extractedText) as Row;
  reindexExercise(db, a.exerciseId);
  return toAttachment(r);
}
export function listAttachments(db: Db, exerciseId: Id): Attachment[] {
  return (db.prepare('SELECT * FROM attachments WHERE exercise_id = ? ORDER BY id').all(exerciseId) as Row[]).map(toAttachment);
}
export function getAttachment(db: Db, id: Id): Attachment | null {
  const r = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Row | undefined;
  return r ? toAttachment(r) : null;
}

// ---------- versions ----------
export function addVersion(db: Db, v: Omit<CorrectionVersion, 'id' | 'number' | 'createdAt'>): CorrectionVersion {
  const n = Number((db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM versions WHERE exercise_id = ?')
    .get(v.exerciseId) as Row).n);
  const r = db.prepare(
    'INSERT INTO versions (exercise_id, number, markdown, reason, trigger_comment_id, instruction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
  ).get(v.exerciseId, n, v.markdown, v.reason, v.triggerCommentId, v.instruction, now()) as Row;
  reindexExercise(db, v.exerciseId);
  return toVersion(r);
}
export function listVersions(db: Db, exerciseId: Id): CorrectionVersion[] {
  return (db.prepare('SELECT * FROM versions WHERE exercise_id = ? ORDER BY number').all(exerciseId) as Row[]).map(toVersion);
}
export function currentVersion(db: Db, exerciseId: Id): CorrectionVersion | null {
  const r = db.prepare('SELECT * FROM versions WHERE exercise_id = ? ORDER BY number DESC LIMIT 1').get(exerciseId) as Row | undefined;
  return r ? toVersion(r) : null;
}

// ---------- comments ----------
export function createComment(
  db: Db, c: Omit<Comment, 'id' | 'createdAt' | 'changed' | 'status'>,
): Comment {
  const r = db.prepare(
    'INSERT INTO comments (exercise_id, version_id, anchor, kind, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *',
  ).get(c.exerciseId, c.versionId, c.anchor ? JSON.stringify(c.anchor) : null, c.kind, now()) as Row;
  return toComment(r);
}
export function updateComment(
  db: Db, id: Id, patch: Partial<Pick<Comment, 'anchor' | 'status' | 'changed' | 'versionId'>>,
): void {
  if (patch.anchor !== undefined) {
    db.prepare('UPDATE comments SET anchor = ? WHERE id = ?').run(patch.anchor ? JSON.stringify(patch.anchor) : null, id);
  }
  if (patch.status !== undefined) db.prepare('UPDATE comments SET status = ? WHERE id = ?').run(patch.status, id);
  if (patch.changed !== undefined) db.prepare('UPDATE comments SET changed = ? WHERE id = ?').run(patch.changed ? 1 : 0, id);
  if (patch.versionId !== undefined) db.prepare('UPDATE comments SET version_id = ? WHERE id = ?').run(patch.versionId, id);
}
export function deleteComment(db: Db, id: Id): void {
  const c = getComment(db, id);
  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  if (c) reindexExercise(db, c.exerciseId);
}
export function listComments(db: Db, exerciseId: Id): Comment[] {
  return (db.prepare('SELECT * FROM comments WHERE exercise_id = ? ORDER BY id').all(exerciseId) as Row[]).map(toComment);
}
export function getComment(db: Db, id: Id): Comment | null {
  const r = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Row | undefined;
  return r ? toComment(r) : null;
}

// ---------- messages ----------
export function addMessage(db: Db, commentId: Id, role: Message['role'], content: string): Message {
  const r = db.prepare('INSERT INTO messages (comment_id, role, content, created_at) VALUES (?, ?, ?, ?) RETURNING *')
    .get(commentId, role, content, now()) as Row;
  const c = getComment(db, commentId);
  if (c) reindexExercise(db, c.exerciseId);
  return toMessage(r);
}
export function listMessages(db: Db, commentId: Id): Message[] {
  return (db.prepare('SELECT * FROM messages WHERE comment_id = ? ORDER BY id').all(commentId) as Row[]).map(toMessage);
}

// ---------- library ----------
export function getLibraryTree(db: Db): LibraryTree {
  const subjects = (db.prepare('SELECT * FROM subjects ORDER BY position, id').all() as Row[]).map(toSubject);
  const chapters = (db.prepare('SELECT * FROM chapters ORDER BY position, id').all() as Row[]).map(toChapter);
  const exercises = (db.prepare('SELECT id, chapter_id, title, parent_id FROM exercises ORDER BY id').all() as Row[]);
  return {
    subjects: subjects.map((s) => ({
      ...s,
      chapters: chapters.filter((c) => c.subjectId === s.id).map((c) => ({
        ...c,
        exercises: exercises.filter((e) => Number(e.chapter_id) === c.id)
          .map((e) => ({ id: Number(e.id), title: String(e.title), parentId: nullableNum(e.parent_id) })),
      })),
    })),
  };
}
