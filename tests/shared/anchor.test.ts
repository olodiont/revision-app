import { applyReplacement, CONTEXT_CHARS, createAnchor, isInsideRange, reanchor } from '../../shared/anchor';

test('createAnchor takes 32 chars of context each side, clipped at bounds', () => {
  const src = 'a'.repeat(50) + 'CIBLE' + 'b'.repeat(50);
  const a = createAnchor(src, 50, 55, 'text');
  expect(CONTEXT_CHARS).toBe(32);
  expect(a).toEqual({ exact: 'CIBLE', prefix: 'a'.repeat(32), suffix: 'b'.repeat(32), start: 50, end: 55, kind: 'text' });
  const edge = createAnchor('xyCIBLEz', 2, 7, 'block');
  expect(edge.prefix).toBe('xy');
  expect(edge.suffix).toBe('z');
  expect(edge.kind).toBe('block');
});

test('reanchor returns exact when text unchanged', () => {
  const src = 'On pose u = ln x et dv = dx.';
  const a = createAnchor(src, 8, 16, 'text');
  const r = reanchor(a, src);
  expect(r.status).toBe('exact');
  expect(r.anchor).toEqual(a);
});

test('reanchor picks the right occurrence of a repeated quote using prefix/suffix', () => {
  const src = 'A: on pose u = 0.\nB: on pose u = 0.\n';
  const at = src.lastIndexOf('on pose');
  const a = createAnchor(src, at, at + 7, 'text');
  const moved = 'Intro.\n' + src;
  const r = reanchor(a, moved);
  expect(r.status).toBe('exact');
  expect(r.anchor.start).toBe(moved.lastIndexOf('on pose'));
  expect(r.anchor.end).toBe(moved.lastIndexOf('on pose') + 7);
});

test('reanchor picks the first occurrence when that is the one anchored, even if the text moved', () => {
  const src = 'A: on pose u = 0.\nB: on pose u = 0.\n';
  const a = createAnchor(src, 3, 10, 'text');
  const moved = 'Une longue introduction ajoutée avant tout le reste.\n' + src;
  expect(reanchor(a, moved).anchor.start).toBe(moved.indexOf('on pose'));
});

test('reanchor follows text that shifted after an insertion earlier in the source', () => {
  const src = 'Étape 1. Étape 2 : intégrer par parties.';
  const at = src.indexOf('intégrer');
  const a = createAnchor(src, at, at + 8, 'text');
  const next = 'Étape 0 ajoutée. ' + src;
  const r = reanchor(a, next);
  expect(r.status).toBe('exact');
  expect(next.slice(r.anchor.start, r.anchor.end)).toBe('intégrer');
});

test('reanchor returns fuzzy when the quote was lightly edited ("u = ln x" -> "u = ln(x)")', () => {
  const src = 'Pour la primitive, on pose u = ln x puis on dérive.';
  const at = src.indexOf('on pose u = ln x');
  const a = createAnchor(src, at, at + 'on pose u = ln x'.length, 'text');
  const next = 'Pour la primitive, on pose u = ln(x) puis on dérive.';
  const r = reanchor(a, next);
  expect(r.status).toBe('fuzzy');
  expect(next.slice(r.anchor.start, r.anchor.end)).toContain('on pose u = ln(x');
  expect(r.anchor.exact).toBe(next.slice(r.anchor.start, r.anchor.end));
});

test('reanchor returns lost when the passage was removed entirely', () => {
  const src = 'Intro. Le passage très spécifique sur les séries de Fourier. Fin.';
  const at = src.indexOf('Le passage');
  const a = createAnchor(src, at, src.indexOf(' Fin'), 'text');
  expect(reanchor(a, 'Intro. Fin.').status).toBe('lost');
});

test('applyReplacement replaces exactly [start,end)', () => {
  expect(applyReplacement('abcdef', 2, 4, 'XYZ')).toBe('abXYZef');
  expect(applyReplacement('abc', 3, 3, '!')).toBe('abc!');
});

test('isInsideRange detects overlap and non-overlap at boundaries', () => {
  const a = createAnchor('0123456789', 3, 6, 'text');
  expect(isInsideRange(a, 5, 8)).toBe(true);
  expect(isInsideRange(a, 0, 4)).toBe(true);
  expect(isInsideRange(a, 6, 9)).toBe(false);
  expect(isInsideRange(a, 0, 3)).toBe(false);
  expect(isInsideRange(a, 4, 5)).toBe(true);
});
