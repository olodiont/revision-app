import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface AppConfig {
  dataDir: string;
  model: string | null;
  port: number;
}

export function defaultConfig(): AppConfig {
  return {
    dataDir: join(homedir(), 'Documents', 'Revision', 'revision-data'),
    model: null,
    port: 5317,
  };
}

export function defaultConfigPath(): string {
  const base = process.platform === 'win32'
    ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
    : join(homedir(), '.config');
  return join(base, 'revision-app', 'config.json');
}

export function saveConfig(configPath: string, cfg: AppConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
}

export function loadConfig(configPath: string): AppConfig {
  if (!existsSync(configPath)) {
    const cfg = defaultConfig();
    saveConfig(configPath, cfg);
    return cfg;
  }
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<AppConfig>;
  return { ...defaultConfig(), ...raw };
}
