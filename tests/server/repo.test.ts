import * as repo from '../../server/db/repo';
import { migrate } from '../../server/db/schema';
import { memDb, seedExercise } from './dbHelpers';

const anchor = { exact: 'u', prefix: '', suffix: '', start: 0, end: 1, kind: 'text' as const };
const base = { reason: 'initial' as const, triggerCommentId: null, instruction: null };

test('deleteExercise cascades to versions, comments, messages, attachments rows and child exercises', () => {
  const db = memDb();
  const { c, e } = seedExercise(db);
  const v = repo.addVersion(db, { ...base, exerciseId: e.id, markdown: 'u' });
  const cm = repo.createComment(db, { exerciseId: e.id, versionId: v.id, anchor, kind: 'passage' });
  repo.addMessage(db, cm.id, 'user', 'pourquoi ?');
  repo.addAttachment(db, { exerciseId: e.id, fileName: 'a.png', mime: 'image/png', relPath: 'fichiers/1/a.png', size: 3, extractedText: null });
  const child = repo.createExercise(db, { chapterId: c.id, title: 'var', statementText: 'x', parentId: e.id });
  repo.deleteExercise(db, e.id);
  expect(repo.getExercise(db, child.id)).toBeNull();
  expect(repo.listVersions(db, e.id)).toEqual([]);
  expect(repo.getComment(db, cm.id)).toBeNull();
  expect(repo.listMessages(db, cm.id)).toEqual([]);
  expect(repo.listAttachments(db, e.id)).toEqual([]);
});

test('addVersion numbers 1,2,3 per exercise and currentVersion returns the highest', () => {
  const db = memDb();
  const { c, e } = seedExercise(db);
  const other = repo.createExercise(db, { chapterId: c.id, title: 'B', statementText: '' });
  repo.addVersion(db, { ...base, exerciseId: e.id, markdown: 'a' });
  repo.addVersion(db, { ...base, exerciseId: other.id, markdown: 'z' });
  repo.addVersion(db, { ...base, exerciseId: e.id, markdown: 'b' });
  const v3 = repo.addVersion(db, { ...base, exerciseId: e.id, markdown: 'c' });
  expect(repo.listVersions(db, e.id).map((v) => v.number)).toEqual([1, 2, 3]);
  expect(repo.currentVersion(db, e.id)).toEqual(v3);
  expect(repo.currentVersion(db, other.id)?.number).toBe(1);
});

test('getLibraryTree nests subjects > chapters > exercises with children carrying parentId', () => {
  const db = memDb();
  const { s, c, e } = seedExercise(db);
  const child = repo.createExercise(db, { chapterId: c.id, title: 'var', statementText: '', parentId: e.id });
  const tree = repo.getLibraryTree(db);
  expect(tree.subjects).toHaveLength(1);
  expect(tree.subjects[0].id).toBe(s.id);
  expect(tree.subjects[0].chapters[0].exercises).toEqual([
    { id: e.id, title: 'Exo 1', parentId: null },
    { id: child.id, title: 'var', parentId: e.id },
  ]);
});

test('migrate is idempotent (calling twice does not throw)', () => {
  const db = memDb();
  expect(() => { migrate(db); migrate(db); }).not.toThrow();
});

test('comment round-trips anchor JSON and boolean changed', () => {
  const db = memDb();
  const { e } = seedExercise(db);
  const v = repo.addVersion(db, { ...base, exerciseId: e.id, markdown: 'u' });
  const cm = repo.createComment(db, { exerciseId: e.id, versionId: v.id, anchor, kind: 'passage' });
  expect(cm.status).toBe('open');
  expect(cm.changed).toBe(false);
  repo.updateComment(db, cm.id, { changed: true, status: 'detached' });
  expect(repo.getComment(db, cm.id)).toMatchObject({ anchor, changed: true, status: 'detached' });
});

test('deleteSubject cascades to chapters and exercises', () => {
  const db = memDb();
  const { s, e } = seedExercise(db);
  repo.deleteSubject(db, s.id);
  expect(repo.getExercise(db, e.id)).toBeNull();
  expect(repo.getLibraryTree(db).subjects).toEqual([]);
});
