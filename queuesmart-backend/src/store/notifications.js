const { getDb } = require("../db");

const NOTIFICATION_STATUS = { SENT: "sent", VIEWED: "viewed" };

const NOTIFICATION_COLUMNS = `
  SELECT n.id, n.user_id, n.entry_id, n.type, n.message, n.status, n.created_at, n.viewed_at,
    s.id AS service_id, s.name AS service_name
  FROM notification n
  LEFT JOIN queue_entry e ON e.id = n.entry_id
  LEFT JOIN queue q ON q.id = e.queue_id
  LEFT JOIN service s ON s.id = q.service_id
`;

function rowToNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    entryId: row.entry_id,
    type: row.type,
    serviceId: row.service_id,
    serviceName: row.service_name,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    viewedAt: row.viewed_at,
  };
}

function findNotification(id) {
  const row = getDb().prepare(`${NOTIFICATION_COLUMNS} WHERE n.id = ?`).get(id);
  return row ? rowToNotification(row) : null;
}

function resetNotifications() {
  getDb().exec(`
    DELETE FROM notification;
    DELETE FROM sqlite_sequence WHERE name = 'notification';
  `);
}

function addNotification({ userId, entryId = null, type, message }) {
  const inserted = getDb()
    .prepare("INSERT INTO notification (user_id, entry_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, entryId, type, message, new Date().toISOString());
  return findNotification(Number(inserted.lastInsertRowid));
}

function listNotifications(userId) {
  return getDb()
    .prepare(`${NOTIFICATION_COLUMNS} WHERE n.user_id = ? ORDER BY n.id DESC`)
    .all(userId)
    .map(rowToNotification);
}

function hasNotification(entryId, type) {
  const row = getDb()
    .prepare("SELECT 1 FROM notification WHERE entry_id = ? AND type = ?")
    .get(entryId, type);
  return Boolean(row);
}

// Only the owner can mark a notification, and the first viewed time is kept.
function markViewed(userId, id) {
  const { changes } = getDb()
    .prepare(`
      UPDATE notification
      SET status = 'viewed', viewed_at = COALESCE(viewed_at, ?)
      WHERE id = ? AND user_id = ?
    `)
    .run(new Date().toISOString(), id, userId);
  return changes > 0 ? findNotification(id) : null;
}

module.exports = {
  NOTIFICATION_STATUS,
  resetNotifications,
  addNotification,
  listNotifications,
  hasNotification,
  markViewed,
};
