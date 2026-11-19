import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppConfig } from './config';
import { openDb, type Db } from './db/schema';
import { dataPaths, ensureDataDir } from './files/storage';
import type { ClaudeProvider } from './claude/provider';
import { aiRoutes } from './routes/ai';
import { commentRoutes } from './routes/comments';
import { exportRoutes } from './routes/export';
import { storageRoutes } from './routes/storage';
import { libraryRoutes } from './routes/library';

export interface AppDeps {
  config: AppConfig;
  configPath: string;
  provider: ClaudeProvider;
  openPath: (p: string) => void;
  /** Tracks open app pages so the server can stop when the last one closes (absent in tests/demo). */
  presence?: { join: () => () => void };
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

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isLocal(hostWithPort: string | undefined): boolean {
  if (!hostWithPort) return true;
  const host = hostWithPort.replace(/:\d+$/, '').toLowerCase();
  return LOCAL_HOSTS.has(host);
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  // Only this computer's own pages may use the app: refuse other websites (forged form posts that
  // would spend the subscription) and foreign Host names (DNS rebinding).
  app.use('*', async (c, next) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    const origin = c.req.header('origin');
    let originHost: string | undefined;
    try { originHost = origin && origin !== 'null' ? new URL(origin).host : origin ?? undefined; } catch { originHost = 'invalid'; }
    if (!isLocal(host) || (origin !== undefined && !isLocal(originHost === 'null' ? 'null' : originHost))) {
      return c.json({ message: 'Accès refusé.' }, 403);
    }
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  // Each open page keeps this stream open. It lets the server stop when the app is closed,
  // and lets the page notice when the server (its console window) was closed.
  app.get('/api/presence', (c) => streamSSE(c, async (stream) => {
    const leave = deps.presence?.join() ?? (() => {});
    let closed = false;
    stream.onAbort(() => { closed = true; leave(); });
    await stream.writeSSE({ event: 'hello', data: '{}' });
    while (!closed) {
      await stream.sleep(15_000);
      if (!closed) await stream.writeSSE({ event: 'ping', data: '{}' });
    }
  }));
  app.route('/api', libraryRoutes(deps));
  app.route('/api', commentRoutes(deps));
  app.route('/api', aiRoutes(deps));
  app.route('/api', storageRoutes(deps));
  app.route('/api', exportRoutes(deps));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ message: 'Erreur interne du serveur.' }, 500);
  });
  return app;
}
