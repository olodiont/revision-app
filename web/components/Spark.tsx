/** Orange starburst in the spirit of Claude's mark: thick, blunt rays of slightly uneven length and angle. */
const RAYS: { len: number; jitter: number; w: number }[] = [
  { len: 47, jitter: 0, w: 5.2 }, { len: 39, jitter: 4, w: 4.6 }, { len: 45, jitter: -3, w: 5 },
  { len: 37, jitter: 2, w: 4.4 }, { len: 48, jitter: -2, w: 5.3 }, { len: 41, jitter: 5, w: 4.8 },
  { len: 44, jitter: -4, w: 5 }, { len: 38, jitter: 1, w: 4.5 }, { len: 46, jitter: 3, w: 5.2 },
  { len: 40, jitter: -1, w: 4.7 }, { len: 43, jitter: 2, w: 5 }, { len: 36, jitter: -3, w: 4.4 },
];

function rayPath(i: number, n: number, { len, jitter, w }: (typeof RAYS)[number]): string {
  const a = ((i / n) * 360 + jitter - 90) * (Math.PI / 180);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy;
  const py = dx;
  const pt = (along: number, side: number) => `${(50 + dx * along + px * side).toFixed(2)},${(50 + dy * along + py * side).toFixed(2)}`;
  // Wide near the centre, a bit narrower at the blunt tip.
  return `M${pt(4, -w)} L${pt(len, -w * 0.72)} L${pt(len + 1.2, 0)} L${pt(len, w * 0.72)} L${pt(4, w)} Z`;
}

export function Spark({ className = '', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <g fill="var(--color-brand)">
        {RAYS.map((r, i) => <path key={i} d={rayPath(i, RAYS.length, r)} />)}
        <circle cx="50" cy="50" r="9" />
      </g>
    </svg>
  );
}
