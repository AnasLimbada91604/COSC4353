const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin'))
);

CREATE TABLE IF NOT EXISTS user_profile (
  user_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user_credentials (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 480),
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High'))
);

CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES service (id) ON DELETE CASCADE
);

-- user_id is NULL for walk-ins, who wait in line without an account.
CREATE TABLE IF NOT EXISTS queue_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER NOT NULL,
  user_id INTEGER,
  position INTEGER NOT NULL CHECK (position >= 1),
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
  join_time TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'served', 'canceled')),
  FOREIGN KEY (queue_id) REFERENCES queue (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user_credentials (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS queue_entry_line ON queue_entry (queue_id, status, position);

-- A user can only wait in one queue at a time.
CREATE UNIQUE INDEX IF NOT EXISTS queue_entry_one_active_per_user
  ON queue_entry (user_id) WHERE status = 'waiting' AND user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  entry_id INTEGER,
  type TEXT NOT NULL CHECK (type IN ('joined', 'almost-served')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed')),
  created_at TEXT NOT NULL,
  viewed_at TEXT,
  UNIQUE (entry_id, type),
  FOREIGN KEY (user_id) REFERENCES user_credentials (id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES queue_entry (id) ON DELETE CASCADE
);
`;

let database;
let inTransaction = false;

function databasePath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
    return ":memory:";
  }
  return path.join(__dirname, "..", "data", "queuesmart.sqlite");
}

function getDb() {
  if (!database) {
    const filename = databasePath();
    if (filename !== ":memory:") {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
    }
    database = new DatabaseSync(filename);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(SCHEMA);
  }
  return database;
}

// Closes the connection; the next getDb() reopens the same file, like a server restart.
function closeDb() {
  if (database) {
    database.close();
    database = undefined;
  }
}

function resetDatabase() {
  const db = getDb();
  db.exec("DELETE FROM user_profile; DELETE FROM user_credentials;");
  const sequence = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get();
  if (sequence) {
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'user_credentials'").run();
  }
}

function withTransaction(work) {
  const db = getDb();
  // Nested calls join the outer transaction, so everything commits or rolls back together.
  if (inTransaction) return work(db);

  db.exec("BEGIN IMMEDIATE");
  inTransaction = true;
  try {
    const result = work(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may already be rolled back after a constraint failure.
    }
    throw error;
  } finally {
    inTransaction = false;
  }
}

module.exports = { getDb, closeDb, resetDatabase, withTransaction };
