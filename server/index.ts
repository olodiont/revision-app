import { dirname, join } from 'node:path';
import { serve } from '@hono/node-server';
import { defaultConfigPath, loadConfig } from './config';
import { createApp } from './app';
import { mountStatic } from './static';
import { dataPaths, ensureDataDir, openInExplorer } from './files/storage';
import { createCliProvider, findClaudeCommand } from './claude/cliProvider';
import { createPresence } from './presence';
import { openAppWindow, type AppWindow } from './appWindow';

const configPath = process.env.REVISION_CONFIG ?? defaultConfigPath();
const config = loadConfig(configPath);
ensureDataDir(config.dataDir);
const url = `http://127.0.0.1:${config.port}`;

let appWindow: AppWindow | null = null;
let stopping = false;

/** Stops the app: closes its window (if we opened it) and ends the process, which closes the console. */
function shutdown(reason: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`\n${reason} Fermeture de Révision.`);
  appWindow?.close();
  setTimeout(() => process.exit(0), 200);
}

const presence = createPresence({ graceMs: 5000, onIdle: () => shutdown("Plus aucune page de l'app n'est ouverte.") });
const provider = createCliProvider({ cwd: () => dataPaths(config.dataDir).claudeCwd, command: findClaudeCommand() });
const app = createApp({ config, configPath, provider, openPath: openInExplorer, presence });

mountStatic(app);

/** Opens the app window (Edge app mode), or the default browser if Edge is not available. */
function openWindow(): void {
  if (process.env.REVISION_OPEN !== '1') return;
  appWindow = openAppWindow({
    url,
    profileDir: join(dirname(configPath), 'window-profile'),
    onClosed: () => { /* the presence stream notices the closed page and stops the server */ },
  });
  if (!appWindow) openInExplorer(url);
}

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, () => {
  console.log(`Révision : ${url}`);
  console.log("Cette fenêtre se ferme toute seule quand tu fermes l'app. La fermer ferme aussi l'app.");
  openWindow();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    // Already running: just show it.
    console.log('Révision tourne déjà : ouverture de la fenêtre.');
    if (process.env.REVISION_OPEN === '1') openInExplorer(url);
    setTimeout(() => process.exit(0), 500);
    return;
  }
  throw err;
});

// Closing the console window (SIGHUP on Windows) or Ctrl+C also closes the app window.
for (const sig of ['SIGHUP', 'SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
  process.on(sig, () => shutdown('Console fermée.'));
}
