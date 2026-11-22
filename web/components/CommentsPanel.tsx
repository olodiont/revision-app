import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Comment, Id } from '../../shared/types';

interface Props {
  comments: Comment[];
  /** Element that contains the rendered correction (where the <mark>s are). */
  correctionRef: RefObject<HTMLElement | null>;
  /** Element both columns scroll in; tops are measured relative to it. */
  scrollRef: RefObject<HTMLElement | null>;
  renderThread: (c: Comment) => ReactNode;
  /** Cards not backed by a saved comment yet (question being written, question waiting for Claude). */
  extras: { key: string; start: number; node: ReactNode }[];
  /** The opened comment: shown next to its passage even when it is resolved, and scrolled into view. */
  activeId: Id | null;
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

export function CommentsPanel({ comments, correctionRef, scrollRef, renderThread, extras, activeId, layoutKey, aligned }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [tops, setTops] = useState<Record<string, number>>({});
  const [height, setHeight] = useState(0);
  const [showResolved, setShowResolved] = useState(false);

  const isActive = (c: Comment) => c.id === activeId;
  // Open comments, plus a resolved one while it is opened again, sit next to their passage.
  const inline = comments.filter((c) => c.kind === 'passage' && c.anchor
    && (c.status === 'open' || (c.status === 'resolved' && isActive(c))));
  const resolved = comments.filter((c) => c.kind === 'passage' && c.status === 'resolved' && !isActive(c));
  const detached = comments.filter((c) => c.kind === 'passage' && c.status === 'detached');
  const checks = comments.filter((c) => c.kind === 'check-answer');

  type Item = { key: string; start: number; node: () => ReactNode };
  const items: Item[] = [
    ...inline.map((c) => ({ key: `c${c.id}`, start: c.anchor!.start, node: () => renderThread(c) })),
    ...extras.map((x) => ({ key: x.key, start: x.start, node: () => x.node })),
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

  // On narrow screens comments are listed below the correction: bring the opened one into view.
  // Beside the correction the card already sits next to its passage, so never scroll there: a card that
  // just appeared is briefly at the top of the margin, and scrolling to it sent the page back to the top.
  useEffect(() => {
    if (activeId === null || aligned) return;
    const t = setTimeout(() => cardRefs.current[`c${activeId}`]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
    return () => clearTimeout(t);
  }, [activeId, aligned]);

  void scrollRef;
  void layoutKey;

  return (
    <div ref={panelRef} className="relative">
      {aligned ? (
        <div className="relative" style={{ height }}>
          {items.map((it) => (
            <div key={it.key} ref={(el) => { cardRefs.current[it.key] = el; }}
              className={`absolute left-0 right-0 ${tops[it.key] === undefined ? '' : 'transition-[top] duration-150'}`}
              // A new card stays invisible until it is placed next to its passage (no slide from the top).
              style={{ top: tops[it.key] ?? 0, visibility: tops[it.key] === undefined ? 'hidden' : undefined }}>
              {it.node()}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {items.length > 0 && <p className="text-sm font-medium text-muted">Commentaires</p>}
          {items.map((it) => <div key={it.key} ref={(el) => { cardRefs.current[it.key] = el; }}>{it.node()}</div>)}
        </div>
      )}

      <Section title={`✓ ${resolved.length} résolu${resolved.length > 1 ? 's' : ''}`} hidden={!resolved.length}
        open={showResolved} onToggle={() => setShowResolved((s) => !s)}>
        <p className="text-xs text-muted">Toujours surlignés en jaune très pâle : clique sur le passage pour les rouvrir.</p>
        {resolved.map((c) => <div key={c.id}>{renderThread(c)}</div>)}
      </Section>
      <Section title="Commentaires détachés" hidden={!detached.length} open>
        <p className="text-xs text-muted">Leur passage n'existe plus dans la correction actuelle.</p>
        {detached.map((c) => <div key={c.id} ref={(el) => { cardRefs.current[`c${c.id}`] = el; }}>{renderThread(c)}</div>)}
      </Section>
      <Section title="Mes réponses vérifiées" hidden={!checks.length} open>
        {checks.map((c) => <div key={c.id} ref={(el) => { cardRefs.current[`c${c.id}`] = el; }}>{renderThread(c)}</div>)}
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
