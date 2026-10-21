const OUTCOMES = {
  IN_QUEUE: "In queue",
  SERVED: "Served",
  LEFT: "Left queue",
  NO_SHOW: "No-show",
};
const CLOSING_OUTCOMES = [OUTCOMES.SERVED, OUTCOMES.LEFT, OUTCOMES.NO_SHOW];
const MS_PER_MINUTE = 60 * 1000;

let history = [];
let nextId = 1;

function resetHistory() {
  history = [];
  nextId = 1;
}

function recordJoin({
  userId,
  service,
  position,
  estimatedWaitMinutes,
  joinedAt = new Date().toISOString(),
}) {
  const entry = {
    id: nextId,
    userId,
    serviceId: service.id,
    serviceName: service.name,
    joinedAt,
    endedAt: null,
    positionAtJoin: position,
    estimatedWaitMinutes,
    actualWaitMinutes: null,
    outcome: OUTCOMES.IN_QUEUE,
  };
  nextId += 1;
  history.push(entry);
  return { ...entry };
}

function closeEntry(userId, outcome, at = new Date()) {
  if (!CLOSING_OUTCOMES.includes(outcome)) {
    throw new RangeError(`Unknown outcome: ${outcome}`);
  }
  const entry = history.find((item) => item.userId === userId && item.endedAt === null);
  if (!entry) return null;

  const waitedMs = at.getTime() - Date.parse(entry.joinedAt);
  entry.endedAt = at.toISOString();
  entry.outcome = outcome;
  entry.actualWaitMinutes = Math.max(0, Math.round(waitedMs / MS_PER_MINUTE));
  return { ...entry };
}

function listHistory(userId) {
  return history
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt) || b.id - a.id)
    .map((item) => ({ ...item }));
}

module.exports = { OUTCOMES, resetHistory, recordJoin, closeEntry, listHistory };
