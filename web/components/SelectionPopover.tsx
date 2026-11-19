export interface Point { x: number; y: number }

/**
 * Where to show the "Commenter" button: just below the end of the selection.
 * Browser helpers (Opera, Edge, translators…) pop up *above* a selection, so below stays clickable.
 */
export function popoverPoint(rects: DOMRect[]): Point {
  const last = rects.filter((r) => r.width > 0 || r.height > 0).at(-1) ?? rects.at(-1);
  if (!last) return { x: 70, y: 8 };
  const x = Math.min(Math.max(last.right, 70), window.innerWidth - 70);
  const y = Math.min(last.bottom + 8, window.innerHeight - 44);
  return { x, y };
}

interface Props { point: Point; onComment: () => void }

/** Small floating button shown under a text selection in the correction. */
export function SelectionPopover({ point, onComment }: Props) {
  return (
    <button
      className="btn btn-primary fixed z-30 -translate-x-1/2 shadow-lg"
      style={{ top: `${point.y}px`, left: `${point.x}px` }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onComment}
    >
      💬 Commenter
    </button>
  );
}
