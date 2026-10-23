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

resetQueues();

module.exports = { resetQueues, findActiveEntry, joinQueue, leaveQueue, serveNext };
