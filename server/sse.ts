import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ERROR_MESSAGES_FR, type ClaudeProvider, type ClaudeRequest } from './claude/provider';

/**
 * Streams one Claude call to the browser as SSE:
 *   event: delta {text}*  then exactly one of  event: done {payload}  |  event: error {code, message}
 * `onDone` runs only when Claude finished successfully; nothing is saved otherwise.
 * Closing the browser tab aborts the call (the CLI process is killed).
 */
export function streamProvider(
  c: Context,
  provider: ClaudeProvider,
  request: Omit<ClaudeRequest, 'signal'>,
  onDone: (fullText: string) => unknown | Promise<unknown>,
  /** Cleanup when the call does not finish successfully (error, interruption, closed tab). */
  onFail?: () => void,
) {
  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    stream.onAbort(() => ac.abort());
    let succeeded = false;
    try {
      for await (const e of provider.send({ ...request, signal: ac.signal })) {
        if (ac.signal.aborted) return;
        if (e.type === 'text') {
          await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: e.text }) });
        } else if (e.type === 'done') {
          const payload = await onDone(e.fullText);
          succeeded = true;
          await stream.writeSSE({ event: 'done', data: JSON.stringify(payload) });
          return;
        } else {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ code: e.code, message: e.message }) });
          return;
        }
      }
      if (!ac.signal.aborted) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ code: 'interrupted', message: ERROR_MESSAGES_FR.interrupted }) });
      }
    } catch (err) {
      console.error(err);
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ code: 'unknown', message: ERROR_MESSAGES_FR.unknown }) });
    } finally {
      if (!succeeded) {
        try { onFail?.(); } catch (err) { console.error(err); }
      }
    }
  });
}
