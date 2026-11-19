import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY,
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      statement_text TEXT NOT NULL DEFAULT '',
      statement_transcription TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      size INTEGER NOT NULL,
      extracted_text TEXT
    );
    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      markdown TEXT NOT NULL,
      reason TEXT NOT NULL,
      trigger_comment_id INTEGER,
      instruction TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (exercise_id, number)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
      anchor TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      changed INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'passage',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      exercise_id UNINDEXED, source UNINDEXED, title, body,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
}
