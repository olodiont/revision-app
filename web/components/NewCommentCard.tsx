import { useState } from 'react';
import type { AiTask } from '../lib/useAi';
import { Markdown } from './Markdown';

interface Props {
  quote: string;
  task?: AiTask;
  onSend: (question: string) => void;
  onDiagram: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

export function NewCommentCard({ quote, task, onSend, onDiagram, onCancel, onRetry }: Props) {
  const [q, setQ] = useState('');
  const busy = !!task?.running;
  const shown = quote.replace(/\s+/g, ' ').trim();
  return (
    <div className="rounded-lg border border-accent bg-panel p-3 text-sm shadow-md">
      <p className="text-xs text-muted">« {shown.length > 80 ? `${shown.slice(0, 77)}…` : shown} »</p>
      {task && (task.running || task.text || task.error) ? (
        <div className="mt-2 space-y-2">
          <div className="rounded-md bg-sunken px-2.5 py-1.5 whitespace-pre-wrap">{q}</div>
          {task.text ? <Markdown source={task.text} className="prose-sm" /> : task.running && <p className="text-muted">Claude réfléchit…</p>}
          {task.error && (
            <div className="rounded-md border border-danger/60 p-2 text-danger">
              <p>{task.error}</p>
              <button className="btn mt-1.5" onClick={onRetry}>Réessayer</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <textarea
            autoFocus
            className="field mt-2 min-h-20"
            placeholder="Ta question sur ce passage…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && q.trim()) onSend(q.trim()); }}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="btn btn-primary" disabled={!q.trim() || busy} onClick={() => onSend(q.trim())}>Envoyer</button>
            <button className="btn" disabled={busy} onClick={() => { setQ('Fais un schéma qui explique ce passage.'); onDiagram(); }}>Schéma ici</button>
            <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          </div>
          <p className="mt-1.5 text-xs text-muted">Ctrl+Entrée pour envoyer. Seuls l'énoncé, la correction, ce passage et ce fil sont envoyés à Claude.</p>
        </>
      )}
    </div>
  );
}
