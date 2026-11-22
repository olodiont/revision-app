// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import type { Comment } from '../../shared/types';
import { CommentsPanel } from '../../web/components/CommentsPanel';

beforeAll(() => {
  // jsdom has no ResizeObserver
  (globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} };
});
afterEach(cleanup);

const comment: Comment = {
  id: 5, exerciseId: 1, versionId: 1, status: 'open', changed: false, kind: 'passage', createdAt: '',
  anchor: { exact: 'x', prefix: '', suffix: '', start: 0, end: 1, kind: 'text' },
};

function setup(aligned: boolean) {
  const spy = vi.fn();
  Element.prototype.scrollIntoView = spy;
  const correctionRef = createRef<HTMLElement>();
  const scrollRef = createRef<HTMLElement>();
  const props = {
    comments: [comment], correctionRef, scrollRef, extras: [], layoutKey: 1, aligned,
    renderThread: (c: Comment) => <div>fil {c.id}</div>,
  };
  const r = render(<CommentsPanel {...props} activeId={null} />);
  return { spy, rerender: (activeId: number | null) => r.rerender(<CommentsPanel {...props} activeId={activeId} />) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('beside the correction, opening a comment (e.g. when Claude has finished answering) never scrolls the page', () => {
  const { spy, rerender } = setup(true);
  rerender(5);
  act(() => { vi.advanceTimersByTime(500); });
  expect(spy).not.toHaveBeenCalled();
});

test('on a narrow screen, where comments are listed below the correction, the opened comment is brought into view', () => {
  const { spy, rerender } = setup(false);
  rerender(5);
  act(() => { vi.advanceTimersByTime(500); });
  expect(spy).toHaveBeenCalledTimes(1);
});
