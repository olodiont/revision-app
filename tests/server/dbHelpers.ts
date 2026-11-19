import { openDb } from '../../server/db/schema';
import * as repo from '../../server/db/repo';

export function memDb() { return openDb(':memory:'); }

export function seedExercise(db: ReturnType<typeof memDb>, title = 'Exo 1', statementText = "Calculer l'intégrale de ln x") {
  const s = repo.createSubject(db, 'Maths');
  const c = repo.createChapter(db, s.id, 'Intégrales');
  const e = repo.createExercise(db, { chapterId: c.id, title, statementText });
  return { s, c, e };
}
