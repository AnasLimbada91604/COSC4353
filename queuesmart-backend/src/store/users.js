const bcrypt = require("bcryptjs");
const { getDb, resetDatabase, withTransaction } = require("../db");

const SALT_ROUNDS =
  process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT ? 4 : 10;

const USER_COLUMNS = `
  SELECT c.id, c.email, c.password_hash, c.role, p.full_name
  FROM user_credentials c
  INNER JOIN user_profile p ON p.user_id = c.id
`;

function resetUsers() {
  resetDatabase();
}

function countUsers() {
  return getDb().prepare("SELECT COUNT(*) AS count FROM user_credentials").get().count;
}

function toPublic(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  };
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    fullName: row.full_name,
  };
}

function isUniqueEmailError(error) {
  return (
    error &&
    error.code === "ERR_SQLITE_ERROR" &&
    typeof error.message === "string" &&
    error.message.includes("user_credentials.email")
  );
}

function findByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return rowToUser(getDb().prepare(`${USER_COLUMNS} WHERE c.email = ?`).get(normalized));
}

function findById(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return null;
  return rowToUser(getDb().prepare(`${USER_COLUMNS} WHERE c.id = ?`).get(numericId));
}

async function createUser({ email, password, role, fullName }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const normalizedEmail = String(email).trim().toLowerCase();
  const name = String(fullName).trim();

  try {
    return withTransaction((db) => {
      const inserted = db
        .prepare(
          "INSERT INTO user_credentials (email, password_hash, role) VALUES (?, ?, ?)"
        )
        .run(normalizedEmail, passwordHash, role);
      const id = Number(inserted.lastInsertRowid);
      db.prepare("INSERT INTO user_profile (user_id, full_name) VALUES (?, ?)").run(id, name);
      return {
        id,
        email: normalizedEmail,
        passwordHash,
        role,
        fullName: name,
      };
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      const conflict = new Error("An account with that email already exists.");
      conflict.code = "EMAIL_TAKEN";
      throw conflict;
    }
    throw error;
  }
}

module.exports = {
  resetUsers,
  countUsers,
  toPublic,
  findByEmail,
  findById,
  createUser,
};
