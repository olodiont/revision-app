// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { Markdown } from '../../web/components/Markdown';
import { domSelectionToSourceRange } from '../../web/lib/selection';

afterEach(cleanup);

function textNodeContaining(root: Node, needle: string): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.includes(needle)) return n as Text;
  throw new Error(`text not found: ${needle}`);
}

function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Selection {
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  const r = document.createRange();
  r.setStart(startNode, startOffset);
  r.setEnd(endNode, endOffset);
  sel.addRange(r);
  return sel;
}

function mount(src: string) {
  const { container } = render(<Markdown source={src} />);
  return container.querySelector<HTMLElement>('.prose-rev')!;
}

test('selection inside plain text maps to exact source offsets', () => {
  const src = 'Première phrase. On pose u = ln x ici.';
  const root = mount(src);
  const t = textNodeContaining(root, 'On pose');
  const i = t.nodeValue!.indexOf('u = ln x');
  const r = domSelectionToSourceRange(select(t, i, t, i + 8), root)!;
  expect(src.slice(r.start, r.end)).toBe('u = ln x');
  expect(r.kind).toBe('text');
});

test('selection inside **bold** maps to offsets excluding the ** markers', () => {
  const src = 'Il faut **intégrer par parties** ensuite.';
  const root = mount(src);
  const t = textNodeContaining(root, 'intégrer');
  const r = domSelectionToSourceRange(select(t, 0, t, t.nodeValue!.length), root)!;
  expect(src.slice(r.start, r.end)).toBe('intégrer par parties');
});

test('selection spanning plain and bold text covers both, markers included in between', () => {
  const src = 'Il faut **intégrer** ensuite.';
  const root = mount(src);
  const a = textNodeContaining(root, 'Il faut');
  const b = textNodeContaining(root, 'intégrer');
  const r = domSelectionToSourceRange(select(a, 3, b, 8), root)!;
  expect(src.slice(r.start, r.end)).toBe('faut **intégrer');
});

test('selection starting in text and ending inside $$…$$ snaps end to block end, kind block', () => {
  const src = 'On calcule :\n\n$$\nx^2 + 1\n$$\n\nFin.';
  const root = mount(src);
  const t = textNodeContaining(root, 'On calcule');
  const katexText = root.querySelector('.katex')!;
  const inner = document.createTreeWalker(katexText, NodeFilter.SHOW_TEXT).nextNode()!;
  const r = domSelectionToSourceRange(select(t, 3, inner, 0), root)!;
  expect(r.kind).toBe('block');
  expect(src.slice(r.start, r.end)).toBe('calcule :\n\n$$\nx^2 + 1\n$$');
});

test('selection inside a highlighted code line maps through data-code-start', () => {
  const src = 'Code :\n\n```python\ndef f(x):\n    return x * 2\n```\n';
  const root = mount(src);
  const t = textNodeContaining(root, 'return');
  const i = t.nodeValue!.indexOf('return');
  const r = domSelectionToSourceRange(select(t, i, t, i + 6), root)!;
  expect(src.slice(r.start, r.end)).toBe('return');
  expect(r.kind).toBe('text');
});

test('selection outside container returns null', () => {
  const root = mount('Dedans.');
  const outside = document.createElement('p');
  outside.textContent = 'Dehors';
  document.body.appendChild(outside);
  expect(domSelectionToSourceRange(select(outside.firstChild!, 0, outside.firstChild!, 3), root)).toBeNull();
  outside.remove();
});

test('collapsed selection returns null', () => {
  const root = mount('Texte.');
  const t = textNodeContaining(root, 'Texte');
  expect(domSelectionToSourceRange(select(t, 2, t, 2), root)).toBeNull();
});
