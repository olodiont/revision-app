// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { Markdown } from '../../web/components/Markdown';
import { SafeSvg } from '../../web/components/diagrams/SafeSvg';
import { domSelectionToSourceRange } from '../../web/lib/selection';

afterEach(cleanup);

function textNodeContaining(root: Node, needle: string): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.includes(needle)) return n as Text;
  throw new Error(`text not found: ${needle}`);
}
function selectIn(root: HTMLElement, needle: string, word: string) {
  const t = textNodeContaining(root, needle);
  const i = t.nodeValue!.indexOf(word);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  const r = document.createRange();
  r.setStart(t, i);
  r.setEnd(t, i + word.length);
  sel.addRange(r);
  return domSelectionToSourceRange(sel, root);
}
const mount = (src: string) => render(<Markdown source={src} />).container.querySelector<HTMLElement>('.prose-rev')!;

// I2 — offsets must stay exact when rendered text differs from the source
test('selection on the second line of a blockquote maps to the right source text', () => {
  const src = '> ligne un\n> ligne deux importante';
  const r = selectIn(mount(src), 'importante', 'importante')!;
  expect(src.slice(r.start, r.end)).toBe('importante');
});

test('selection on a list item continuation line maps to the right source text', () => {
  const src = '- premier point\n  suite du point cible';
  const r = selectIn(mount(src), 'cible', 'cible')!;
  expect(src.slice(r.start, r.end)).toBe('cible');
});

test('selection after an HTML entity or an escape maps to the right source text', () => {
  const src = 'A &amp; B \\* puis la cible ici';
  const r = selectIn(mount(src), 'cible', 'cible')!;
  expect(src.slice(r.start, r.end)).toBe('cible');
});

test('selection inside an indented code block within a list maps to the right source text', () => {
  const src = '- item\n\n  ```js\n  const cible = 1;\n  ```\n';
  const r = selectIn(mount(src), 'cible', 'cible')!;
  expect(src.slice(r.start, r.end)).toBe('cible');
});

test('highlight on a blockquote continuation line marks the right words', () => {
  const src = '> ligne un\n> ligne deux importante';
  const s = src.indexOf('importante');
  const { container } = render(<Markdown source={src} highlights={[{ start: s, end: s + 10, commentId: 3, active: false }]} />);
  expect(container.querySelector('mark[data-comment-id="3"]')?.textContent).toBe('importante');
});

// I3 — model SVG must not touch the page
test('SafeSvg renders the SVG isolated in an <img>, so its <style> cannot restyle the page', () => {
  const { container } = render(<SafeSvg source={'<svg viewBox="0 0 1 1"><style>body{display:none}</style><rect width="1" height="1"/></svg>'} />);
  expect(container.querySelector('style')).toBeNull();
  const img = container.querySelector('img')!;
  expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  expect(decodeURIComponent(img.getAttribute('src')!)).toContain('<rect');
});
