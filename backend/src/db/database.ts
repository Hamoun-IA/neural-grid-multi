import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.METRICS_DB_PATH || path.join(process.cwd(), 'data', 'metrics.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL mode for better write concurrency
db.pragma('journal_mode=WAL');
db.pragma('synchronous=NORMAL');

// Initialize tables
db.exec(`
CREATE TABLE IF NOT EXISTS metrics_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  cpu_pct REAL,
  ram_pct REAL,
  disk_pct REAL,
  load1 REAL,
  agent_count INTEGER,
  agent_up INTEGER,
  extra_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_raw_server_ts ON metrics_raw(server_id, ts DESC);

CREATE TABLE IF NOT EXISTS metrics_hourly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  hour_ts INTEGER NOT NULL,
  cpu_avg REAL, cpu_max REAL,
  ram_avg REAL, ram_max REAL,
  disk_avg REAL,
  load1_avg REAL,
  agents_min INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_server_hour ON metrics_hourly(server_id, hour_ts);

CREATE TABLE IF NOT EXISTS alert_state (
  server_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  triggered_at INTEGER NOT NULL,
  last_sent_at INTEGER,
  resolved_at INTEGER,
  PRIMARY KEY (server_id, alert_type)
);
`);

console.log(`[db] SQLite initialized at ${DB_PATH}`);

export default db;
