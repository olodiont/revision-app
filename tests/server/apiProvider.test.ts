import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { createApiProvider, DEFAULT_API_MODEL } from '../../server/claude/apiProvider';
import type { ClaudeEvent, ClaudeRequest } from '../../server/claude/provider';

const req = (over: Partial<ClaudeRequest> = {}): ClaudeRequest => ({
  systemPrompt: 'SYS', prompt: 'Bonjour', readableDirs: [], files: [], model: null, ...over,
});

async function collect(it: AsyncIterable<ClaudeEvent>): Promise<ClaudeEvent[]> {
  const out: ClaudeEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

/** A fake SDK stream: yields text deltas, then resolves the final message. */
function fakeStream(texts: string[], stop = 'end_turn') {
  return {
    async *[Symbol.asyncIterator]() {
      for (const t of texts) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } };
    },
    finalMessage: async () => ({ stop_reason: stop, content: [{ type: 'text', text: texts.join('') }] }),
  };
}

test('streams text deltas and ends with the full text', async () => {
  const streamFn = vi.fn(() => fakeStream(['Bon', 'jour']));
  const p = createApiProvider({ apiKey: () => 'sk-test', streamFn });
  expect(await collect(p.send(req()))).toEqual([
    { type: 'text', text: 'Bon' }, { type: 'text', text: 'jour' }, { type: 'done', fullText: 'Bonjour' },
  ]);
});

test('sends the system prompt, the chosen model or the default one, and the prompt text', async () => {
  const streamFn = vi.fn((_params: any, _opts: any) => fakeStream(['ok']));
  const p = createApiProvider({ apiKey: () => 'sk-test', streamFn });
  await collect(p.send(req()));
  const params = streamFn.mock.calls[0][0];
  expect(params.model).toBe(DEFAULT_API_MODEL);
  expect(JSON.stringify(params.system)).toContain('SYS');
  expect(params.messages[0].content.at(-1)).toEqual({ type: 'text', text: 'Bonjour' });
  await collect(p.send(req({ model: 'claude-sonnet-5-5' })));
  expect(streamFn.mock.calls[1][0].model).toBe('claude-sonnet-5-5');
});

test('attaches images and PDFs as base64 blocks before the text', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'api-'));
  writeFileSync(join(dir, 'a.png'), Buffer.from([1, 2, 3]));
  writeFileSync(join(dir, 'b.pdf'), Buffer.from('%PDF'));
  const streamFn = vi.fn((_params: any, _opts: any) => fakeStream(['ok']));
  const p = createApiProvider({ apiKey: () => 'sk-test', streamFn });
  await collect(p.send(req({ files: [join(dir, 'a.png'), join(dir, 'b.pdf')] })));
  const content = streamFn.mock.calls[0][0].messages[0].content;
  expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from([1, 2, 3]).toString('base64') } });
  expect(content[1]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
  expect(content[2].type).toBe('text');
});

test('without an API key it says so and calls nothing', async () => {
  const streamFn = vi.fn();
  const p = createApiProvider({ apiKey: () => null, streamFn });
  const events = await collect(p.send(req()));
  expect(events).toEqual([{ type: 'error', code: 'not_logged_in', message: expect.stringContaining('clé API') }]);
  expect(streamFn).not.toHaveBeenCalled();
});

test('maps an invalid key and a rate limit to French messages', async () => {
  const auth = new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }, 'x', new Headers());
  const p1 = createApiProvider({ apiKey: () => 'bad', streamFn: () => { throw auth; } });
  expect((await collect(p1.send(req()))).at(-1)).toMatchObject({ type: 'error', code: 'not_logged_in' });
  const rate = new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'x' } }, 'x', new Headers());
  const p2 = createApiProvider({ apiKey: () => 'k', streamFn: () => { throw rate; } });
  expect((await collect(p2.send(req()))).at(-1)).toMatchObject({ type: 'error', code: 'usage_limit' });
});

test('a refusal is reported as an error, not saved as an answer', async () => {
  const p = createApiProvider({ apiKey: () => 'k', streamFn: () => fakeStream([''], 'refusal') });
  expect((await collect(p.send(req()))).at(-1)).toMatchObject({ type: 'error', code: 'unknown' });
});

test('an aborted request ends as interrupted', async () => {
  const ac = new AbortController();
  ac.abort();
  const p = createApiProvider({ apiKey: () => 'k', streamFn: () => fakeStream(['x']) });
  expect((await collect(p.send(req({ signal: ac.signal })))).at(-1)).toMatchObject({ type: 'error', code: 'interrupted' });
});
