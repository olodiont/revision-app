import DiffMatchPatch from 'diff-match-patch';
import type { Anchor } from './types';

export const CONTEXT_CHARS = 32;

export function createAnchor(source: string, start: number, end: number, kind: 'text' | 'block'): Anchor {
  return {
    exact: source.slice(start, end),
    prefix: source.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: source.slice(end, end + CONTEXT_CHARS),
    start,
    end,
    kind,
  };
}

export type ReanchorStatus = 'exact' | 'fuzzy' | 'lost';

function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function allOccurrences(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) out.push(i);
  return out;
}

function fuzzyLocate(anchor: Anchor, src: string): { start: number; end: number } | null {
  const dmp = new DiffMatchPatch();
  dmp.Match_Threshold = 0.4;
  dmp.Match_Distance = 5000;
  const { exact } = anchor;
  const loc = Math.min(Math.max(anchor.start, 0), src.length);
  const maxBits = dmp.Match_MaxBits;

  let start = -1;
  const head = exact.slice(0, maxBits);
  const headPos = dmp.match_main(src, head, loc);
  if (headPos !== -1) start = headPos;
  else if (exact.length > maxBits) {
    const tail = exact.slice(-maxBits);
    const tailPos = dmp.match_main(src, tail, Math.min(src.length, loc + exact.length - maxBits));
    if (tailPos !== -1) start = Math.max(0, tailPos - (exact.length - maxBits));
  }
  if (start === -1) return null;

  // Align the old quote with a window of the new source to find where it ends now.
  const window = src.slice(start, start + Math.ceil(exact.length * 1.5) + 16);
  const diffs = dmp.diff_main(exact, window);
  dmp.diff_cleanupSemantic(diffs);
  const end = start + dmp.diff_xIndex(diffs, exact.length);
  if (end <= start) return null;
  return { start, end };
}

/**
 * Finds where an anchor's passage now lives in a new version of the source.
 * exact: the quote is still there verbatim (the right occurrence is chosen by its context);
 * fuzzy: a lightly edited version of it was found; lost: it cannot be located.
 */
export function reanchor(anchor: Anchor, newSource: string): { anchor: Anchor; status: ReanchorStatus } {
  const hits = allOccurrences(newSource, anchor.exact);
  if (hits.length > 0) {
    let best = hits[0];
    let bestScore = -1;
    let bestDist = Infinity;
    for (const pos of hits) {
      const score = commonSuffixLength(newSource.slice(Math.max(0, pos - CONTEXT_CHARS), pos), anchor.prefix)
        + commonPrefixLength(newSource.slice(pos + anchor.exact.length, pos + anchor.exact.length + CONTEXT_CHARS), anchor.suffix);
      const dist = Math.abs(pos - anchor.start);
      if (score > bestScore || (score === bestScore && dist < bestDist)) {
        best = pos;
        bestScore = score;
        bestDist = dist;
      }
    }
    return { anchor: createAnchor(newSource, best, best + anchor.exact.length, anchor.kind), status: 'exact' };
  }
  const found = anchor.exact ? fuzzyLocate(anchor, newSource) : null;
  if (found) return { anchor: createAnchor(newSource, found.start, found.end, anchor.kind), status: 'fuzzy' };
  return { anchor, status: 'lost' };
}

export function applyReplacement(source: string, start: number, end: number, replacement: string): string {
  return source.slice(0, start) + replacement + source.slice(end);
}

/** True when the anchored passage overlaps [start, end). */
export function isInsideRange(anchor: Anchor, start: number, end: number): boolean {
  return anchor.start < end && start < anchor.end;
}
