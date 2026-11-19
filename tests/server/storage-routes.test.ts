import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { claudeHistoryDir } from '../../server/routes/storage';
import { seedViaApi, testApp } from './helpers';

test('GET /api/storage reports sizes and paths', async () => {
  const { json, deps } = testApp();
  await seedViaApi(json);
  writeFileSync(join(deps.config.dataDir, 'fichiers', 'x.bin'), 'abcd');
  const res = (await json('GET', '/api/storage')).body;
  expect(res.dataDir).toBe(deps.config.dataDir);
  expect(res.dataBytes).toBeGreaterThan(4);
  expect(res.model).toBeNull();
  expect(res.claudeHistoryDir).toBe(claudeHistoryDir(join(deps.config.dataDir, 'claude-cwd')));
  expect(typeof res.claudeHistoryBytes).toBe('number');
});

test('POST /api/storage/open data calls openPath with dataDir', async () => {
  const opened: string[] = [];
  const { json, deps } = testApp({ openPath: (p) => opened.push(p) });
  const res = await json('POST', '/api/storage/open', { target: 'data' });
  expect(res.status).toBe(200);
  expect(opened).toEqual([deps.config.dataDir]);
  expect(existsSync(deps.config.dataDir)).toBe(true);
});

test('POST /api/storage/open claudeHistory returns 404 message when folder missing', async () => {
  const opened: string[] = [];
  const { json } = testApp({ openPath: (p) => opened.push(p) });
  const res = await json('POST', '/api/storage/open', { target: 'claudeHistory' });
  expect(res.status).toBe(404);
  expect(res.body.message).toBe("Aucun historique Claude Code pour l'instant.");
  expect(opened).toEqual([]);
});

test('claudeHistoryDir encodes C:\\x\\revision-data\\claude-cwd as C--x-revision-data-claude-cwd', () => {
  expect(claudeHistoryDir('C:\\x\\revision-data\\claude-cwd')).toBe(join(homedir(), '.claude', 'projects', 'C--x-revision-data-claude-cwd'));
  expect(claudeHistoryDir('C:\\a_b\\c d')).toBe(join(homedir(), '.claude', 'projects', 'C--a-b-c-d'));
});

test('PUT /api/settings saves the model and a new data folder, and the next request uses it', async () => {
  const { json, deps } = testApp();
  await seedViaApi(json);
  const newDir = join(deps.config.dataDir, '..', 'ailleurs');
  const res = await json('PUT', '/api/settings', { model: 'claude-sonnet-5-5', dataDir: newDir });
  expect(res.status).toBe(200);
  expect(res.body.message).toContain('pas été déplacées');
  expect(deps.config.model).toBe('claude-sonnet-5-5');
  expect((await json('GET', '/api/library')).body.subjects).toEqual([]);
  expect(existsSync(join(newDir, 'revision.db'))).toBe(true);
  const saved = (await import('../../server/config')).loadConfig(deps.configPath);
  expect(saved).toMatchObject({ model: 'claude-sonnet-5-5', dataDir: newDir });
});

test('PUT /api/settings with empty model resets to Claude Code default', async () => {
  const { json, deps } = testApp();
  await json('PUT', '/api/settings', { model: 'x' });
  await json('PUT', '/api/settings', { model: '' });
  expect(deps.config.model).toBeNull();
  mkdirSync(deps.config.dataDir, { recursive: true });
});
