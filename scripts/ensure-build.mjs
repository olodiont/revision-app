// Rebuilds the web interface only when its sources changed since the last build (faster start).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOURCES = ['web', 'public', 'shared', 'index.html', 'vite.config.ts', 'package.json'];
const TARGET = join('dist', 'index.html');

function newest(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(path).reduce((m, name) => Math.max(m, newest(join(path, name))), 0);
}

const built = existsSync(TARGET) ? statSync(TARGET).mtimeMs : 0;
const changed = Math.max(...SOURCES.map(newest));

if (changed > built) {
  console.log("Mise à jour de l'interface…");
  const r = spawnSync('npx', ['vite', 'build', '--logLevel', 'warn'], { stdio: 'inherit', shell: true });
  process.exit(r.status ?? 1);
}
