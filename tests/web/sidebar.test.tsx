// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../web/App';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ subjects: [] }), { headers: { 'content-type': 'application/json' } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('the library menu can be hidden to give the exercise more room, and shown again', async () => {
  await act(async () => { render(<App />); });
  expect(screen.getByPlaceholderText('Rechercher…')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Masquer le menu' }));
  expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Afficher le menu' }));
  expect(screen.getByPlaceholderText('Rechercher…')).toBeTruthy();
});

test('the hidden state is remembered after a reload', async () => {
  let r: ReturnType<typeof render> | undefined;
  await act(async () => { r = render(<App />); });
  fireEvent.click(screen.getByRole('button', { name: 'Masquer le menu' }));
  r!.unmount();
  await act(async () => { render(<App />); });
  expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull();
  expect(screen.getByRole('button', { name: 'Afficher le menu' })).toBeTruthy();
});
