import type { Comment, CorrectionVersion } from '../../shared/types';
import { quoteLabel } from './CommentThread';

const REASON: Record<CorrectionVersion['reason'], string> = {
  initial: 'première version', fix: 'passage corrigé', regenerate: 'refaite',
};

interface Props {
  versions: CorrectionVersion[];
  viewing: number;
  comments: Comment[];
  onView: (n: number) => void;
  onRegenerate: () => void;
  busy: boolean;
}

export function versionLabel(v: CorrectionVersion, comments: Comment[]): string {
  const date = new Date(v.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  let label = `Version ${v.number} — ${REASON[v.reason]}, ${date}`;
  if (v.reason === 'fix' && v.triggerCommentId) {
    const c = comments.find((x) => x.id === v.triggerCommentId);
    if (c?.anchor) label += `, suite au commentaire « ${quoteLabel(c)} »`;
  }
  if (v.reason === 'regenerate' && v.instruction) label += ` (« ${v.instruction} »)`;
  return label;
}

export function VersionBar({ versions, viewing, comments, onView, onRegenerate, busy }: Props) {
  const latest = versions.at(-1)!;
  const v = versions.find((x) => x.number === viewing) ?? latest;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <h2 className="mr-auto text-base font-semibold">Correction</h2>
      {versions.length > 1 && (
        <select className="field w-auto py-1 text-xs" value={viewing} onChange={(e) => onView(Number(e.target.value))}
          aria-label="Version affichée" title={versionLabel(v, comments)}>
          {versions.map((x) => <option key={x.id} value={x.number}>v{x.number}{x.number === latest.number ? ' (actuelle)' : ''}</option>)}
        </select>
      )}
      <button className="btn" disabled={busy} onClick={onRegenerate} title="Demander à Claude de réécrire toute la correction">Refaire</button>
    </div>
  );
}
