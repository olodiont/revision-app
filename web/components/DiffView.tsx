import { diffWords } from 'diff';

/** Word-level before/after view: removed words struck through, added words highlighted. */
export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  return (
    <div className="whitespace-pre-wrap rounded-md border border-line bg-sunken p-3 font-mono text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.removed ? <del key={i} className="bg-danger/15 text-danger">{p.value}</del>
          : p.added ? <ins key={i} className="bg-ok/15 text-ok no-underline">{p.value}</ins>
            : <span key={i}>{p.value}</span>)}
    </div>
  );
}
