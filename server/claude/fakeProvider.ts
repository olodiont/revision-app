import type { ClaudeEvent, ClaudeProvider, ClaudeRequest } from './provider';

/** Scripted provider for tests: records every request and replays the scripted events. */
export function createFakeProvider(script: (req: ClaudeRequest) => ClaudeEvent[]): ClaudeProvider & { calls: ClaudeRequest[] } {
  const calls: ClaudeRequest[] = [];
  return {
    calls,
    async *send(req: ClaudeRequest) {
      calls.push(req);
      for (const e of script(req)) {
        if (req.signal?.aborted) {
          yield { type: 'error', code: 'interrupted', message: 'La réponse a été interrompue.' } as ClaudeEvent;
          return;
        }
        await new Promise((r) => setImmediate(r));
        yield e;
      }
    },
  };
}

/** Events for a successful answer streamed in two chunks. */
export function answer(text: string): ClaudeEvent[] {
  const mid = Math.floor(text.length / 2);
  return [{ type: 'text', text: text.slice(0, mid) }, { type: 'text', text: text.slice(mid) }, { type: 'done', fullText: text }];
}
