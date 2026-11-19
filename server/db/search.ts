import type { Id, SearchHit } from '../../shared/types';
import type { Db } from './schema';

type Row = Record<string, unknown>;

export function reindexExercise(db: Db, exerciseId: Id): void {
  db.prepare('DELETE FROM search_index WHERE exercise_id = ?').run(exerciseId);
  const ex = db.prepare('SELECT title, statement_text, statement_transcription FROM exercises WHERE id = ?').get(exerciseId) as Row | undefined;
  if (!ex) return;
  const title = String(ex.title);
  const insert = db.prepare('INSERT INTO search_index (exercise_id, source, title, body) VALUES (?, ?, ?, ?)');
  insert.run(exerciseId, 'title', title, '');

  const attachments = db.prepare('SELECT extracted_text FROM attachments WHERE exercise_id = ? AND extracted_text IS NOT NULL').all(exerciseId) as Row[];
  const statement = [ex.statement_text, ex.statement_transcription, ...attachments.map((a) => a.extracted_text)]
    .filter((s) => typeof s === 'string' && s.trim() !== '')
    .join('\n');
  if (statement) insert.run(exerciseId, 'statement', title, statement);

  const current = db.prepare('SELECT markdown FROM versions WHERE exercise_id = ? ORDER BY number DESC LIMIT 1').get(exerciseId) as Row | undefined;
  if (current) insert.run(exerciseId, 'correction', title, String(current.markdown));

  const messages = db.prepare(
    'SELECT m.content FROM messages m JOIN comments c ON c.id = m.comment_id WHERE c.exercise_id = ? ORDER BY m.id',
  ).all(exerciseId) as Row[];
  if (messages.length) insert.run(exerciseId, 'comment', title, messages.map((m) => String(m.content)).join('\n'));
}

export function pruneIndex(db: Db): void {
  db.exec('DELETE FROM search_index WHERE exercise_id NOT IN (SELECT id FROM exercises)');
}

function toFtsQuery(q: string): string | null {
  const terms = q.split(/\s+/).map((t) => t.replace(/"/g, '').trim()).filter(Boolean);
  if (!terms.length) return null;
  return terms.map((t) => `"${t}"`).join(' ');
}

export function search(db: Db, query: string): SearchHit[] {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  const rows = db.prepare(`
    SELECT exercise_id, source, title,
      CASE WHEN source = 'title' THEN snippet(search_index, 2, '«', '»', '…', 12)
           ELSE snippet(search_index, 3, '«', '»', '…', 12) END AS snippet
    FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 50
  `).all(fts) as Row[];
  return rows.map((r) => ({
    exerciseId: Number(r.exercise_id),
    title: String(r.title),
    snippet: String(r.snippet),
    source: r.source as SearchHit['source'],
  }));
}
