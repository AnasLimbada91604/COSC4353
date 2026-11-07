const { getDb } = require("../db");

const PROFILE_COLUMNS = {
  contact_phone: "TEXT CHECK (contact_phone IS NULL OR length(contact_phone) BETWEEN 7 AND 20)",
  notification_preferences: `TEXT NOT NULL DEFAULT '{"email":true,"sms":false}' CHECK (json_valid(notification_preferences))`,
};

// Accounts are created without these fields, so they start with the column defaults.
function ensureProfileColumns() {
  const db = getDb();
  const existing = db.prepare("PRAGMA table_info(user_profile)").all().map((column) => column.name);
  for (const [name, definition] of Object.entries(PROFILE_COLUMNS)) {
    if (!existing.includes(name)) {
      db.exec(`ALTER TABLE user_profile ADD COLUMN ${name} ${definition}`);
    }
  }
  return db;
}

function findProfile(userId) {
  const row = ensureProfileColumns()
    .prepare(
      `SELECT c.id, c.email, p.full_name, p.contact_phone, p.notification_preferences
       FROM user_credentials c
       INNER JOIN user_profile p ON p.user_id = c.id
       WHERE c.id = ?`
    )
    .get(userId);
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    fullName: row.full_name,
    contactPhone: row.contact_phone,
    notificationPreferences: JSON.parse(row.notification_preferences),
  };
}

function updateProfile(userId, { fullName, contactPhone, notificationPreferences }) {
  const { email, sms } = notificationPreferences;
  ensureProfileColumns()
    .prepare(
      "UPDATE user_profile SET full_name = ?, contact_phone = ?, notification_preferences = ? WHERE user_id = ?"
    )
    // Blank means no phone on file. Preferences are rebuilt so the stored JSON keeps one shape.
    .run(fullName, (contactPhone || "").trim() || null, JSON.stringify({ email, sms }), userId);
  return findProfile(userId);
}

module.exports = { ensureProfileColumns, findProfile, updateProfile };
