/*
 * Development aid: runs the app with a scripted fake Claude (no Claude Code, no tokens),
 * so the interface can be tried end to end. Usage: REVISION_CONFIG=<config.json> npx tsx scripts/demo-server.ts
 */
import { serve } from '@hono/node-server';
import { createApp } from '../server/app';
import { mountStatic } from '../server/static';
import { answer, createFakeProvider } from '../server/claude/fakeProvider';
import { defaultConfigPath, loadConfig } from '../server/config';
import { ensureDataDir } from '../server/files/storage';

const FENCE = '```';
// String.raw keeps the LaTeX backslashes as they are.
const CORRECTION = String.raw`## Outils utiles

- **Intégration par parties** : $\int_a^b u\,v' = [u\,v]_a^b - \int_a^b u'\,v$.
- On dérive la partie qui se simplifie (logarithme, polynôme), on intègre l'autre.

## Exercice 1

> Calculer $\int_1^e \ln x \, dx$.

### Correction

On pose $u = \ln x$ et $v' = 1$, donc $u' = \frac{1}{x}$ et $v = x$.

$$
\int_1^e \ln x \, dx = \big[x \ln x\big]_1^e - \int_1^e 1 \, dx = e - (e - 1) = 1
$$

## Exercice 2

> Calculer $\int_0^1 x e^x \, dx$.

### Correction

On pose $u = x$ et $v' = e^x$ : $\int_0^1 x e^x dx = [x e^x]_0^1 - \int_0^1 e^x dx = e - (e - 1) = 1$.

En Python on peut vérifier :

${FENCE}python
from math import exp
n = 100000
print(sum((i / n) * exp(i / n) for i in range(n)) / n)
${FENCE}`;

const provider = createFakeProvider((req) => {
  const p = req.prompt;
  if (p.includes('===REMPLACEMENT===')) return answer('===REMPLACEMENT===\non pose $u = \\ln(x)$ (donc $u\' = 1/x$) et $dv = 1 \\, dx$');
  if (p.includes('Invente un exercice similaire')) return answer('===ENONCE===\nCalculer $\\int_1^e x \\ln x \\, dx$.\n===CORRECTION===\nOn pose $u = \\ln x$, $dv = x\\,dx$…');
  if (p.includes('Réécris entièrement')) return answer(`===CORRECTION===\n${CORRECTION.replace('On intègre', 'Version détaillée : on intègre')}`);
  if (p.includes('Produis un schéma') || p.includes('schéma')) {
    return answer('Voici la courbe de $\\ln x$ et l\'aire calculée :\n\n```function-plot\n{"xAxis":{"domain":[0,3.2]},"yAxis":{"domain":[-1.5,1.5]},"grid":true,"data":[{"fn":"log(x)"},{"fn":"log(x)","range":[1,2.718],"closed":true}]}\n```\n\nEt la démarche :\n\n```mermaid\nflowchart LR\n  A["∫ ln x dx"] --> B["u = ln x, dv = dx"]\n  B --> C["x ln x − ∫ 1 dx"]\n  C --> D["= 1"]\n```');
  }
  if (p.includes('Compare la réponse')) return answer('Ton calcul est juste jusqu\'à l\'étape 2. À l\'étape 3, tu as oublié le signe moins devant $\\int 1\\,dx$.');
  if (p.includes('===CORRECTION===')) return answer(`===CORRECTION===\n${CORRECTION}`);
  return answer('Parce que $\\ln x$ devient plus simple quand on le dérive ($\\frac{1}{x}$), alors que $1$ est facile à intégrer. C\'est la règle **LIATE** : on dérive le logarithme en priorité.');
});

const configPath = process.env.REVISION_CONFIG ?? defaultConfigPath();
const config = loadConfig(configPath);
ensureDataDir(config.dataDir);
const app = createApp({ config, configPath, provider, openPath: (p) => console.log('[demo] ouvrir', p) });
mountStatic(app);
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, (i) => console.log(`Démo (faux Claude) : http://127.0.0.1:${i.port}`));
