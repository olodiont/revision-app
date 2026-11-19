// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { DiffView } from '../../web/components/DiffView';

afterEach(cleanup);

test('DiffView marks removed and added words', () => {
  const { container } = render(<DiffView before="on pose u = ln x ici" after="on pose v = ln x ici" />);
  const removed = [...container.querySelectorAll('del')].map((e) => e.textContent).join('');
  const added = [...container.querySelectorAll('ins')].map((e) => e.textContent).join('');
  expect(removed).toBe('u');
  expect(added).toBe('v');
  expect(container.textContent).toContain('on pose ');
});

test('DiffView with identical texts has no marks', () => {
  const { container } = render(<DiffView before="même texte" after="même texte" />);
  expect(container.querySelectorAll('del, ins')).toHaveLength(0);
});
