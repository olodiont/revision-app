interface Props { rect: DOMRect; onComment: () => void }

/** Small floating button shown above a text selection in the correction. */
export function SelectionPopover({ rect, onComment }: Props) {
  return (
    <button
      className="btn btn-primary fixed z-30 -translate-x-1/2 shadow-lg"
      style={{ top: Math.max(8, rect.top - 40), left: rect.left + rect.width / 2 }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onComment}
    >
      💬 Commenter
    </button>
  );
}
