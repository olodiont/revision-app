import { useEffect, useId, useState } from 'react';
import { DiagramError } from './DiagramError';

let ready: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid() {
  ready ??= import('mermaid').then((m) => {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral' });
    return m.default;
  });
  return ready;
}

export function Mermaid({ source }: { source: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);
    (async () => {
      try {
        const mermaid = await loadMermaid();
        await mermaid.parse(source);
        const out = await mermaid.render(id, source);
        if (!cancelled) setSvg(out.svg);
      } catch (e) {
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setError(e instanceof Error ? e.message.split('\n')[0] : 'syntaxe invalide.');
      }
    })();
    return () => { cancelled = true; };
  }, [source, id]);

  if (error) return <DiagramError source={source} error={error} />;
  if (!svg) return <div className="my-3 text-sm text-muted font-sans">Dessin du schéma…</div>;
  return <div className="my-3 flex justify-center [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}
