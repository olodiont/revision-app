import { Hono } from 'hono';
import type { AppConfig } from './config';
import { openDb, type Db } from './db/schema';
import { dataPaths, ensureDataDir } from './files/storage';
import { libraryRoutes } from './routes/library';

export interface AppDeps {
  config: AppConfig;
  configPath: string;
  provider: unknown;
  openPath: (p: string) => void;
}

/**
 * Opens the database for one synchronous unit of work and closes it right after.
 * Keeping no handle open lets the user delete the data folder while the app runs
 * (Windows locks open files); the folder and an empty database are recreated on demand.
 */
export function withDb<T>(deps: AppDeps, fn: (db: Db) => T): T {
  ensureDataDir(deps.config.dataDir);
  const db = openDb(dataPaths(deps.config.dataDir).db);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api', libraryRoutes(deps));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ message: 'Erreur interne du serveur.' }, 500);
  });
  return app;
}
