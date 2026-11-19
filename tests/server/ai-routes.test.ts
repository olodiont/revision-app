import { createAnchor } from '../../shared/anchor';
import { answer, createFakeProvider } from '../../server/claude/fakeProvider';
import type { ClaudeEvent, ClaudeProvider, ClaudeRequest } from '../../server/claude/provider';
import { fileForm } from './fixtures';
import { seedViaApi, testApp } from './helpers';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

interface SseEvent { event: string; data: any }

async function sse(app: ReturnType<typeof testApp>['app'], path: string, body: unknown): Promise<SseEvent[]> {
  const res = await app.request(path, {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  const text = await res.text();
  return text.split('\n\n').filter((b) => b.trim()).map((block) => {
    const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
    const data = /^data: (.*)$/m.exec(block)?.[1];
    return { event, data: data ? JSON.parse(data) : null };
  });
}
const done = (events: SseEvent[]) => events.find((e) => e.event === 'done')?.data;

async function setup(script: (req: ClaudeRequest) => ClaudeEvent[], files: { name: string; type: string; bytes: Uint8Array }[] = []) {
  const provider = createFakeProvider(script);
  const t = testApp({ provider });
  const { c } = await seedViaApi(t.json);
  const ex = (await t.json('POST', '/api/exercises', fileForm({ chapterId: String(c.id), title: 'Exo 3', statementText: 'Calculer' }, files))).body.exercise;
  return { ...t, provider, ex };
}

const CORR = 'Étape 1 : on pose u = ln x.\n\nÉtape 2 : on dérive, du = dx/x.\n\nÉtape 3 : conclusion.';

async function withVersion(script: (req: ClaudeRequest) => ClaudeEvent[] = () => answer(`===CORRECTION===\n${CORR}`)) {
  let turn = 0;
  const scripts: ((req: ClaudeRequest) => ClaudeEvent[])[] = [() => answer(`===CORRECTION===\n${CORR}`)];
  const t = await setup((req) => (scripts[turn++] ?? script)(req));
  await sse(t.app, `/api/exercises/${t.ex.id}/generate`, {});
  return t;
}

async function addComment(t: Awaited<ReturnType<typeof withVersion>>, quote: string, question = 'Pourquoi ?') {
  const start = CORR.indexOf(quote);
  const anchor = createAnchor(CORR, start, start + quote.length, 'text');
  return done(await sse(t.app, '/api/comments', { exerciseId: t.ex.id, anchor, question }));
}

test('generate stores version 1 from ===CORRECTION=== and transcription from ===ENONCE===', async () => {
  const t = await setup(() => answer('===ENONCE===\nSoit $f(x)=\\ln x$.\n===CORRECTION===\nOn pose u.'), [{ name: 's.png', type: 'image/png', bytes: png }]);
  const events = await sse(t.app, `/api/exercises/${t.ex.id}/generate`, { instruction: 'détaille' });
  expect(events.filter((e) => e.event === 'delta').length).toBeGreaterThan(0);
  expect(done(events).version).toMatchObject({ number: 1, markdown: 'On pose u.', reason: 'initial' });
  const detail = (await t.json('GET', `/api/exercises/${t.ex.id}`)).body;
  expect(detail.exercise.statementTranscription).toBe('Soit $f(x)=\\ln x$.');
  expect(t.provider.calls[0].prompt).toContain('détaille');
});

test('generate without markers stores whole text as correction', async () => {
  const t = await setup(() => answer('Réponse sans marqueur.'));
  const d = done(await sse(t.app, `/api/exercises/${t.ex.id}/generate`, {}));
  expect(d.version.markdown).toBe('Réponse sans marqueur.');
});

test('generate that ends in error stores no version and streams error event with French message', async () => {
  const t = await setup(() => [{ type: 'text', text: 'début…' }, { type: 'error', code: 'usage_limit', message: "Limite d'usage de ton abonnement atteinte. Réessaie plus tard." }]);
  const events = await sse(t.app, `/api/exercises/${t.ex.id}/generate`, {});
  expect(events.at(-1)).toMatchObject({ event: 'error', data: { code: 'usage_limit', message: expect.stringContaining('Limite') } });
  expect((await t.json('GET', `/api/exercises/${t.ex.id}`)).body.versions).toEqual([]);
});

test('comment creation saves user + assistant messages; provider received only this thread', async () => {
  const t = await withVersion((req) => answer(`réponse à: ${req.prompt.includes('PREMIER FIL') ? 'FUITE' : 'ok'}`));
  await addComment(t, 'on pose u = ln x', 'PREMIER FIL question');
  const d = await addComment(t, 'on dérive', 'deuxième question');
  expect(d.comment).toMatchObject({ status: 'open', kind: 'passage', anchor: { exact: 'on dérive' } });
  expect(d.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
  expect(d.messages[1].content).toBe('réponse à: ok');
  const last = t.provider.calls.at(-1)!;
  expect(last.prompt).toContain('on dérive');
  expect(last.prompt).not.toContain('PREMIER FIL');
});

test('follow-up message sends the previous messages of the same thread', async () => {
  const t = await withVersion(() => answer('suite'));
  const d = await addComment(t, 'on dérive', 'Q-UN');
  const d2 = done(await sse(t.app, `/api/comments/${d.comment.id}/messages`, { question: 'Q-DEUX' }));
  expect(d2.messages.map((m: any) => m.content)).toEqual(['Q-UN', 'suite', 'Q-DEUX', 'suite']);
  expect(t.provider.calls.at(-1)!.prompt).toContain('Q-UN');
});

test('comment on failed answer stores nothing (no orphan question)', async () => {
  const t = await withVersion(() => [{ type: 'error', code: 'unknown', message: 'Erreur de Claude Code.' }]);
  const start = CORR.indexOf('on dérive');
  const events = await sse(t.app, '/api/comments', { exerciseId: t.ex.id, anchor: createAnchor(CORR, start, start + 9, 'text'), question: 'Q' });
  expect(events.at(-1)!.event).toBe('error');
  const detail = (await t.json('GET', `/api/exercises/${t.ex.id}`)).body;
  expect(detail.comments).toEqual([]);
});

test('diagram request stores the diagram answer in the thread', async () => {
  const t = await withVersion(() => answer('```mermaid\nflowchart TD\n A-->B\n```'));
  const d = await addComment(t, 'on dérive');
  const d2 = done(await sse(t.app, `/api/comments/${d.comment.id}/diagram`, {}));
  expect(d2.messages.at(-1).content).toContain('```mermaid');
  expect(t.provider.calls.at(-1)!.prompt).toContain('schéma');
});

test('fix/accept creates version 2, resolves trigger, marks overlapping comment changed, detaches comment whose text vanished, keeps unrelated comment unchanged', async () => {
  const t = await withVersion(() => answer('===REMPLACEMENT===\non dérive : du = (1/x) dx'));
  const trigger = (await addComment(t, 'on dérive, du = dx/x')).comment;
  const overlapping = (await addComment(t, 'du = dx/x')).comment;
  const unrelated = (await addComment(t, 'conclusion')).comment;
  const proposal = done(await sse(t.app, `/api/comments/${trigger.id}/fix`, {})).proposal;
  expect(proposal.before).toBe('on dérive, du = dx/x');
  expect(proposal.after).toBe('on dérive : du = (1/x) dx');
  expect((await t.json('GET', `/api/exercises/${t.ex.id}`)).body.versions).toHaveLength(1);

  const acc = (await t.json('POST', `/api/comments/${trigger.id}/fix/accept`, { start: proposal.start, end: proposal.end, before: proposal.before, after: proposal.after })).body;
  expect(acc.version).toMatchObject({ number: 2, reason: 'fix', triggerCommentId: trigger.id });
  expect(acc.version.markdown).toContain('on dérive : du = (1/x) dx');
  const byId = Object.fromEntries(acc.comments.map((c: any) => [c.id, c]));
  expect(byId[trigger.id]).toMatchObject({ status: 'resolved', anchor: { exact: 'on dérive : du = (1/x) dx' }, versionId: acc.version.id });
  // Its text was rewritten: it is either re-attached with the "passage modifié" flag, or detached. Never silently unchanged.
  const ov = byId[overlapping.id];
  expect(ov.status === 'detached' || (ov.status === 'open' && ov.changed === true)).toBe(true);
  expect(byId[unrelated.id]).toMatchObject({ status: 'open', changed: false, anchor: { exact: 'conclusion' } });
});

test('fix/accept marks a fuzzy-matched comment changed', async () => {
  const t = await withVersion(() => answer('===REMPLACEMENT===\non pose u = ln(x)'));
  const trigger = (await addComment(t, 'on pose u = ln x')).comment;
  const inside = (await addComment(t, 'on pose u')).comment;
  const p = done(await sse(t.app, `/api/comments/${trigger.id}/fix`, {})).proposal;
  const acc = (await t.json('POST', `/api/comments/${trigger.id}/fix/accept`, p)).body;
  const c = acc.comments.find((x: any) => x.id === inside.id);
  expect(c).toMatchObject({ status: 'open', changed: true });
});

test('regenerate returns a proposal and stores nothing until accept', async () => {
  const t = await withVersion(() => answer('===CORRECTION===\nNouvelle version détaillée. Étape 3 : conclusion.'));
  const d = done(await sse(t.app, `/api/exercises/${t.ex.id}/regenerate`, { instruction: 'plus détaillée' }));
  expect(d.proposal).toBe('Nouvelle version détaillée. Étape 3 : conclusion.');
  expect((await t.json('GET', `/api/exercises/${t.ex.id}`)).body.versions).toHaveLength(1);
  const acc = (await t.json('POST', `/api/exercises/${t.ex.id}/regenerate/accept`, { proposal: d.proposal, instruction: 'plus détaillée' })).body;
  expect(acc.version).toMatchObject({ number: 2, reason: 'regenerate', instruction: 'plus détaillée' });
});

test('similar creates a child exercise with parentId and its own version 1', async () => {
  const t = await withVersion(() => answer('===ENONCE===\nCalculer ∫ x ln x dx\n===CORRECTION===\nOn pose u = ln x, dv = x dx.'));
  const d = done(await sse(t.app, `/api/exercises/${t.ex.id}/similar`, {}));
  expect(d.exercise).toMatchObject({ parentId: t.ex.id, chapterId: t.ex.chapterId, title: 'Exo 3 — variante 1', statementText: 'Calculer ∫ x ln x dx' });
  const child = (await t.json('GET', `/api/exercises/${d.exercise.id}`)).body;
  expect(child.versions[0]).toMatchObject({ number: 1, markdown: 'On pose u = ln x, dv = x dx.' });
});

test('check stores the answer files and a check-answer thread', async () => {
  const t = await withVersion(() => answer('Ta réponse est juste jusqu\'à l\'étape 2.'));
  const d = done(await sse(t.app, `/api/exercises/${t.ex.id}/check`, fileForm({ answerText: 'x = 2' }, [{ name: 'copie.png', type: 'image/png', bytes: png }])));
  expect(d.comment).toMatchObject({ kind: 'check-answer', anchor: null });
  expect(d.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
  const req = t.provider.calls.at(-1)!;
  expect(req.prompt).toContain('x = 2');
  expect(req.readableDirs.some((d) => d.replace(/\\/g, '/').endsWith('/reponses'))).toBe(true);
});

test('no GET endpoint calls the provider', async () => {
  const t = await withVersion();
  const before = t.provider.calls.length;
  await t.json('GET', '/api/library');
  await t.json('GET', `/api/exercises/${t.ex.id}`);
  await t.json('GET', '/api/search?q=x');
  expect(t.provider.calls.length).toBe(before);
});

test('client abort propagates to provider signal', async () => {
  let sawAbort = false;
  const provider: ClaudeProvider = {
    async *send(req) {
      yield { type: 'text', text: 'début' };
      if (req.signal?.aborted) sawAbort = true;
      else await new Promise<void>((r) => req.signal?.addEventListener('abort', () => { sawAbort = true; r(); }));
      yield { type: 'error', code: 'interrupted', message: 'x' };
    },
  };
  const t = testApp({ provider });
  const { c } = await seedViaApi(t.json);
  const ex = (await t.json('POST', '/api/exercises', fileForm({ chapterId: String(c.id), title: 'E', statementText: '' }, []))).body.exercise;
  const res = await t.app.request(`/api/exercises/${ex.id}/generate`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  const reader = res.body!.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((r) => setTimeout(r, 20));
  expect(sawAbort).toBe(true);
  expect((await t.json('GET', `/api/exercises/${ex.id}`)).body.versions).toEqual([]);
});
