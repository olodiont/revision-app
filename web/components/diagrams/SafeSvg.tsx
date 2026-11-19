import DOMPurify from 'dompurify';
import { useMemo } from 'react';
import { DiagramError } from './DiagramError';

/**
 * Shows a model-written SVG as an <img>: an SVG image cannot run scripts, cannot load
 * external resources and its <style> cannot affect the page.
 */
export function SafeSvg({ source }: { source: string }) {
  const clean = useMemo(
    () => DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true } }),
    [source],
  );
  if (!/^\s*<svg[\s>]/i.test(clean)) return <DiagramError source={source} error="ce n'est pas un SVG valide." />;
  const withNs = /xmlns=/.test(clean) ? clean : clean.replace(/^\s*<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return (
    <div className="my-3 flex justify-center">
      <img alt="Schéma" className="max-w-full h-auto dark:invert dark:hue-rotate-180"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`} />
    </div>
  );
}
