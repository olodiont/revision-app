import { createAnchor } from '../../shared/anchor';
import { answer, createFakeProvider } from '../../server/claude/fakeProvider';
import { fileForm } from './fixtures';
import { seedViaApi, testApp } from './helpers';

async function setupWithComment() {
  const provider = createFakeProvider(() => answer('===CORRECTION===\nOn pose u.'));
  const t = testApp({ provider });
  const { c } = await seedViaApi(t.json);
  const ex = (await t.json('POST', '/api/exercises', fileForm({ chapterId: String(c.id), title: 'E', statementText: '' }, []))).body.exercise;
  await (await t.app.request(`/api/exercises/${ex.id}/generate`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).text();
  await (await t.app.request('/api/comments', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ exerciseId: ex.id, anchor: createAnchor('On pose u.', 0, 7, 'text'), question: 'Q' }),
  })).text();
  const detail = (await t.json('GET', `/api/exercises/${ex.id}`)).body;
  return { ...t, ex, comment: detail.comments[0], provider };
}

test('PATCH /api/comments/:id toggles resolved/open without calling Claude', async () => {
  const t = await setupWithComment();
  const calls = t.provider.calls.length;
  await t.json('PATCH', `/api/comments/${t.comment.id}`, { status: 'resolved' });
  expect((await t.json('GET', `/api/exercises/${t.ex.id}`)).body.comments[0].status).toBe('resolved');
  await t.json('PATCH', `/api/comments/${t.comment.id}`, { status: 'open' });
  expect((await t.json('GET', `/api/exercises/${t.ex.id}`)).body.comments[0].status).toBe('open');
  expect(t.provider.calls.length).toBe(calls);
});

test('PATCH /api/comments/:id refuses other statuses', async () => {
  const t = await setupWithComment();
  expect((await t.json('PATCH', `/api/comments/${t.comment.id}`, { status: 'detached' })).status).toBe(400);
});

test('DELETE /api/comments/:id removes the comment and its messages', async () => {
  const t = await setupWithComment();
  await t.json('DELETE', `/api/comments/${t.comment.id}`);
  const detail = (await t.json('GET', `/api/exercises/${t.ex.id}`)).body;
  expect(detail.comments).toEqual([]);
});
