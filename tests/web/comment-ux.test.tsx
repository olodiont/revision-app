// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Markdown } from '../../web/components/Markdown';
import { FilePicker } from '../../web/components/FilePicker';

afterEach(cleanup);

test('resolved comments stay highlighted, with their own style', () => {
  const src = 'On pose u = ln x puis on conclut.';
  const a = src.indexOf('u = ln x');
  const b = src.indexOf('conclut');
  const { container } = render(<Markdown source={src} highlights={[
    { start: a, end: a + 8, commentId: 1, active: false },
    { start: b, end: b + 7, commentId: 2, active: false, resolved: true },
  ]} />);
  expect(container.querySelector('mark[data-comment-id="1"]')?.className).not.toContain('resolved');
  expect(container.querySelector('mark[data-comment-id="2"]')?.className).toContain('resolved');
});

test('clicking a highlighted passage reports its comment id', () => {
  const src = 'On pose u = ln x.';
  const a = src.indexOf('u = ln x');
  const onMarkClick = vi.fn();
  const { container } = render(<Markdown source={src} onMarkClick={onMarkClick}
    highlights={[{ start: a, end: a + 8, commentId: 7, active: false, resolved: true }]} />);
  fireEvent.click(container.querySelector('mark[data-comment-id="7"]')!);
  expect(onMarkClick).toHaveBeenCalledWith(7);
});

test('FilePicker shows a big add-files button, lists chosen files and lets you remove one', () => {
  const onChange = vi.fn();
  const files = [new File(['a'], 'sujet.png', { type: 'image/png' }), new File(['b'], 'td.pdf', { type: 'application/pdf' })];
  const { rerender } = render(<FilePicker files={[]} onChange={onChange} accept=".png,.pdf" />);
  expect(screen.getByText(/Ajouter une photo, un PDF ou un Word/)).toBeTruthy();
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  fireEvent.change(input, { target: { files } });
  expect(onChange).toHaveBeenLastCalledWith(files);

  rerender(<FilePicker files={files} onChange={onChange} accept=".png,.pdf" />);
  expect(screen.getByText('sujet.png')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Retirer sujet.png'));
  expect(onChange).toHaveBeenLastCalledWith([files[1]]);
});

test('FilePicker accepts dropped files and adds them to the list', () => {
  const onChange = vi.fn();
  const existing = new File(['a'], 'a.png', { type: 'image/png' });
  const dropped = new File(['b'], 'b.pdf', { type: 'application/pdf' });
  render(<FilePicker files={[existing]} onChange={onChange} accept=".png,.pdf" />);
  fireEvent.drop(screen.getByTestId('file-drop'), { dataTransfer: { files: [dropped] } });
  expect(onChange).toHaveBeenLastCalledWith([existing, dropped]);
});
