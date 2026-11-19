import { useEffect, useRef, useState } from 'react';
import type { AiTask } from '../lib/useAi';
import { Markdown } from './Markdown';

const shortQuote = (quote: string) => {
  const q = quote.replace(/\s+/g, ' ').trim();
  return q.length > 80 ? `${q.slice(0, 77)}…` : q;
};

interface NewProps {
  quote: string;
  onSend: (question: string) => void;
  onDiagram: () => void;
  onCancel: () => void;
}

/** Card for writing the first question on a freshly selected passage. */
export function NewCommentCard({ quote, onSend, onDiagram, onCancel }: NewProps) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  // Focus without scrolling: the card is positioned next to its passage only after the first layout,
  // and a plain focus (or autoFocus) would scroll the page to where it briefly sat (the top).
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="rounded-lg border border-accent bg-panel p-3 text-sm shadow-md">
      <p className="text-xs text-muted">« {shortQuote(quote)} »</p>
      <textarea
        ref={box}
        className="field mt-2 min-h-20"
        placeholder="Ta question sur ce passage…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && q.trim()) onSend(q.trim()); }}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="btn btn-primary" disabled={!q.trim()} onClick={() => onSend(q.trim())}>Envoyer</button>
        <button className="btn" onClick={onDiagram}>Schéma ici</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
      </div>
      <p className="mt-1.5 text-xs text-muted">Ctrl+Entrée pour envoyer. Seuls l'énoncé, la correction, ce passage et ce fil sont envoyés à Claude.</p>
    </div>
  );
}

interface PendingProps {
  quote: string;
  question: string;
  task?: AiTask;
  onRetry: () => void;
  onCancel: () => void;
}

/** A question sent on a new passage, shown while Claude answers (and kept if the call fails). */
export function PendingCommentCard({ quote, question, task, onRetry, onCancel }: PendingProps) {
  return (
    <div className="rounded-lg border border-accent bg-panel p-3 text-sm shadow-md">
      <p className="text-xs text-muted">« {shortQuote(quote)} »</p>
      <div className="mt-2 space-y-2">
        <div className="rounded-md bg-sunken px-2.5 py-1.5 whitespace-pre-wrap">{question}</div>
        {task?.text ? <Markdown source={task.text} className="prose-sm" /> : !task?.error && <p className="text-muted">Claude réfléchit…</p>}
        {task?.error && (
          <div className="rounded-md border border-danger/60 p-2 text-danger">
            <p>{task.error}</p>
            <div className="mt-1.5 flex gap-1.5">
              <button className="btn" onClick={onRetry}>Réessayer</button>
              <button className="btn btn-ghost" onClick={onCancel}>Abandonner</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
