const { listServices } = require("./services");

const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };

let queues = new Map();
let nextEntryId = 1;

function createEntry(userId, service) {
  const entry = {
    id: nextEntryId,
    userId,
    serviceId: service.id,
    priority: service.priority,
    joinedAt: new Date().toISOString(),
  };
  nextEntryId += 1;
  return entry;
}

function resetQueues() {
  queues = new Map();
  nextEntryId = 1;
  // Placeholder people so each line starts at the seeded queueLength.
  for (const service of listServices()) {
    const line = [];
    for (let i = 0; i < service.queueLength; i += 1) {
      line.push(createEntry(null, service));
    }
    queues.set(service.id, line);
  }
}

function lineFor(serviceId) {
  if (!queues.has(serviceId)) {
    queues.set(serviceId, []);
  }
  return queues.get(serviceId);
}

function findActiveEntry(userId) {
  for (const [serviceId, line] of queues) {
    const index = line.findIndex((entry) => entry.userId === userId);
    if (index !== -1) {
      return { entry: { ...line[index] }, position: index + 1, serviceId };
    }
  }
  return null;
}

function joinQueue(userId, service) {
  const line = lineFor(service.id);
  const entry = createEntry(userId, service);
  // Same rule as insertByPriority in QueueManagement.jsx: behind everyone of equal or higher priority.
  let index = 0;
  while (
    index < line.length &&
    PRIORITY_RANK[line[index].priority] >= PRIORITY_RANK[entry.priority]
  ) {
    index += 1;
  }
  line.splice(index, 0, entry);
  return { entry: { ...entry }, position: index + 1, serviceId: service.id };
}

function leaveQueue(userId) {
  const found = findActiveEntry(userId);
  if (!found) return null;
  lineFor(found.serviceId).splice(found.position - 1, 1);
  return found.entry;
}

function serveNext(serviceId) {
  const line = lineFor(serviceId);
  return line.length > 0 ? line.shift() : null;
}

function getQueue(serviceId) {
  return lineFor(Number(serviceId)).map((entry) => ({ ...entry }))
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
  const line = lineFor(Number(serviceId));
  const index = findEntryIndex(line, entryId);
  if (index === -1) return null;
  const [removed] = line.splice(index, 1);
  return { ...removed };
}

// swap with the neighbor -> crossing into another group takes that group's priority
function moveEntry(serviceId, entryId, direction) {
  const line = lineFor(Number(serviceId));
  const index = findEntryIndex(line, entryId);
  if (index === -1) return { error: "not-found" };
  const target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= line.length) return { error: "at-end" };

  const entry = line[index];
  const neighbor = line[target];
  line[index] = neighbor;
  line[target] = { ...entry, priority: neighbor.priority };
  return { entry: { ...line[target] } };
}

// find where to place the entry, then remove it and place it there
function setEntryPriority(serviceId, entryId, priority) {
  const line = lineFor(Number(serviceId));
  const index = findEntryIndex(line, entryId);
  if (index === -1) return null;
  const entry = line[index];
  if (entry.priority === priority) return { ...entry };

  const isLowering = PRIORITY_RANK[priority] < PRIORITY_RANK[entry.priority];
  line.splice(index, 1);
  const updated = { ...entry, priority };
  insertByPriority(line, updated, isLowering);
  return { ...updated };
}

resetQueues();

module.exports = {resetQueues, findActiveEntry, joinQueue, leaveQueue, serveNext, getQueue, removeEntry, moveEntry, setEntryPriority,};
