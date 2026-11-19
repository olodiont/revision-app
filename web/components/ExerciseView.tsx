import { useEffect, useState } from 'react';
import type { Id } from '../../shared/types';
import { api, type ExerciseDetail } from '../api';

export function ExerciseView({ id }: { id: Id; onLibraryChanged: () => void }) {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  useEffect(() => { api.get<ExerciseDetail>(`/api/exercises/${id}`).then(setDetail).catch(() => setDetail(null)); }, [id]);
  if (!detail) return <p className="p-8 text-muted">Chargement…</p>;
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">{detail.exercise.title}</h1>
      <p className="whitespace-pre-wrap">{detail.exercise.statementText}</p>
    </div>
  );
}
