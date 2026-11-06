const { getDb } = require("../db");
const { ENTRY_STATUS, END_REASON } = require("./queues");

const OUTCOMES = {
  IN_QUEUE: "In queue",
  SERVED: "Served",
  LEFT: "Left queue",
  NO_SHOW: "No-show",
};
const MS_PER_MINUTE = 60 * 1000;

// A user's visits come straight from queue_entry, which keeps every row after the visit ends.
const HISTORY_QUERY = `
  SELECT e.id, e.user_id, e.join_time, e.ended_at, e.status, e.end_reason,
    s.id AS service_id, s.name AS service_name
  FROM queue_entry e
  INNER JOIN queue q ON q.id = e.queue_id
  INNER JOIN service s ON s.id = q.service_id
  WHERE e.user_id = ?
  ORDER BY e.join_time DESC, e.id DESC
`;

function outcomeFor(row) {
  if (row.status === ENTRY_STATUS.WAITING) return OUTCOMES.IN_QUEUE;
  if (row.status === ENTRY_STATUS.SERVED) return OUTCOMES.SERVED;
  return row.end_reason === END_REASON.LEFT ? OUTCOMES.LEFT : OUTCOMES.NO_SHOW;
}

function waitMinutes(row) {
  if (row.ended_at === null) return null;
  const waitedMs = Date.parse(row.ended_at) - Date.parse(row.join_time);
  return Math.max(0, Math.round(waitedMs / MS_PER_MINUTE));
}

function listHistory(userId) {
  return getDb()
      .prepare(HISTORY_QUERY)
      .all(userId)
      .map((row) => ({
        id: row.id,
        userId: row.user_id,
        serviceId: row.service_id,
        serviceName: row.service_name,
        joinedAt: row.join_time,
        endedAt: row.ended_at,
        actualWaitMinutes: waitMinutes(row),
        outcome: outcomeFor(row),
      }));
}

module.exports = { OUTCOMES, listHistory };
