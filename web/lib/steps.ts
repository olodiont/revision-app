/**
 * For "Me tester" on corrections laid out exercise by exercise: separates the "### Correction"
 * sections (hidden until revealed) from the rest (tools, statements), which stays visible.
 * Returns null when the correction has no such section (older layout).
 */
export function splitCorrectionSections(markdown: string): { text: string; hidden: boolean }[] | null {
  const parts: { text: string; hidden: boolean }[] = [];
  let buf: string[] = [];
  let hidden = false;
  let hiddenLevel = 0;
  let fence: string | null = null;
  let math = false;
  let found = false;

  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) parts.push({ text, hidden });
    buf = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const t = line.trim();
    if (fence) { buf.push(line); if (t.startsWith(fence)) fence = null; continue; }
    if (math) { buf.push(line); if (t.endsWith('$$')) math = false; continue; }
    const f = /^(`{3,}|~{3,})/.exec(t);
    if (f) { buf.push(line); fence = f[1]; continue; }
    if (t.startsWith('$$')) { buf.push(line); if (!(t.length > 2 && t.endsWith('$$'))) math = true; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const level = h[1].length;
      const isCorrection = /^correction\b/i.test(h[2].trim());
      if (isCorrection) {
        flush();
        hidden = true;
        hiddenLevel = level;
        found = true;
      } else if (hidden && level <= hiddenLevel) {
        flush();
        hidden = false;
      }
    }
    buf.push(line);
  }
  flush();
  return found ? parts : null;
}

/**
 * Cuts a correction into steps for "reveal step by step":
 * on headings (#–####) when there are any, otherwise on blank-line paragraphs.
 * Fenced code, $$ math and diagram fences are never cut.
 */
export function splitIntoSteps(markdown: string): string[] {
  const chunks: { text: string; heading: boolean }[] = [];
  let buf: string[] = [];
  let bufHeading = false;
  let fence: string | null = null;
  let math = false;

  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) chunks.push({ text, heading: bufHeading });
    buf = [];
    bufHeading = false;
  };

  for (const line of markdown.split(/\r?\n/)) {
    const t = line.trim();
    if (fence) {
      buf.push(line);
      if (t.startsWith(fence)) fence = null;
      continue;
    }
    if (math) {
      buf.push(line);
      if (t.endsWith('$$')) math = false;
      continue;
    }
    const f = /^(`{3,}|~{3,})/.exec(t);
    if (f) { buf.push(line); fence = f[1]; continue; }
    if (t.startsWith('$$')) {
      buf.push(line);
      if (!(t.length > 2 && t.endsWith('$$'))) math = true;
      continue;
    }
    if (t === '') { flush(); continue; }
    if (/^#{1,4}\s/.test(t)) { flush(); bufHeading = true; }
    buf.push(line);
  }
  flush();

  if (!chunks.some((c) => c.heading)) return chunks.map((c) => c.text);

  const steps: string[] = [];
  for (const c of chunks) {
    if (c.heading || steps.length === 0) steps.push(c.text);
    else steps[steps.length - 1] += `\n\n${c.text}`;
  }
  return steps;
}
