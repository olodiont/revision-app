import { useState } from 'react';
import type { Exercise, Id, LibraryTree } from '../../shared/types';
import { api } from '../api';
import { FilePicker } from './FilePicker';

interface Props { tree: LibraryTree; chapterId: Id; onCreated: (id: Id) => void }

const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.txt,.md';
const REASON = { type: 'type de fichier non pris en charge', size: 'fichier trop gros (30 Mo max)' } as const;

export function NewExerciseForm({ tree, chapterId, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<{ fileName: string; reason: 'type' | 'size' }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const place = tree.subjects.flatMap((s) => s.chapters.filter((c) => c.id === chapterId).map((c) => `${s.name} › ${c.name}`))[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statement.trim() && files.length === 0) { setError('Écris l\'énoncé ou joins au moins un fichier.'); return; }
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append('chapterId', String(chapterId));
    fd.append('title', title.trim() || 'Sans titre');
    fd.append('statementText', statement);
    files.forEach((f) => fd.append('files', f));
    try {
      const res = await api.send<{ exercise: Exercise; rejected: typeof rejected }>('POST', '/api/exercises', fd);
      if (res.rejected.length) {
        setRejected(res.rejected);
        setTimeout(() => onCreated(res.exercise.id), 2500);
      } else onCreated(res.exercise.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-8 space-y-5">
        <div>
          <p className="text-sm text-muted">{place ?? 'Chapitre'}</p>
          <h1 className="text-xl font-semibold">Nouvel exercice</h1>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Titre</span>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex : Exo 3 – TD4" autoFocus />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Énoncé (texte, formules en $…$ possibles)</span>
          <textarea className="field min-h-40 font-mono text-sm" value={statement} onChange={(e) => setStatement(e.target.value)}
            placeholder="Colle l'énoncé ici, ou joins une photo / un PDF / un Word ci-dessous." />
        </label>
        <div className="space-y-1">
          <span className="text-sm font-medium">Fichiers de l'énoncé (facultatif)</span>
          <FilePicker files={files} onChange={setFiles} accept={ACCEPT} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {rejected.length > 0 && (
          <div className="rounded-md border border-danger p-3 text-sm">
            <p className="font-medium">Exercice créé, mais ces fichiers ont été refusés :</p>
            <ul className="list-disc pl-5">{rejected.map((r) => <li key={r.fileName}>{r.fileName} : {REASON[r.reason]}</li>)}</ul>
          </div>
        )}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Création…' : 'Créer l\'exercice'}</button>
        <p className="text-xs text-muted">Créer l'exercice n'appelle pas Claude. La correction se demande ensuite, sur la page de l'exercice.</p>
      </div>
    </form>
  );
}
