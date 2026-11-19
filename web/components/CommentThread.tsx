import { useState } from 'react';
import type { Comment, Message } from '../../shared/types';
import type { AiTask } from '../lib/useAi';
import { Markdown } from './Markdown';

interface Props {
  comment: Comment;
  messages: Message[];
  active: boolean;
  task?: AiTask;
  onActivate: () => void;
  onAsk: (question: string) => void;
  onDiagram: (request: string) => void;
  onFix?: () => void;
  onToggleResolved: () => void;
  onDelete: () => void;
  onRetry: () => void;
}

export function quoteLabel(c: Comment): string {
  if (!c.anchor) return '';
  const q = c.anchor.exact.replace(/\s+/g, ' ').trim();
  return q.length > 80 ? `${q.slice(0, 77)}…` : q;
}

export function CommentThread({
  comment, messages, active, task, onActivate, onAsk, onDiagram, onFix, onToggleResolved, onDelete, onRetry,
}: Props) {
  const [draft, setDraft] = useState('');
  const busy = !!task?.running;
  const first = messages.find((m) => m.role === 'user');

  const card = `rounded-lg border bg-panel text-sm shadow-sm transition-shadow ${active ? 'border-accent shadow-md' : 'border-line'}`;

  if (!active) {
    return (
      <button className={`${card} block w-full p-3 text-left hover:shadow-md`} onClick={onActivate}>
        {comment.anchor && <p className="truncate text-xs text-muted">« {quoteLabel(comment)} »</p>}
        <p className="mt-1 line-clamp-2">{first?.content ?? '…'}</p>
        <p className="mt-1 text-xs text-muted">
          {messages.length} message{messages.length > 1 ? 's' : ''}
          {comment.changed && <span className="ml-2 rounded bg-mark px-1">passage modifié</span>}
          {busy && <span className="ml-2 text-accent">Claude écrit…</span>}
          {task?.error && <span className="ml-2 text-danger">erreur</span>}
        </p>
      </button>
    );
  }

  const send = () => {
    const q = draft.trim();
    if (!q || busy) return;
    onAsk(q);
    setDraft('');
  };

  return (
    <div className={`${card} p-3`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-2">
        {comment.anchor ? (
          <p className="text-xs text-muted">« {quoteLabel(comment)} »</p>
        ) : <p className="text-xs text-muted">Réponse vérifiée</p>}
        <div className="flex shrink-0 gap-1 text-xs">
          {comment.changed && <span className="rounded bg-mark px-1">passage modifié</span>}
        </div>
      </div>

      <div className="mt-2 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'rounded-md bg-sunken px-2.5 py-1.5' : ''}>
            {m.role === 'user'
              ? <p className="whitespace-pre-wrap">{m.content}</p>
              : <Markdown source={m.content} className="prose-sm" />}
          </div>
        ))}
        {task && (task.running || task.text) && (
          <div className="opacity-80">
            {task.text ? <Markdown source={task.text} className="prose-sm" /> : <p className="text-muted">Claude réfléchit…</p>}
          </div>
        )}
        {task?.error && (
          <div className="rounded-md border border-danger/60 p-2 text-danger">
            <p>{task.error}</p>
            <button className="btn mt-1.5" onClick={onRetry}>Réessayer</button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          className="field min-h-16 text-sm"
          placeholder="Relancer dans ce fil…"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
        />
        <div className="flex flex-wrap gap-1.5">
          <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={send}>Envoyer</button>
          {comment.anchor && (
            <button className="btn" disabled={busy} title="Claude dessine un schéma de ce passage"
              onClick={() => { onDiagram(draft.trim()); setDraft(''); }}>Schéma ici</button>
          )}
          {onFix && comment.anchor && comment.status !== 'detached' && (
            <button className="btn" disabled={busy} title="Claude propose une nouvelle version de ce passage" onClick={onFix}>
              Corriger la correction
            </button>
          )}
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-xs">
          <button className="text-muted hover:text-ink" onClick={onToggleResolved}>
            {comment.status === 'resolved' ? 'Rouvrir' : '✓ Marquer résolu'}
          </button>
          <button className="text-danger hover:underline" onClick={() => { if (confirm('Supprimer ce commentaire et son fil ?')) onDelete(); }}>
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
