/**
 * Maps each character of a rendered text to its offset in the Markdown source.
 * Rendered text can differ from the source: line prefixes ("> ", list indentation),
 * backslash escapes and entities (&amp;) disappear. Walking both strings together and
 * skipping source characters that are not in the rendered text recovers the real offsets.
 */
export function alignOffsets(value: string, source: string, from: number, to: number): number[] {
  const out: number[] = new Array(value.length);
  if (source.slice(from, from + value.length) === value) {
    for (let i = 0; i < value.length; i++) out[i] = from + i;
    return out;
  }
  let j = from;
  for (let i = 0; i < value.length; i++) {
    let k = j;
    while (k < to && source[k] !== value[i]) k++;
    if (k >= to) {
      // Cannot align the rest: keep counting from the last known position.
      for (let r = i; r < value.length; r++) out[r] = Math.min(j + (r - i), Math.max(from, to - 1));
      return out;
    }
    out[i] = k;
    j = k + 1;
  }
  return out;
}

/** Groups aligned characters into runs that are contiguous in the source. */
export function alignedRuns(value: string, source: string, from: number, to: number): { text: string; start: number }[] {
  const offs = alignOffsets(value, source, from, to);
  const runs: { text: string; start: number }[] = [];
  for (let i = 0; i < value.length; i++) {
    const last = runs[runs.length - 1];
    if (last && offs[i] === last.start + last.text.length) last.text += value[i];
    else runs.push({ text: value[i], start: offs[i] });
  }
  return runs;
}
