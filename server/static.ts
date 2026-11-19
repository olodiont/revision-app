import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

/** Serves the built web app from ./dist; unknown pages get index.html, unknown assets/API paths a 404. */
export function mountStatic(app: Hono): void {
  app.use('/*', serveStatic({ root: './dist' }));
  const index = serveStatic({ path: './dist/index.html' });
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/assets/') || c.req.path.startsWith('/api/')) return c.notFound();
    return index(c, next);
  });
}
