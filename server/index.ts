import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { defaultConfigPath, loadConfig } from './config';
import { createApp } from './app';
import { dataPaths, ensureDataDir, openInExplorer } from './files/storage';
import { createCliProvider } from './claude/cliProvider';

const configPath = defaultConfigPath();
const config = loadConfig(configPath);
ensureDataDir(config.dataDir);
const provider = createCliProvider({ cwd: dataPaths(config.dataDir).claudeCwd });
const app = createApp({ config, configPath, provider, openPath: openInExplorer });

app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, (info) => {
  console.log(`Révision : http://127.0.0.1:${info.port}`);
});
