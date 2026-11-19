import { useEffect, useMemo, useRef, useState } from 'react';
import { DiagramError } from './DiagramError';

export function FunctionPlot({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try {
      const spec = JSON.parse(source);
      if (!spec || typeof spec !== 'object' || !Array.isArray(spec.data)) return { error: 'il manque la liste "data".' };
      return { spec };
    } catch {
      return { error: 'JSON invalide.' };
    }
  }, [source]);

  useEffect(() => {
    if (!('spec' in parsed) || !ref.current) return;
    const target = ref.current;
    let cancelled = false;
    setRuntimeError(null);
    import('function-plot').then((mod) => {
      if (cancelled) return;
      // The package is CommonJS: depending on the bundler the function is `default` or `default.default`.
      const m = mod as unknown as { default?: unknown };
      const functionPlot = (typeof m.default === 'function' ? m.default : (m.default as { default?: unknown })?.default) as
        (opts: Record<string, unknown>) => unknown;
      if (typeof functionPlot !== 'function') throw new Error('bibliothèque de courbes indisponible.');
      try {
        target.innerHTML = '';
        const width = Math.min(560, target.clientWidth || 560);
        functionPlot({ width, height: Math.round(width * 0.65), ...parsed.spec, target });
      } catch (e) {
        setRuntimeError(e instanceof Error ? e.message : 'erreur de tracé.');
      }
    }).catch(() => setRuntimeError('bibliothèque de courbes indisponible.'));
    return () => { cancelled = true; };
  }, [parsed]);

  if ('error' in parsed) return <DiagramError source={source} error={parsed.error!} />;
  if (runtimeError) return <DiagramError source={source} error={runtimeError} />;
  return <div ref={ref} className="my-3 flex justify-center font-sans text-ink [&_text]:fill-current" />;
}
