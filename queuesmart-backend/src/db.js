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
`;

let database;

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
  db.exec("BEGIN IMMEDIATE");
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
  }
}

module.exports = { getDb, resetDatabase, withTransaction };
