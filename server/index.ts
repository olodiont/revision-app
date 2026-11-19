import { serve } from '@hono/node-server';
import { defaultConfigPath, loadConfig } from './config';
import { createApp } from './app';
import { mountStatic } from './static';
import { dataPaths, ensureDataDir, openInExplorer } from './files/storage';
import { createCliProvider, findClaudeCommand } from './claude/cliProvider';
import { createPresence } from './presence';

const configPath = process.env.REVISION_CONFIG ?? defaultConfigPath();
const config = loadConfig(configPath);
ensureDataDir(config.dataDir);
const url = `http://127.0.0.1:${config.port}`;

let stopping = false;

/** Stops the app: ends the process, which closes the console window. */
function shutdown(reason: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`\n${reason} Fermeture de Révision.`);
  setTimeout(() => process.exit(0), 200);
}

const presence = createPresence({ graceMs: 5000, onIdle: () => shutdown("Plus aucune page de l'app n'est ouverte.") });
const provider = createCliProvider({ cwd: () => dataPaths(config.dataDir).claudeCwd, command: findClaudeCommand() });
const app = createApp({ config, configPath, provider, openPath: openInExplorer, presence });

mountStatic(app);

/** Opens the app in the user's usual browser (normal tab). */
function openWindow(): void {
  if (process.env.REVISION_OPEN === '1') openInExplorer(url);
}

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, () => {
  console.log(`Révision : ${url}`);
  console.log("Cette fenêtre se ferme toute seule quand tu fermes l'onglet de l'app. La fermer arrête l'app.");
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

// Closing the console window (SIGHUP on Windows) or Ctrl+C stops the app; the open tab then says so.
for (const sig of ['SIGHUP', 'SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
  process.on(sig, () => shutdown('Console fermée.'));
}
