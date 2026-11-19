import { Hono } from 'hono';
import { withDb, type AppDeps } from '../app';
import * as repo from '../db/repo';

/** Comment routes that never call Claude. */
export function commentRoutes(deps: AppDeps): Hono {
  const r = new Hono();

  r.patch('/comments/:id', async (c) => {
    const { status } = await c.req.json<{ status: string }>();
    if (status !== 'open' && status !== 'resolved') return c.json({ message: 'Statut invalide.' }, 400);
    withDb(deps, (db) => repo.updateComment(db, Number(c.req.param('id')), { status }));
    return c.json({ ok: true });
  });

  r.delete('/comments/:id', (c) => {
    withDb(deps, (db) => repo.deleteComment(db, Number(c.req.param('id'))));
    return c.json({ ok: true });
  });

  return r;
}
