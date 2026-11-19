import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { defaultConfigPath, loadConfig } from './config';
import { createApp } from './app';

const configPath = defaultConfigPath();
const config = loadConfig(configPath);
const app = createApp({ db: undefined, config, configPath, provider: undefined, openPath: () => {} });

app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, (info) => {
  console.log(`Révision : http://127.0.0.1:${info.port}`);
});
