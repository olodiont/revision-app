import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findClaudeCommand } from '../../server/claude/cliProvider';

test('findClaudeCommand prefers the native install in ~/.local/bin when it exists', () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  mkdirSync(join(home, '.local', 'bin'), { recursive: true });
  const exe = join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  writeFileSync(exe, '');
  expect(findClaudeCommand(home)).toBe(exe);
});

test('findClaudeCommand falls back to "claude" on the PATH', () => {
  expect(findClaudeCommand(mkdtempSync(join(tmpdir(), 'home-')))).toBe('claude');
});
