import { serve } from '@hono/node-server';
import { defaultConfigPath, loadConfig } from './config';
import { createApp } from './app';
import { mountStatic } from './static';
import { dataPaths, ensureDataDir, openInExplorer } from './files/storage';
import { createCliProvider, findClaudeCommand } from './claude/cliProvider';

const configPath = process.env.REVISION_CONFIG ?? defaultConfigPath();
const config = loadConfig(configPath);
ensureDataDir(config.dataDir);
const provider = createCliProvider({ cwd: () => dataPaths(config.dataDir).claudeCwd, command: findClaudeCommand() });
const app = createApp({ config, configPath, provider, openPath: openInExplorer });

mountStatic(app);

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, (info) => {
  console.log(`Révision : http://127.0.0.1:${info.port}`);
});
