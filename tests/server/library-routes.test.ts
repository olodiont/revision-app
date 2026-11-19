import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_FILE_BYTES, folderSize } from '../../server/files/storage';
import { fileForm, makeDocx } from './fixtures';
import { seedViaApi, testApp } from './helpers';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

test('POST /api/exercises with a .pptx keeps the exercise and reports rejected type', async () => {
  const { json } = testApp();
  const { c } = await seedViaApi(json);
  const res = await json('POST', '/api/exercises', fileForm(
    { chapterId: String(c.id), title: 'Exo', statementText: 'texte' },
    [{ name: 'slides.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: png },
     { name: 'photo.png', type: 'image/png', bytes: png }],
  ));
  expect(res.status).toBe(200);
  expect(res.body.exercise.title).toBe('Exo');
  expect(res.body.rejected).toEqual([{ fileName: 'slides.pptx', reason: 'type' }]);
  const detail = await json('GET', `/api/exercises/${res.body.exercise.id}`);
  expect(detail.body.attachments.map((a: any) => a.fileName)).toEqual(['photo.png']);
});

test('POST /api/exercises with a file over MAX_FILE_BYTES reports rejected size', async () => {
  const { json } = testApp();
  const { c } = await seedViaApi(json);
  const res = await json('POST', '/api/exercises', fileForm(
    { chapterId: String(c.id), title: 'Exo', statementText: '' },
    [{ name: 'gros.pdf', type: 'application/pdf', bytes: new Uint8Array(MAX_FILE_BYTES + 1) }],
  ));
  expect(res.body.rejected).toEqual([{ fileName: 'gros.pdf', reason: 'size' }]);
});

test('corrupt .docx is stored with extractedText null and exercise still created', async () => {
  const { json } = testApp();
  const { c } = await seedViaApi(json);
  const res = await json('POST', '/api/exercises', fileForm(
    { chapterId: String(c.id), title: 'Exo', statementText: '' },
    [{ name: 'casse.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: png }],
  ));
  const detail = await json('GET', `/api/exercises/${res.body.exercise.id}`);
  expect(detail.body.attachments[0]).toMatchObject({ fileName: 'casse.docx', extractedText: null });
});

test('valid .docx stores extractedText containing its paragraph text', async () => {
  const { json } = testApp();
  const { c } = await seedViaApi(json);
  const res = await json('POST', '/api/exercises', fileForm(
    { chapterId: String(c.id), title: 'Exo', statementText: '' },
    [{ name: 'td.docx', type: 'application/octet-stream', bytes: makeDocx('Exercice 3\nCalculer la primitive') }],
  ));
  const detail = await json('GET', `/api/exercises/${res.body.exercise.id}`);
  expect(detail.body.attachments[0].extractedText).toContain('Calculer la primitive');
  expect(detail.body.attachments[0].mime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

test('DELETE /api/exercises/:id removes fichiers/<id> folder', async () => {
  const { json, deps } = testApp();
  const { c } = await seedViaApi(json);
  const res = await json('POST', '/api/exercises', fileForm(
    { chapterId: String(c.id), title: 'Exo', statementText: '' }, [{ name: 'p.png', type: 'image/png', bytes: png }],
  ));
  const folder = join(deps.config.dataDir, 'fichiers', String(res.body.exercise.id));
  expect(existsSync(folder)).toBe(true);
  expect((await json('DELETE', `/api/exercises/${res.body.exercise.id}`)).status).toBe(200);
  expect(existsSync(folder)).toBe(false);
});

test('DELETE /api/subjects/:id removes attachment folders of its exercises', async () => {
  const { json, deps } = testApp();
  const { s, c } = await seedViaApi(json);
  const res = await json('POST', '/api/exercises', fileForm(
    { chapterId: String(c.id), title: 'Exo', statementText: '' }, [{ name: 'p.png', type: 'image/png', bytes: png }],
  ));
  await json('DELETE', `/api/subjects/${s.id}`);
  expect(existsSync(join(deps.config.dataDir, 'fichiers', String(res.body.exercise.id)))).toBe(false);
});

test('after rm -rf dataDir, GET /api/library returns empty tree with 200 and recreates revision.db', async () => {
  const { json, deps } = testApp();
  await seedViaApi(json);
  rmSync(deps.config.dataDir, { recursive: true, force: true });
  const res = await json('GET', '/api/library');
  expect(res.status).toBe(200);
  expect(res.body.subjects).toEqual([]);
  expect(existsSync(join(deps.config.dataDir, 'revision.db'))).toBe(true);
  expect(existsSync(join(deps.config.dataDir, 'fichiers'))).toBe(true);
  expect(existsSync(join(deps.config.dataDir, 'claude-cwd'))).toBe(true);
});

test('GET /api/attachments/:id streams the stored bytes', async () => {
  const { app, json } = testApp();
  const { c } = await seedViaApi(json);
  const res = await json('POST', '/api/exercises', fileForm(
    { chapterId: String(c.id), title: 'Exo', statementText: '' }, [{ name: 'p.png', type: 'image/png', bytes: png }],
  ));
  const detail = await json('GET', `/api/exercises/${res.body.exercise.id}`);
  const file = await app.request(`/api/attachments/${detail.body.attachments[0].id}`);
  expect(file.headers.get('content-type')).toBe('image/png');
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
});

test('GET /api/search finds an exercise by its statement', async () => {
  const { json } = testApp();
  const { c } = await seedViaApi(json);
  await json('POST', '/api/exercises', fileForm({ chapterId: String(c.id), title: 'Exo', statementText: 'primitive de ln' }, []));
  const res = await json('GET', '/api/search?q=primitive');
  expect(res.body).toHaveLength(1);
});

test('folderSize sums nested files and returns 0 for missing folder', () => {
  const { deps } = testApp();
  const d = join(deps.config.dataDir, 'x', 'y');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'a'), 'abc');
  writeFileSync(join(deps.config.dataDir, 'x', 'b'), 'de');
  expect(folderSize(join(deps.config.dataDir, 'x'))).toBe(5);
  expect(folderSize(join(deps.config.dataDir, 'nope'))).toBe(0);
});
