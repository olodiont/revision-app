import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppDeps } from '../../server/app';

export function fakeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  const dir = mkdtempSync(join(tmpdir(), 'rev-app-'));
  return {
    config: { dataDir: join(dir, 'revision-data'), model: null, port: 5317 },
    configPath: join(dir, 'config.json'),
    provider: undefined as unknown as AppDeps['provider'],
    openPath: () => {},
    ...overrides,
  };
}

export function testApp(overrides: Partial<AppDeps> = {}) {
  const deps = fakeDeps(overrides);
  const app = createApp(deps);
  const json = async <T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> => {
    const res = await app.request(path, {
      method,
      ...(body instanceof FormData ? { body } : body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  };
  return { app, deps, json };
}

export async function seedViaApi(json: ReturnType<typeof testApp>['json']) {
  const s = (await json('POST', '/api/subjects', { name: 'Maths' })).body;
  const c = (await json('POST', '/api/chapters', { subjectId: s.id, name: 'Intégrales' })).body;
  return { s, c };
}
