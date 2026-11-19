// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { SelectionPopover, popoverPoint } from '../../web/components/SelectionPopover';

afterEach(cleanup);

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;

test('the Commenter button sits below the end of the selection, away from browser popups shown above it', () => {
  // A selection over two lines: the button goes under the last line, at its end.
  const p = popoverPoint([rect(100, 200, 300, 20), rect(80, 222, 120, 20)]);
  expect(p).toEqual({ x: 200, y: 250 });
  render(<SelectionPopover point={p} onComment={() => {}} />);
  const btn = screen.getByRole('button', { name: /Commenter/ });
  expect(btn.style.top).toBe('250px');
  expect(btn.style.left).toBe('200px');
});

test('popoverPoint keeps the button inside the window', () => {
  const p = popoverPoint([rect(10, window.innerHeight - 5, 5, 20)]);
  expect(p.y).toBeLessThanOrEqual(window.innerHeight - 44);
  expect(p.x).toBeGreaterThanOrEqual(70);
});
