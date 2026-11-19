// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Markdown } from '../../web/components/Markdown';
import { SafeSvg } from '../../web/components/diagrams/SafeSvg';

afterEach(cleanup);

test('invalid mermaid renders DiagramError with the source, page does not throw', async () => {
  const src = 'Avant\n\n```mermaid\nflowchart TD\n  A -->> -->\n```\n\nAprès';
  render(<Markdown source={src} />);
  await waitFor(() => expect(screen.getByText(/Ce schéma n'a pas pu être dessiné/)).toBeTruthy(), { timeout: 5000 });
  expect(screen.getByText(/A -->> -->/)).toBeTruthy();
  expect(screen.getByText('Après')).toBeTruthy();
});

test('invalid function-plot JSON renders DiagramError', async () => {
  render(<Markdown source={'```function-plot\n{ pas du json\n```'} />);
  await waitFor(() => expect(screen.getByText(/Ce schéma n'a pas pu être dessiné/)).toBeTruthy());
  expect(screen.getByText(/pas du json/)).toBeTruthy();
});

test('diagram block is a commentable block covering the whole fence', () => {
  const src = 'x\n\n```svg\n<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>\n```\n';
  const { container } = render(<Markdown source={src} />);
  const block = container.querySelector<HTMLElement>('[data-diagram]')!;
  expect(src.slice(Number(block.dataset.blockStart), Number(block.dataset.blockEnd)).startsWith('```svg')).toBe(true);
  expect(decodeURIComponent(container.querySelector('img')!.getAttribute('src')!)).toContain('<circle');
});

test('SafeSvg strips <script> and onload attributes', () => {
  const { container } = render(<SafeSvg source={'<svg onload="alert(1)" viewBox="0 0 1 1"><script>alert(2)</script><rect width="1" height="1"/></svg>'} />);
  const svg = decodeURIComponent(container.querySelector('img')!.getAttribute('src')!);
  expect(svg).not.toContain('<script');
  expect(svg).not.toContain('onload');
  expect(svg).toContain('<rect');
});

test('SafeSvg shows an error for content that is not an svg', () => {
  render(<SafeSvg source={'<p>pas un svg</p>'} />);
  expect(screen.getByText(/Ce schéma n'a pas pu être dessiné/)).toBeTruthy();
});
