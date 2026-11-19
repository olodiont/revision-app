import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { Hono } from 'hono';
import type { AppDeps } from '../app';
import { saveConfig } from '../config';
import { dataPaths, ensureDataDir, folderSize } from '../files/storage';

/** Folder where Claude Code keeps the transcripts of sessions run from `claudeCwd` (if it keeps any). */
export function claudeHistoryDir(claudeCwd: string): string {
  return join(homedir(), '.claude', 'projects', resolve(claudeCwd).replace(/[^A-Za-z0-9]/g, '-'));
}

export function storageRoutes(deps: AppDeps): Hono {
  const r = new Hono();

  r.get('/storage', (c) => {
    const { dataDir } = deps.config;
    const history = claudeHistoryDir(dataPaths(dataDir).claudeCwd);
    return c.json({
      dataDir,
      dataBytes: folderSize(dataDir),
      claudeHistoryDir: history,
      claudeHistoryBytes: folderSize(history),
      model: deps.config.model,
    });
  });

  r.post('/storage/open', async (c) => {
    const { target } = await c.req.json<{ target: 'data' | 'claudeHistory' }>();
    if (target === 'data') {
      ensureDataDir(deps.config.dataDir);
      deps.openPath(deps.config.dataDir);
      return c.json({ ok: true });
    }
    const history = claudeHistoryDir(dataPaths(deps.config.dataDir).claudeCwd);
    if (!existsSync(history)) return c.json({ message: "Aucun historique Claude Code pour l'instant." }, 404);
    deps.openPath(history);
    return c.json({ ok: true });
  });

  r.put('/settings', async (c) => {
    const body = await c.req.json<{ model?: string | null; dataDir?: string }>();
    let message = 'Réglages enregistrés.';
    if (body.model !== undefined) deps.config.model = body.model && body.model.trim() ? body.model.trim() : null;
    if (body.dataDir !== undefined && body.dataDir.trim()) {
      const next = resolve(body.dataDir.trim());
      if (!isAbsolute(next)) return c.json({ message: 'Chemin invalide.' }, 400);
      if (next !== resolve(deps.config.dataDir)) {
        try {
          mkdirSync(next, { recursive: true });
        } catch {
          return c.json({ message: "Impossible de créer ce dossier." }, 400);
        }
        deps.config.dataDir = next;
        ensureDataDir(next);
        message = "Nouveau dossier de stockage enregistré. Les données existantes n'ont pas été déplacées : copie-les toi-même si tu veux les garder.";
      }
    }
    saveConfig(deps.configPath, deps.config);
    return c.json({ ok: true, message });
  });

  return r;
}
