/**
 * Keeps the presence stream open (the server stops when the last page closes) and calls
 * `onGone` when the server stopped (its console was closed) and does not come back.
 */
export function watchServer(onGone: () => void, Source: typeof EventSource = EventSource, waitMs = 3000): () => void {
  const es = new Source('/api/presence');
  let timer: ReturnType<typeof setTimeout> | null = null;
  es.onopen = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
  es.onerror = () => {
    if (timer !== null) return;
    timer = setTimeout(() => { es.close(); onGone(); }, waitMs);
  };
  return () => {
    if (timer !== null) clearTimeout(timer);
    es.close();
  };
}
