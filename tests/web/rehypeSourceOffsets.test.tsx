// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { Markdown } from '../../web/components/Markdown';

afterEach(cleanup);

const textSpans = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-s]')].map((el) => ({ s: Number(el.dataset.s), text: el.textContent }));

test('text spans carry data-s equal to their markdown source offset (inside **bold** too)', () => {
  const src = 'Bonjour **monde** ici.';
  const { container } = render(<Markdown source={src} />);
  const spans = textSpans(container);
  for (const sp of spans) expect(src.slice(sp.s, sp.s + sp.text!.length)).toBe(sp.text);
  expect(spans.find((x) => x.text === 'monde')?.s).toBe(src.indexOf('monde'));
});

test('inline math $x^2$ element carries data-block-start/end covering "$x^2$"', () => {
  const src = 'Soit $x^2$ un carré.';
  const { container } = render(<Markdown source={src} />);
  const block = container.querySelector<HTMLElement>('[data-block-start]')!;
  expect(src.slice(Number(block.dataset.blockStart), Number(block.dataset.blockEnd))).toBe('$x^2$');
  expect(block.querySelector('.katex')).not.toBeNull();
});

test('display math $$…$$ is one block covering the whole construct', () => {
  const src = 'Avant\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nAprès';
  const { container } = render(<Markdown source={src} />);
  const block = container.querySelector<HTMLElement>('[data-block-start]')!;
  expect(src.slice(Number(block.dataset.blockStart), Number(block.dataset.blockEnd))).toBe('$$\n\\int_0^1 x\\,dx\n$$');
});

test('code fence carries data-code-start pointing just after the opening fence line', () => {
  const src = 'Code :\n\n```python\nprint(42)\nx = 1\n```\n';
  const { container } = render(<Markdown source={src} />);
  const pre = container.querySelector<HTMLElement>('pre[data-code-start]')!;
  expect(src.slice(Number(pre.dataset.codeStart)).startsWith('print(42)')).toBe(true);
  expect(pre.textContent).toContain('print(42)');
});

test('highlights wrap the exact source range in a mark with the comment id', () => {
  const src = 'On pose u = ln x puis on dérive.';
  const start = src.indexOf('u = ln x');
  const { container } = render(<Markdown source={src} highlights={[{ start, end: start + 8, commentId: 5, active: true }]} />);
  const mark = container.querySelector<HTMLElement>('mark[data-comment-id="5"]')!;
  expect(mark.textContent).toBe('u = ln x');
  expect(mark.classList.contains('active')).toBe(true);
  expect(Number(mark.dataset.s)).toBe(start);
});

test('a highlight covering a math block outlines the block', () => {
  const src = 'Soit $x^2$ ici.';
  const s = src.indexOf('$x^2$');
  const { container } = render(<Markdown source={src} highlights={[{ start: s, end: s + 5, commentId: 1, active: false }]} />);
  expect(container.querySelector('[data-block-start]')!.classList.contains('commented')).toBe(true);
});
