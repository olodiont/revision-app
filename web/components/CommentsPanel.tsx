import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Comment, Id } from '../../shared/types';

interface Props {
  comments: Comment[];
  /** Element that contains the rendered correction (where the <mark>s are). */
  correctionRef: RefObject<HTMLElement | null>;
  /** Element both columns scroll in; tops are measured relative to it. */
  scrollRef: RefObject<HTMLElement | null>;
  renderThread: (c: Comment) => ReactNode;
  /** A card being written for a new selection, positioned at that source offset. */
  draft: { start: number; node: ReactNode } | null;
  layoutKey: unknown;
  /** false on narrow screens: cards are listed in order instead of aligned with their passage. */
  aligned: boolean;
}

const GAP = 8;

/** Finds the vertical position of the source offset in the rendered correction. */
function topOfOffset(root: HTMLElement, offset: number, base: number): number | null {
  let best: { el: HTMLElement; s: number } | null = null;
  for (const el of root.querySelectorAll<HTMLElement>('[data-s], [data-block-start]')) {
    const s = Number(el.dataset.s ?? el.dataset.blockStart);
    if (s <= offset && (!best || s >= best.s)) best = { el, s };
  }
  return best ? best.el.getBoundingClientRect().top - base : null;
}

export function CommentsPanel({ comments, correctionRef, scrollRef, renderThread, draft, layoutKey, aligned }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [tops, setTops] = useState<Record<string, number>>({});
  const [height, setHeight] = useState(0);
  const [showResolved, setShowResolved] = useState(false);

  const open = comments.filter((c) => c.kind === 'passage' && c.status === 'open' && c.anchor);
  const resolved = comments.filter((c) => c.kind === 'passage' && c.status === 'resolved');
  const detached = comments.filter((c) => c.kind === 'passage' && c.status === 'detached');
  const checks = comments.filter((c) => c.kind === 'check-answer');

  type Item = { key: string; start: number };
  const items: Item[] = [
    ...open.map((c) => ({ key: `c${c.id}`, start: c.anchor!.start })),
    ...(draft ? [{ key: 'draft', start: draft.start }] : []),
  ].sort((a, b) => a.start - b.start);

  useLayoutEffect(() => {
    if (!aligned) return;
    const compute = () => {
      const root = correctionRef.current;
      const panel = panelRef.current;
      if (!root || !panel) return;
      const base = panel.getBoundingClientRect().top;
      const next: Record<string, number> = {};
      let bottom = 0;
      for (const it of items) {
        const want = topOfOffset(root, it.start, base) ?? bottom;
        const top = Math.max(want, bottom);
        next[it.key] = top;
        bottom = top + (cardRefs.current[it.key]?.offsetHeight ?? 80) + GAP;
      }
      setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setHeight(bottom);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (correctionRef.current) ro.observe(correctionRef.current);
    Object.values(cardRefs.current).forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  });

  void scrollRef;
  void layoutKey;

  return (
    <div ref={panelRef} className="relative">
      {aligned ? (
        <div className="relative" style={{ height }}>
          {items.map((it) => {
            const c = open.find((x) => `c${x.id}` === it.key);
            return (
              <div key={it.key} ref={(el) => { cardRefs.current[it.key] = el; }} className="absolute left-0 right-0 transition-[top] duration-150"
                style={{ top: tops[it.key] ?? 0 }}>
                {it.key === 'draft' ? draft!.node : c && renderThread(c)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {items.length > 0 && <p className="text-sm font-medium text-muted">Commentaires</p>}
          {items.map((it) => {
            const c = open.find((x) => `c${x.id}` === it.key);
            return <div key={it.key}>{it.key === 'draft' ? draft!.node : c && renderThread(c)}</div>;
          })}
        </div>
      )}

      <Section title={`✓ ${resolved.length} résolu${resolved.length > 1 ? 's' : ''}`} hidden={!resolved.length}
        open={showResolved} onToggle={() => setShowResolved((s) => !s)}>
        {resolved.map((c) => <div key={c.id}>{renderThread(c)}</div>)}
      </Section>
      <Section title="Commentaires détachés" hidden={!detached.length} open>
        <p className="text-xs text-muted">Leur passage n'existe plus dans la correction actuelle.</p>
        {detached.map((c) => <div key={c.id}>{renderThread(c)}</div>)}
      </Section>
      <Section title="Mes réponses vérifiées" hidden={!checks.length} open>
        {checks.map((c) => <div key={c.id}>{renderThread(c)}</div>)}
      </Section>
    </div>
  );
}

function Section({ title, hidden, open, onToggle, children }: {
  title: string; hidden: boolean; open: boolean; onToggle?: () => void; children: ReactNode;
}) {
  if (hidden) return null;
  return (
    <div className="mt-4 space-y-2 border-t border-line pt-3">
      {onToggle
        ? <button className="text-sm font-medium text-muted hover:text-ink" onClick={onToggle}>{open ? '▾' : '▸'} {title}</button>
        : <p className="text-sm font-medium text-muted">{title}</p>}
      {open && children}
    </div>
  );
}

export type { Id };
