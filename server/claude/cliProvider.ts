/*
 * Calls the Claude Code CLI in print mode with the user's own subscription.
 *
 * Flags used (to re-check with `claude --help` once the CLI is installed — plan Task 14):
 *   -p                              non-interactive, prompt read from stdin
 *   --output-format stream-json     one JSON event per line (needs --verbose)
 *   --include-partial-messages      text deltas while the answer is written
 *   --append-system-prompt <text>   the app's instructions
 *   --tools Read                    only file reading is available to Claude
 *   --add-dir <dir>                 folders Claude may read (the exercise attachments)
 *   --model <id>                    only when the user picked a model
 *   --no-session-persistence        do not keep a transcript of the call on disk
 *   --strict-mcp-config             ignore the user's MCP servers (fewer tokens, no side effects)
 *   --disable-slash-commands        do not load the user's skills (fewer tokens)
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ERROR_MESSAGES_FR, type ClaudeErrorCode, type ClaudeEvent, type ClaudeProvider, type ClaudeRequest } from './provider';

export interface CliProviderOptions {
  cwd: string;
  command?: string;
  spawnFn?: typeof nodeSpawn;
}

export function buildArgs(req: ClaudeRequest): string[] {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--append-system-prompt', req.systemPrompt,
    '--tools', 'Read',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--disable-slash-commands',
  ];
  for (const dir of req.readableDirs) args.push('--add-dir', dir);
  if (req.model) args.push('--model', req.model);
  return args;
}

function classify(text: string): ClaudeErrorCode {
  if (/log ?in|authenticat|api key|credential/i.test(text)) return 'not_logged_in';
  if (/limit|quota|rate/i.test(text)) return 'usage_limit';
  return 'unknown';
}

function errorEvent(code: ClaudeErrorCode, detail?: string): ClaudeEvent {
  const base = ERROR_MESSAGES_FR[code];
  return { type: 'error', code, message: detail && code === 'unknown' ? `${base} ${detail}` : base };
}

/** Minimal push/pull queue turning callbacks into an async iterator. */
function channel<T>() {
  const items: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  return {
    push(item: T) { if (!closed) { items.push(item); wake?.(); } },
    close() { closed = true; wake?.(); },
    async *iterate(): AsyncGenerator<T> {
      while (true) {
        if (items.length) { yield items.shift()!; continue; }
        if (closed) return;
        await new Promise<void>((r) => { wake = r; });
        wake = null;
      }
    },
  };
}

export function createCliProvider(opts: CliProviderOptions): ClaudeProvider {
  const spawnFn = opts.spawnFn ?? nodeSpawn;
  const command = opts.command ?? 'claude';

  return {
    send(req: ClaudeRequest): AsyncIterable<ClaudeEvent> {
      const ch = channel<ClaudeEvent>();
      let finished = false;
      const end = (e: ClaudeEvent) => { if (!finished) { finished = true; ch.push(e); ch.close(); } };

      if (req.signal?.aborted) { end(errorEvent('interrupted')); return ch.iterate(); }

      const child = spawnFn(command, buildArgs(req), { cwd: opts.cwd, shell: false, windowsHide: true });
      let stderr = '';
      let text = '';
      let sawDelta = false;
      let resultEvent: ClaudeEvent | null = null;

      const onAbort = () => { child.kill(); end(errorEvent('interrupted')); };
      req.signal?.addEventListener('abort', onAbort, { once: true });

      child.on('error', (err: NodeJS.ErrnoException) => {
        end(err.code === 'ENOENT' ? errorEvent('not_installed') : errorEvent('unknown', err.message));
      });
      child.stderr?.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-2000); });

      if (child.stdout) {
        createInterface({ input: child.stdout }).on('line', (line) => {
          if (finished || !line.trim()) return;
          let msg: any;
          try { msg = JSON.parse(line); } catch { return; }
          if (msg.type === 'stream_event' && msg.event?.type === 'content_block_delta' && msg.event.delta?.type === 'text_delta') {
            sawDelta = true;
            text += msg.event.delta.text;
            ch.push({ type: 'text', text: msg.event.delta.text });
          } else if (msg.type === 'assistant' && !sawDelta) {
            const parts = (msg.message?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => String(b.text));
            for (const p of parts) { text += p; ch.push({ type: 'text', text: p }); }
          } else if (msg.type === 'stream_event' && msg.event?.type === 'message_start') {
            sawDelta = false;
          } else if (msg.type === 'result') {
            const resultText = typeof msg.result === 'string' ? msg.result : '';
            resultEvent = msg.is_error
              ? errorEvent(classify(resultText || stderr), resultText || stderr.trim())
              : { type: 'done', fullText: resultText || text };
          }
        });
      }

      child.on('close', (code: number | null) => {
        req.signal?.removeEventListener('abort', onAbort);
        if (resultEvent) return end(resultEvent);
        if (code === 0) return end({ type: 'done', fullText: text });
        end(errorEvent(classify(stderr), stderr.trim().split('\n').slice(-3).join(' ')));
      });

      child.stdin?.on('error', () => {});
      child.stdin?.end(req.prompt);
      return ch.iterate();
    },
  };
}
