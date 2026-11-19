import { createPresence } from '../../server/presence';
import { testApp } from './helpers';

test('GET /api/presence keeps a page registered while the stream is open, and releases it when the page closes', async () => {
  const left = vi.fn();
  const join = vi.fn(() => left);
  const { app } = testApp({ presence: { join } });
  const res = await app.request('/api/presence');
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  await reader.read();
  expect(join).toHaveBeenCalledTimes(1);
  expect(left).not.toHaveBeenCalled();
  await reader.cancel();
  await new Promise((r) => setTimeout(r, 20));
  expect(left).toHaveBeenCalledTimes(1);
});

function clock() {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  return {
    setTimeout: (fn: () => void, ms: number) => { const id = next++; timers.push({ at: now + ms, fn, id }); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimeout: (id: ReturnType<typeof setTimeout>) => { const i = timers.findIndex((t) => t.id === (id as unknown as number)); if (i >= 0) timers.splice(i, 1); },
    advance(ms: number) {
      now += ms;
      for (const t of [...timers].sort((a, b) => a.at - b.at)) {
        if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.fn(); }
      }
    },
  };
}

test('the server stops a few seconds after the last app page is closed', () => {
  const c = clock();
  const onIdle = vi.fn();
  const p = createPresence({ graceMs: 5000, onIdle, timers: c });
  const leave = p.join();
  c.advance(60_000);
  expect(onIdle).not.toHaveBeenCalled();
  leave();
  c.advance(4000);
  expect(onIdle).not.toHaveBeenCalled();
  c.advance(1500);
  expect(onIdle).toHaveBeenCalledTimes(1);
});

test('reloading the page (close then reopen within the grace period) keeps the server running', () => {
  const c = clock();
  const onIdle = vi.fn();
  const p = createPresence({ graceMs: 5000, onIdle, timers: c });
  const leave = p.join();
  leave();
  c.advance(1000);
  const leave2 = p.join();
  c.advance(10_000);
  expect(onIdle).not.toHaveBeenCalled();
  leave2();
  c.advance(5001);
  expect(onIdle).toHaveBeenCalledTimes(1);
});

test('with two pages open, closing one keeps the server running', () => {
  const c = clock();
  const onIdle = vi.fn();
  const p = createPresence({ graceMs: 5000, onIdle, timers: c });
  const a = p.join();
  p.join();
  a();
  c.advance(10_000);
  expect(onIdle).not.toHaveBeenCalled();
});

test('the server never stops before a first page has connected', () => {
  const c = clock();
  const onIdle = vi.fn();
  createPresence({ graceMs: 5000, onIdle, timers: c });
  c.advance(10 * 60_000);
  expect(onIdle).not.toHaveBeenCalled();
});

test('calling leave twice counts once', () => {
  const c = clock();
  const onIdle = vi.fn();
  const p = createPresence({ graceMs: 5000, onIdle, timers: c });
  const a = p.join();
  p.join();
  a();
  a();
  c.advance(10_000);
  expect(onIdle).not.toHaveBeenCalled();
});
