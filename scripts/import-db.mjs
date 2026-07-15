import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dbFile = resolve(root, 'data/karaoke.sqlite');
mkdirSync(dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS scores (
    analysis_id TEXT PRIMARY KEY, played_at TEXT NOT NULL,
    title TEXT NOT NULL, artist TEXT NOT NULL, mode TEXT,
    score REAL NOT NULL, pitch REAL, stability REAL, long_tone REAL,
    intonation REAL, technique REAL, ai_bonus REAL DEFAULT 0,
    kobushi INTEGER DEFAULT 0, shakuri INTEGER DEFAULT 0,
    vibrato INTEGER DEFAULT 0, vibrato_type INTEGER DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_scores_played ON scores(played_at DESC);
  CREATE INDEX IF NOT EXISTS idx_scores_song ON scores(title, artist);
  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
`);
const source = JSON.parse(readFileSync(resolve(root, 'data/scores.json'), 'utf8'));
const upsert = db.prepare(`INSERT INTO scores VALUES
  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(analysis_id) DO UPDATE SET
  played_at=excluded.played_at,title=excluded.title,artist=excluded.artist,mode=excluded.mode,
  score=excluded.score,pitch=excluded.pitch,stability=excluded.stability,long_tone=excluded.long_tone,
  intonation=excluded.intonation,technique=excluded.technique,ai_bonus=excluded.ai_bonus,
  kobushi=excluded.kobushi,shakuri=excluded.shakuri,vibrato=excluded.vibrato,vibrato_type=excluded.vibrato_type,
  imported_at=CURRENT_TIMESTAMP`);
db.exec('BEGIN');
for (const x of source.scores) upsert.run(
  x.analysisId, x.playedAt, x.title, x.artist, x.mode, x.score,
  x.metrics?.['音程'], x.metrics?.['安定感'], x.metrics?.['ロングトーン'],
  x.metrics?.['抑揚'], x.metrics?.['テクニック'], x.aiBonus || 0,
  x.techniques?.['こぶし'] || 0, x.techniques?.['しゃくり'] || 0,
  x.techniques?.['ビブラート'] || 0, x.vibratoType || 0
);
db.exec('COMMIT');
console.log(`${source.scores.length} records imported to ${dbFile}`);
