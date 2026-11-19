import { watchServer } from '../../web/lib/presence';

class FakeSource {
  static last: FakeSource;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  closed = false;
  constructor(public url: string) { FakeSource.last = this; }
  close() { this.closed = true; }
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('opens the presence stream and reports the server gone when it cannot reconnect', () => {
  const onGone = vi.fn();
  watchServer(onGone, FakeSource as unknown as typeof EventSource, 3000);
  expect(FakeSource.last.url).toBe('/api/presence');
  FakeSource.last.onopen?.();
  FakeSource.last.onerror?.();
  vi.advanceTimersByTime(2900);
  expect(onGone).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(onGone).toHaveBeenCalledTimes(1);
  expect(FakeSource.last.closed).toBe(true);
});

test('a short hiccup (reconnected in time) is not reported', () => {
  const onGone = vi.fn();
  watchServer(onGone, FakeSource as unknown as typeof EventSource, 3000);
  FakeSource.last.onerror?.();
  vi.advanceTimersByTime(1000);
  FakeSource.last.onopen?.();
  vi.advanceTimersByTime(10_000);
  expect(onGone).not.toHaveBeenCalled();
});
