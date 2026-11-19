/** Splits a Claude answer on lines that are exactly `===NAME===`. Text before the first marker is dropped. */
export function parseSections(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => { if (current) out[current] = buf.join('\n').trim(); };
  for (const line of text.split(/\r?\n/)) {
    const m = /^===([A-Z_]+)===\s*$/.exec(line.trim());
    if (m) {
      flush();
      current = m[1];
      buf = [];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return out;
}
