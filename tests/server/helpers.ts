import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppDeps } from '../../server/app';

export function fakeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  const dir = mkdtempSync(join(tmpdir(), 'rev-app-'));
  return {
    db: undefined,
    config: { dataDir: join(dir, 'revision-data'), model: null, port: 5317 },
    configPath: join(dir, 'config.json'),
    provider: undefined,
    openPath: () => {},
    ...overrides,
  } as AppDeps;
}
