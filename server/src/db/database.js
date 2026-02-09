import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../voice-nav.db');

let db = null;

export function initDatabase() {
  if (db) {
    return db;
  }

  console.log('Initializing database at:', DB_PATH);
  db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT NOT NULL DEFAULT (datetime('now')),
      CONSTRAINT username_length CHECK(length(username) >= 2 AND length(username) <= 50)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  // Lightweight migration: add email column for existing databases.
  const userColumns = db.prepare(`PRAGMA table_info(users);`).all();
  const hasEmailColumn = userColumns.some((col) => col.name === 'email');
  if (!hasEmailColumn) {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT;`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE);
  `);

  // Create history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      transcript TEXT,
      stops_json TEXT NOT NULL,
      route_data_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT action_type_valid CHECK(action_type IN ('new_route', 'add_stop', 'insert_stop', 'replace_stop', 'modify_route'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_history_user_created ON history(user_id, created_at DESC);
  `);

  // Create saved routes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      route_name TEXT NOT NULL,
      stops_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_saved_routes_user_id ON saved_routes(user_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_saved_routes_last_used ON saved_routes(last_used DESC);
  `);

  console.log('Database initialized successfully');

  return db;
}

export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export { db };
