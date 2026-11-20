import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createCliProvider } from '../../server/claude/cliProvider';
import type { ClaudeEvent, ClaudeRequest } from '../../server/claude/provider';

interface FakeChild extends EventEmitter {
  stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; killed: boolean; kill: () => boolean;
}

function fakeSpawn(script: (child: FakeChild) => void) {
  const calls: { cmd: string; args: string[]; opts: any; stdinText: () => string }[] = [];
  const spawnFn = ((cmd: string, args: string[], opts: any) => {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.killed = false;
    let stdinText = '';
    child.stdin.on('data', (d) => { stdinText += d.toString(); });
    child.kill = () => { child.killed = true; setImmediate(() => child.emit('close', null, 'SIGTERM')); return true; };
    calls.push({ cmd, args, opts, stdinText: () => stdinText });
    setImmediate(() => script(child));
    return child;
  }) as any;
  return { spawnFn, calls };
}

const line = (o: unknown) => JSON.stringify(o) + '\n';
const delta = (text: string) => line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const result = (text: string, isError = false) => line({ type: 'result', subtype: isError ? 'error_during_execution' : 'success', is_error: isError, result: text });

function finish(child: FakeChild, out: string, code = 0) {
  child.stdout.end(out);
  child.stderr.end();
  setImmediate(() => child.emit('close', code, null));
}

const req = (over: Partial<ClaudeRequest> = {}): ClaudeRequest => ({
  systemPrompt: 'SYS', prompt: 'Bonjour', readableDirs: ['C:/data/fichiers/1'], files: [], model: null, ...over,
});

async function collect(it: AsyncIterable<ClaudeEvent>): Promise<ClaudeEvent[]> {
  const out: ClaudeEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

test('spawns claude with -p, stream-json, appended system prompt, Read-only tools, add-dir per readableDir, model when set; prompt written to stdin', async () => {
  const { spawnFn, calls } = fakeSpawn((c) => finish(c, result('ok')));
  const p = createCliProvider({ cwd: 'C:/data/claude-cwd', spawnFn });
  await collect(p.send(req({ model: 'claude-opus-5-5' })));
  const { cmd, args, opts } = calls[0];
  expect(cmd).toBe('claude');
  expect(args).toContain('-p');
  expect(args.join(' ')).toContain('--output-format stream-json');
  expect(args).toContain('--verbose');
  expect(args).toContain('--include-partial-messages');
  expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('SYS');
  expect(args[args.indexOf('--tools') + 1]).toBe('Read');
  expect(args[args.indexOf('--add-dir') + 1]).toBe('C:/data/fichiers/1');
  expect(args[args.indexOf('--model') + 1]).toBe('claude-opus-5-5');
  expect(args).toContain('--no-session-persistence');
  // The user's own Claude Code settings (allow rules, hooks) must not apply to the app's calls.
  expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
  expect(args).toContain('--strict-mcp-config');
  expect(args).toContain('--disable-slash-commands');
  expect(args).not.toContain('Bonjour');
  expect(opts.cwd).toBe('C:/data/claude-cwd');
  expect(opts.shell).toBe(false);
  expect(calls[0].stdinText()).toBe('Bonjour');
});

test('omits --model when model is null', async () => {
  const { spawnFn, calls } = fakeSpawn((c) => finish(c, result('ok')));
  await collect(createCliProvider({ cwd: '.', spawnFn }).send(req()));
  expect(calls[0].args).not.toContain('--model');
});

test('text_delta stream events yield text events in order, result success yields done with full text', async () => {
  const { spawnFn } = fakeSpawn((c) => finish(c, delta('Bon') + delta('jour') + line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Bonjour' }] } }) + result('Bonjour')));
  const events = await collect(createCliProvider({ cwd: '.', spawnFn }).send(req()));
  expect(events).toEqual([
    { type: 'text', text: 'Bon' }, { type: 'text', text: 'jour' }, { type: 'done', fullText: 'Bonjour' },
  ]);
});

test('assistant message without partial deltas still yields its text', async () => {
  const { spawnFn } = fakeSpawn((c) => finish(c, line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Salut' }] } }) + result('Salut')));
  const events = await collect(createCliProvider({ cwd: '.', spawnFn }).send(req()));
  expect(events).toEqual([{ type: 'text', text: 'Salut' }, { type: 'done', fullText: 'Salut' }]);
});

test('ENOENT on spawn yields error not_installed', async () => {
  const { spawnFn } = fakeSpawn((c) => c.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })));
  const events = await collect(createCliProvider({ cwd: '.', spawnFn }).send(req()));
  expect(events.at(-1)).toMatchObject({ type: 'error', code: 'not_installed' });
});

test('result is_error with text matching /log ?in|authenticat/i yields not_logged_in', async () => {
  const { spawnFn } = fakeSpawn((c) => finish(c, result('Invalid API key · Please run /login', true), 1));
  const events = await collect(createCliProvider({ cwd: '.', spawnFn }).send(req()));
  expect(events.at(-1)).toMatchObject({ type: 'error', code: 'not_logged_in' });
});

test('result is_error with text matching /limit|quota|rate/i yields usage_limit', async () => {
  const { spawnFn } = fakeSpawn((c) => finish(c, result('Claude AI usage limit reached|1700000000', true), 1));
  const events = await collect(createCliProvider({ cwd: '.', spawnFn }).send(req()));
  expect(events.at(-1)).toMatchObject({ type: 'error', code: 'usage_limit', message: expect.stringContaining('Limite') });
});

test('non-zero exit without result yields error unknown with stderr tail', async () => {
  const { spawnFn } = fakeSpawn((c) => { c.stderr.end('boom: something broke'); c.stdout.end(); setImmediate(() => c.emit('close', 2, null)); });
  const events = await collect(createCliProvider({ cwd: '.', spawnFn }).send(req()));
  expect(events.at(-1)).toMatchObject({ type: 'error', code: 'unknown', message: expect.stringContaining('boom') });
});

test('aborting the signal kills the child and yields interrupted', async () => {
  let child: FakeChild | undefined;
  const { spawnFn } = fakeSpawn((c) => { child = c; c.stdout.write(delta('début')); });
  const ac = new AbortController();
  const events: ClaudeEvent[] = [];
  for await (const e of createCliProvider({ cwd: '.', spawnFn }).send(req({ signal: ac.signal }))) {
    events.push(e);
    if (e.type === 'text') ac.abort();
  }
  expect(child?.killed).toBe(true);
  expect(events.at(-1)).toMatchObject({ type: 'error', code: 'interrupted' });
});

test('malformed JSON line is skipped, not fatal', async () => {
  const { spawnFn } = fakeSpawn((c) => finish(c, '{not json\n' + delta('ok') + result('ok')));
  const events = await collect(createCliProvider({ cwd: '.', spawnFn }).send(req()));
  expect(events.map((e) => e.type)).toEqual(['text', 'done']);
});
