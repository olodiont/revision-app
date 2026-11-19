import DOMPurify from 'dompurify';
import { useMemo } from 'react';
import { DiagramError } from './DiagramError';

export function SafeSvg({ source }: { source: string }) {
  const clean = useMemo(
    () => DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true } }),
    [source],
  );
  if (!/^\s*<svg[\s>]/i.test(clean)) return <DiagramError source={source} error="ce n'est pas un SVG valide." />;
  return <div className="my-3 flex justify-center [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: clean }} />;
}
