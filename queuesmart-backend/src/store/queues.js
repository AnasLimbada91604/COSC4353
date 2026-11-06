const { getDb, withTransaction } = require("../db");
const { seedWalkIns } = require("./services");

const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };
const ENTRY_STATUS = { WAITING: "waiting", SERVED: "served", CANCELED: "canceled" };
const END_REASON = { LEFT: "left", REMOVED: "removed" };

const ENTRY_COLUMNS = `
  SELECT e.id, e.user_id, q.service_id, e.position, e.priority, e.join_time, e.ended_at, e.status
  FROM queue_entry e
  INNER JOIN queue q ON q.id = e.queue_id
`;

function rowToEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    serviceId: row.service_id,
    position: row.position,
    priority: row.priority,
    joinedAt: row.join_time,
    endedAt: row.ended_at,
    status: row.status,
  };
}

function resetQueues() {
  withTransaction((db) => {
    // Deleting an entry cascades to its notifications.
    db.exec(`
      DELETE FROM queue_entry;
      DELETE FROM sqlite_sequence WHERE name = 'queue_entry';
    `);
    seedWalkIns(db);
  });
}

function lineFor(db, serviceId) {
  return db
    .prepare(`${ENTRY_COLUMNS} WHERE q.service_id = ? AND e.status = 'waiting' ORDER BY e.position`)
    .all(serviceId)
    .map(rowToEntry);
}

// Writes each person's place in line back to the database after the line changes.
function savePositions(db, line) {
  const update = db.prepare("UPDATE queue_entry SET position = ? WHERE id = ?");
  line.forEach((entry, index) => {
    const position = index + 1;
    if (entry.position !== position) {
      update.run(position, entry.id);
      entry.position = position;
    }
  });
}

// Takes an entry out of the line for good, keeping its row as a record of the visit.
function endEntry(db, entry, status, endReason = null) {
  const endedAt = new Date().toISOString();
  db.prepare("UPDATE queue_entry SET status = ?, ended_at = ? , end_reason = ? WHERE id = ?").run(status, endedAt, endReason, entry.id);
  savePositions(db, lineFor(db, entry.serviceId));
  return { ...entry, status, endedAt, endReason };
}

function findActiveEntry(userId) {
  const row = getDb()
    .prepare(`${ENTRY_COLUMNS} WHERE e.user_id = ? AND e.status = 'waiting'`)
    .get(userId);
  if (!row) return null;
  const entry = rowToEntry(row);
  return { entry, position: entry.position, serviceId: entry.serviceId };
}

// The user's most recent visit, whatever its status.
function findLatestEntry(userId) {
  const row = getDb()
    .prepare(`${ENTRY_COLUMNS} WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 1`)
    .get(userId);
  return row ? rowToEntry(row) : null;
}

function joinQueue(userId, service) {
  return withTransaction((db) => {
    const line = lineFor(db, service.id);
    const inserted = db
      .prepare(`
        INSERT INTO queue_entry (queue_id, user_id, position, priority, join_time)
        SELECT id, ?, ?, ?, ? FROM queue WHERE service_id = ?
      `)
      .run(userId, line.length + 1, service.priority, new Date().toISOString(), service.id);
    const entry = rowToEntry(
      db.prepare(`${ENTRY_COLUMNS} WHERE e.id = ?`).get(Number(inserted.lastInsertRowid)),
    );
    // Same rule as insertByPriority in QueueManagement.jsx: behind everyone of equal or higher priority.
    insertByPriority(line, entry);
    savePositions(db, line);
    return { entry, position: entry.position, serviceId: service.id };
  });
}

function leaveQueue(userId) {
  return withTransaction((db) => {
    const found = findActiveEntry(userId);
    return found ? endEntry(db, found.entry, ENTRY_STATUS.CANCELED, END_REASON.LEFT) : null;
  });
}

function serveNext(serviceId) {
  return withTransaction((db) => {
    const [next] = lineFor(db, serviceId);
    return next ? endEntry(db, next, ENTRY_STATUS.SERVED) : null;
  });
}

function getQueue(serviceId) {
  return lineFor(getDb(), Number(serviceId));
}

// place entry by priority -> back of its group, or front when atFront is true
function insertByPriority(line, entry, atFront = false) {
  const rank = PRIORITY_RANK[entry.priority];
  let index = 0;
  while (
    index < line.length &&
    (atFront ? PRIORITY_RANK[line[index].priority] > rank : PRIORITY_RANK[line[index].priority] >= rank)
  ) {
    index += 1;
  }
  line.splice(index, 0, entry);
}

function findEntryIndex(line, entryId) {
  return line.findIndex((entry) => entry.id === Number(entryId));
}

// remove for queue screen
function removeEntry(serviceId, entryId) {
  return withTransaction((db) => {
    const line = lineFor(db, Number(serviceId));
    const index = findEntryIndex(line, entryId);
    return index === -1 ? null : endEntry(db, line[index], ENTRY_STATUS.CANCELED, END_REASON.REMOVED);
  });
}

// swap with the neighbor -> crossing into another group takes that group's priority
function moveEntry(serviceId, entryId, direction) {
  return withTransaction((db) => {
    const line = lineFor(db, Number(serviceId));
    const index = findEntryIndex(line, entryId);
    if (index === -1) return { error: "not-found" };
    const target = index + (direction === "up" ? -1 : 1);
    if (target < 0 || target >= line.length) return { error: "at-end" };

    const entry = line[index];
    const neighbor = line[target];
    line[index] = neighbor;
    line[target] = entry;
    entry.priority = neighbor.priority;
    db.prepare("UPDATE queue_entry SET priority = ? WHERE id = ?").run(entry.priority, entry.id);
    savePositions(db, line);
    return { entry };
  });
}

// find where to place the entry, then remove it and place it there
function setEntryPriority(serviceId, entryId, priority) {
  return withTransaction((db) => {
    const line = lineFor(db, Number(serviceId));
    const index = findEntryIndex(line, entryId);
    if (index === -1) return null;
    const entry = line[index];
    if (entry.priority === priority) return entry;

    const isLowering = PRIORITY_RANK[priority] < PRIORITY_RANK[entry.priority];
    line.splice(index, 1);
    entry.priority = priority;
    insertByPriority(line, entry, isLowering);
    db.prepare("UPDATE queue_entry SET priority = ? WHERE id = ?").run(priority, entry.id);
    savePositions(db, line);
    return entry;
  });
}

module.exports = {
  ENTRY_STATUS,
  END_REASON,
  resetQueues,
  findActiveEntry,
  findLatestEntry,
  joinQueue,
  leaveQueue,
  serveNext,
  getQueue,
  removeEntry,
  moveEntry,
  setEntryPriority,
};
