import { EventEmitter } from 'node:events';
import { appWindowArgs, findEdge, openAppWindow } from '../../server/appWindow';

test('findEdge returns the first Edge executable that exists', () => {
  const exists = (p: string) => p.includes('Program Files (x86)');
  expect(findEdge(exists, { 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramFiles: 'C:\\Program Files' }))
    .toBe('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
  expect(findEdge(() => false, {})).toBeNull();
});

test('the app window is an Edge "app" window with its own profile (it can be closed without touching your browser)', () => {
  const args = appWindowArgs('http://127.0.0.1:5317', 'C:\\x\\window-profile');
  expect(args).toContain('--app=http://127.0.0.1:5317');
  expect(args).toContain('--user-data-dir=C:\\x\\window-profile');
  expect(args).toContain('--no-first-run');
});

test('openAppWindow reports when the window is closed and can close it', () => {
  const child = Object.assign(new EventEmitter(), { pid: 42, unref() {} });
  const spawnFn = vi.fn((_cmd: string, _args: string[], _opts: unknown) => child);
  const killed: number[] = [];
  const onClosed = vi.fn();
  const w = openAppWindow({ url: 'http://127.0.0.1:5317', profileDir: 'p', edge: 'msedge.exe', spawnFn: spawnFn as any, kill: (pid) => killed.push(pid), onClosed });
  expect(w).not.toBeNull();
  expect(spawnFn.mock.calls[0][0]).toBe('msedge.exe');
  w!.close();
  expect(killed).toEqual([42]);
  child.emit('exit', 0);
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('openAppWindow returns null when Edge is not installed', () => {
  expect(openAppWindow({ url: 'u', profileDir: 'p', edge: null, onClosed: () => {} })).toBeNull();
});
