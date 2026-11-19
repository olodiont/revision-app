import { strFromU8, unzipSync } from 'fflate';
import { createAnchor } from '../../shared/anchor';
import type { Comment, CorrectionVersion, Exercise, Message } from '../../shared/types';
import { exerciseToMarkdown } from '../../server/export/markdown';
import { answer, createFakeProvider } from '../../server/claude/fakeProvider';
import { fileForm } from './fixtures';
import { seedViaApi, testApp } from './helpers';

const ex: Exercise = { id: 3, chapterId: 1, parentId: null, title: 'Exo 3', statementText: 'Calculer.', statementTranscription: null, createdAt: '' };
const md = 'On pose u = ln x.\n\nPuis on conclut.';
const v: CorrectionVersion = { id: 1, exerciseId: 3, number: 1, markdown: md, reason: 'initial', triggerCommentId: null, instruction: null, createdAt: '' };
const comment = (id: number, over: Partial<Comment>): Comment => ({
  id, exerciseId: 3, versionId: 1, anchor: null, status: 'open', changed: false, kind: 'passage', createdAt: '', ...over,
});
const msg = (commentId: number, role: Message['role'], content: string): Message => ({ id: 0, commentId, role, content, createdAt: '' });

test('exerciseToMarkdown places footnote after the anchored passage and lists detached comments separately', () => {
  const s = md.indexOf('u = ln x');
  const out = exerciseToMarkdown(ex, v, [
    comment(1, { anchor: createAnchor(md, s, s + 8, 'text') }),
    comment(2, { status: 'detached', anchor: createAnchor('vieux texte', 0, 5, 'text') }),
  ], {
    1: [msg(1, 'user', 'Pourquoi u ?'), msg(1, 'assistant', 'Parce que.\nDeuxième ligne.')],
    2: [msg(2, 'user', 'Question perdue')],
  }, []);
  expect(out).toContain('# Exo 3');
  expect(out).toContain('## Énoncé\n\nCalculer.');
  expect(out).toContain('On pose u = ln x[^c1].');
  expect(out).toContain('[^c1]: **Moi :** Pourquoi u ?');
  expect(out).toContain('    **Claude :** Parce que.\n    Deuxième ligne.');
  expect(out).toMatch(/## Autres commentaires[\s\S]*Question perdue/);
  expect(out).not.toContain('[^c2]');
});

test('exerciseToMarkdown links attachments under fichiers/<id>/', () => {
  const out = exerciseToMarkdown(ex, null, [], {}, [
    { id: 1, exerciseId: 3, fileName: 'sujet.png', mime: 'image/png', relPath: 'fichiers/3/sujet.png', size: 1, extractedText: null },
  ]);
  expect(out).toContain('![sujet.png](fichiers/3/sujet.png)');
  expect(out).toContain("_Pas encore de correction._");
});

test('export subject zip contains one .md per exercise and attachment files', async () => {
  const provider = createFakeProvider(() => answer('===CORRECTION===\nOn pose u.'));
  const t = testApp({ provider });
  const { s, c } = await seedViaApi(t.json);
  const png = new Uint8Array([1, 2, 3]);
  const e1 = (await t.json('POST', '/api/exercises', fileForm({ chapterId: String(c.id), title: 'Exo/1', statementText: 'a' }, [{ name: 'p.png', type: 'image/png', bytes: png }]))).body.exercise;
  await t.json('POST', '/api/exercises', fileForm({ chapterId: String(c.id), title: 'Exo 2', statementText: 'b' }, []));
  await (await t.app.request(`/api/exercises/${e1.id}/generate`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).text();

  const res = await t.app.request(`/api/export/subject/${s.id}`);
  expect(res.headers.get('content-type')).toBe('application/zip');
  expect(res.headers.get('content-disposition')).toContain('Maths');
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const names = Object.keys(files).sort();
  expect(names).toEqual(['Intégrales/Exo 2.md', 'Intégrales/Exo_1.md', `Intégrales/fichiers/${e1.id}/p.png`]);
  expect(strFromU8(files['Intégrales/Exo_1.md'])).toContain('On pose u.');
  expect(files[`Intégrales/fichiers/${e1.id}/p.png`]).toEqual(png);
});

test('export exercise returns a zip with its markdown', async () => {
  const t = testApp({ provider: createFakeProvider(() => []) });
  const { c } = await seedViaApi(t.json);
  const e = (await t.json('POST', '/api/exercises', fileForm({ chapterId: String(c.id), title: 'Seul', statementText: 'x' }, []))).body.exercise;
  const files = unzipSync(new Uint8Array(await (await t.app.request(`/api/export/exercise/${e.id}`)).arrayBuffer()));
  expect(Object.keys(files)).toEqual(['Seul.md']);
});
