import * as repo from '../../server/db/repo';
import { search } from '../../server/db/search';
import { memDb, seedExercise } from './dbHelpers';

const base = { reason: 'initial' as const, triggerCommentId: null, instruction: null };

test('search finds a word from the current correction and from a comment message, not from an old version', () => {
  const db = memDb();
  const { e } = seedExercise(db);
  repo.addVersion(db, { ...base, exerciseId: e.id, markdown: 'ancienne méthode zorglub' });
  const v2 = repo.addVersion(db, { ...base, exerciseId: e.id, markdown: 'intégration par parties' });
  const cm = repo.createComment(db, { exerciseId: e.id, versionId: v2.id, anchor: null, kind: 'passage' });
  repo.addMessage(db, cm.id, 'user', 'pourquoi la dérivée de bidule');
  expect(search(db, 'parties').map((h) => h.exerciseId)).toEqual([e.id]);
  expect(search(db, 'bidule')[0]).toMatchObject({ exerciseId: e.id, source: 'comment' });
  expect(search(db, 'zorglub')).toEqual([]);
});

test('search query with FTS syntax characters like "u = ln(x)" does not throw', () => {
  const db = memDb();
  seedExercise(db);
  expect(() => search(db, 'u = ln(x) "AND" *')).not.toThrow();
  expect(search(db, '   ')).toEqual([]);
});

test('search finds the title and the transcription', () => {
  const db = memDb();
  const { e } = seedExercise(db, 'TD4 primitives');
  repo.updateExercise(db, e.id, { statementTranscription: 'Soit f définie sur R' });
  expect(search(db, 'primitives')[0]).toMatchObject({ source: 'title' });
  expect(search(db, 'définie')[0]).toMatchObject({ source: 'statement' });
});

test('search is accent-insensitive', () => {
  const db = memDb();
  const { e } = seedExercise(db);
  repo.addVersion(db, { ...base, exerciseId: e.id, markdown: 'dérivée seconde' });
  expect(search(db, 'derivee').map((h) => h.exerciseId)).toEqual([e.id]);
});
