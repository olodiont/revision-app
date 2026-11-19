import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createAnchor } from '../../shared/anchor';
import { answer, createFakeProvider } from '../../server/claude/fakeProvider';
import type { ClaudeEvent, ClaudeRequest } from '../../server/claude/provider';
import { fileForm } from './fixtures';
import { seedViaApi, testApp } from './helpers';

const CORR = 'Étape 1 : on pose u = ln x.\n\nÉtape 2 : on dérive, du = dx/x.\n\nÉtape 3 : conclusion.';
const fail: ClaudeEvent[] = [{ type: 'error', code: 'usage_limit', message: 'Limite' }];

async function setup(next: () => ClaudeEvent[]) {
  let first = true;
  const provider = createFakeProvider((_req: ClaudeRequest) => {
    if (first) { first = false; return answer(`===CORRECTION===\n${CORR}`); }
    return next();
  });
  const t = testApp({ provider });
  const { c } = await seedViaApi(t.json);
  const ex = (await t.json('POST', '/api/exercises', fileForm({ chapterId: String(c.id), title: 'E', statementText: 'x' }, []))).body.exercise;
  await (await t.app.request(`/api/exercises/${ex.id}/generate`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).text();
  const post = async (path: string, body: unknown) => (await t.app.request(path, {
    method: 'POST', ...(body instanceof FormData ? { body } : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  })).text();
  return { ...t, ex, post, provider };
}

const anchorOf = (q: string) => { const s = CORR.indexOf(q); return createAnchor(CORR, s, s + q.length, 'text'); };

// I1 — retry must not duplicate comments or messages
test('a failed new comment stores nothing, so retrying creates exactly one comment', async () => {
  let n = 0;
  const t = await setup(() => (n++ === 0 ? fail : answer('réponse')));
  await t.post('/api/comments', { exerciseId: t.ex.id, anchor: anchorOf('on dérive'), question: 'Q' });
  expect((await t.json('GET', `/api/exercises/${t.ex.id}`)).body.comments).toEqual([]);
  await t.post('/api/comments', { exerciseId: t.ex.id, anchor: anchorOf('on dérive'), question: 'Q' });
  const d = (await t.json('GET', `/api/exercises/${t.ex.id}`)).body;
  expect(d.comments).toHaveLength(1);
  expect(d.messagesByComment[d.comments[0].id].map((m: any) => m.content)).toEqual(['Q', 'réponse']);
});

test('a failed follow-up stores no orphan question; retry adds the pair once', async () => {
  let n = 0;
  const t = await setup(() => (n++ === 1 ? fail : answer(`r${n}`)));
  await t.post('/api/comments', { exerciseId: t.ex.id, anchor: anchorOf('on dérive'), question: 'Q1' });
  const cid = (await t.json('GET', `/api/exercises/${t.ex.id}`)).body.comments[0].id;
  await t.post(`/api/comments/${cid}/messages`, { question: 'Q2' });
  await t.post(`/api/comments/${cid}/messages`, { question: 'Q2' });
  const msgs = (await t.json('GET', `/api/exercises/${t.ex.id}`)).body.messagesByComment[cid].map((m: any) => m.content);
  expect(msgs).toEqual(['Q1', 'r1', 'Q2', 'r3']);
});

test('a failed answer check stores no comment and removes its uploaded files', async () => {
  const t = await setup(() => fail);
  await t.post(`/api/exercises/${t.ex.id}/check`, fileForm({ answerText: 'x' }, [{ name: 'c.png', type: 'image/png', bytes: new Uint8Array([1]) }]));
  expect((await t.json('GET', `/api/exercises/${t.ex.id}`)).body.comments).toEqual([]);
  const dir = join(t.deps.config.dataDir, 'fichiers', String(t.ex.id), 'reponses');
  expect(!existsSync(dir) || readdirSync(dir).length === 0).toBe(true);
});

// I4 — stale fix must be refused
test('fix/accept with a stale range (text changed since the proposal) is refused with 409 and creates no version', async () => {
  const t = await setup(() => answer('===REMPLACEMENT===\nNOUVEAU TEXTE BEAUCOUP PLUS LONG QUE LE PASSAGE REMPLACÉ'));
  await t.post('/api/comments', { exerciseId: t.ex.id, anchor: anchorOf('on pose u = ln x'), question: 'A' });
  await t.post('/api/comments', { exerciseId: t.ex.id, anchor: anchorOf('conclusion'), question: 'B' });
  const [a, b] = (await t.json('GET', `/api/exercises/${t.ex.id}`)).body.comments;
  const pa = JSON.parse((await t.post(`/api/comments/${a.id}/fix`, {})).split('event: done\ndata: ')[1]).proposal;
  const pb = JSON.parse((await t.post(`/api/comments/${b.id}/fix`, {})).split('event: done\ndata: ')[1]).proposal;
  expect((await t.json('POST', `/api/comments/${a.id}/fix/accept`, pa)).status).toBe(200);
  const res = await t.json('POST', `/api/comments/${b.id}/fix/accept`, pb);
  expect(res.status).toBe(409);
  expect((await t.json('GET', `/api/exercises/${t.ex.id}`)).body.versions).toHaveLength(2);
});

// I5 — requests from other sites are refused
test('a POST carrying a foreign Origin is refused and does not call Claude', async () => {
  const t = await setup(() => answer('x'));
  const calls = t.provider.calls.length;
  const res = await t.app.request(`/api/exercises/${t.ex.id}/similar`, { method: 'POST', headers: { origin: 'http://evil.example' } });
  expect(res.status).toBe(403);
  expect(t.provider.calls.length).toBe(calls);
});

test('a request with a foreign Host (DNS rebinding) is refused', async () => {
  const t = testApp();
  const res = await t.app.request('http://evil.example:5317/api/library');
  expect(res.status).toBe(403);
});

test('same-origin requests from the app itself are accepted', async () => {
  const t = testApp();
  const res = await t.app.request('http://127.0.0.1:5317/api/library', { headers: { origin: 'http://127.0.0.1:5317' } });
  expect(res.status).toBe(200);
});
