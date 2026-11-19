import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig } from '../../server/config';

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'rev-cfg-')); });

test('loadConfig creates defaults when file missing', () => {
  const p = join(tmp, 'config.json');
  const cfg = loadConfig(p);
  expect(cfg.port).toBe(5317);
  expect(cfg.model).toBeNull();
  expect(cfg.dataDir).toMatch(/revision-data$/);
  expect(existsSync(p)).toBe(true);
});

test('saveConfig then loadConfig round-trips', () => {
  const p = join(tmp, 'config.json');
  saveConfig(p, { dataDir: 'X', model: 'claude-opus-5-5', port: 5317 });
  expect(loadConfig(p)).toEqual({ dataDir: 'X', model: 'claude-opus-5-5', port: 5317 });
});
