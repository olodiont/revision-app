/**
 * Counts the open app pages. When the last one closes and none comes back within the grace
 * period (time for a reload), `onIdle` fires: the server stops, which also closes its console window.
 */
export interface PresenceOptions {
  graceMs: number;
  onIdle: () => void;
  timers?: Timers;
}

type Handle = ReturnType<typeof setTimeout>;
interface Timers { setTimeout: (fn: () => void, ms: number) => Handle; clearTimeout: (h: Handle) => void }
const realTimers: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) };

export function createPresence({ graceMs, onIdle, timers = realTimers }: PresenceOptions) {
  let open = 0;
  let timer: Handle | null = null;

  const cancel = () => {
    if (timer !== null) { timers.clearTimeout(timer); timer = null; }
  };

  return {
    /** Registers an open page; returns the function to call when it closes (safe to call twice). */
    join(): () => void {
      open++;
      cancel();
      let left = false;
      return () => {
        if (left) return;
        left = true;
        open--;
        if (open === 0) {
          cancel();
          timer = timers.setTimeout(() => { timer = null; if (open === 0) onIdle(); }, graceMs);
        }
      };
    },
    get openPages() { return open; },
  };
}
