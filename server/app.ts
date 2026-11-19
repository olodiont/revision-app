import { Hono } from 'hono';
import type { AppConfig } from './config';

export interface AppDeps {
  db: unknown;
  config: AppConfig;
  configPath: string;
  provider: unknown;
  openPath: (p: string) => void;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));
  void deps;
  return app;
}
