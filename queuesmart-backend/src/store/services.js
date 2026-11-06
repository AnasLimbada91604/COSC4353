const { getDb, withTransaction } = require("../db");

// First-run data. queueLength is how many walk-ins are already waiting in that line.
const initialServices = [
  {
    id: 1,
    name: "Academic Advising",
    description: "Course planning and degree questions",
    duration: 15,
    priority: "Medium",
    queueLength: 4,
    isOpen: true,
  },
  {
    id: 2,
    name: "Financial Aid",
    description: "Aid status and document questions",
    duration: 20,
    priority: "High",
    queueLength: 7,
    isOpen: true,
  },
  {
    id: 3,
    name: "Registrar",
    description: "Enrollment, transcripts, and records",
    duration: 10,
    priority: "Medium",
    queueLength: 2,
    isOpen: false,
  },
  {
    id: 4,
    name: "Student Accounts",
    description: "Billing and payment questions",
    duration: 15,
    priority: "Low",
    queueLength: 5,
    isOpen: true,
  },
];

const SERVICE_COLUMNS = `
  SELECT s.id, s.name, s.description, s.duration, s.priority, q.status AS queue_status,
    (SELECT COUNT(*) FROM queue_entry e WHERE e.queue_id = q.id AND e.status = 'waiting') AS queue_length
  FROM service s
  INNER JOIN queue q ON q.service_id = s.id
`;

function rowToService(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    duration: row.duration,
    priority: row.priority,
    queueLength: row.queue_length,
    isOpen: row.queue_status === "open",
  };
}

function toServiceId(id) {
  const numericId = Number(id);
  return Number.isInteger(numericId) ? numericId : null;
}

// Every service gets its one queue, so the two rows are always created together.
function insertServiceWithQueue(db, { id = null, name, description, duration, priority, isOpen = true }) {
  const inserted = db
    .prepare("INSERT INTO service (id, name, description, duration, priority) VALUES (?, ?, ?, ?, ?)")
    .run(id, name, description, duration, priority);
  const serviceId = Number(inserted.lastInsertRowid);
  db.prepare("INSERT INTO queue (service_id, status, created_at) VALUES (?, ?, ?)").run(
    serviceId,
    isOpen ? "open" : "closed",
    new Date().toISOString(),
  );
  return serviceId;
}

function seedWalkIns(db) {
  const insert = db.prepare(`
    INSERT INTO queue_entry (queue_id, position, priority, join_time)
    SELECT id, ?, ?, ? FROM queue WHERE service_id = ?
  `);
  const joinedAt = new Date().toISOString();
  for (const service of initialServices) {
    for (let position = 1; position <= service.queueLength; position += 1) {
      insert.run(position, service.priority, joinedAt, service.id);
    }
  }
}

function seedServices(db) {
  initialServices.forEach((service) => insertServiceWithQueue(db, service));
  seedWalkIns(db);
}

// Only fills a brand-new database, so a restart keeps whatever was saved.
function seedIfEmpty() {
  withTransaction((db) => {
    if (db.prepare("SELECT COUNT(*) AS count FROM service").get().count === 0) {
      seedServices(db);
    }
  });
}

function resetServices() {
  withTransaction((db) => {
    // Deleting a service cascades to its queue, entries and their notifications.
    db.exec(`
      DELETE FROM service;
      DELETE FROM sqlite_sequence WHERE name IN ('service', 'queue', 'queue_entry', 'notification');
    `);
    seedServices(db);
  });
}

function listServices() {
  return getDb().prepare(`${SERVICE_COLUMNS} ORDER BY s.id`).all().map(rowToService);
}

function findService(id) {
  const serviceId = toServiceId(id);
  if (serviceId === null) return null;
  const row = getDb().prepare(`${SERVICE_COLUMNS} WHERE s.id = ?`).get(serviceId);
  return row ? rowToService(row) : null;
}

function updateQueueStatus(id, isOpen) {
  const serviceId = toServiceId(id);
  if (serviceId === null) return null;
  getDb()
    .prepare("UPDATE queue SET status = ? WHERE service_id = ?")
    .run(isOpen ? "open" : "closed", serviceId);
  return findService(serviceId);
}

function createService({ name, description, duration, priority }) {
  return withTransaction((db) =>
    findService(insertServiceWithQueue(db, { name, description, duration, priority })),
  );
}

function updateService(id, { name, description, duration, priority }) {
  const serviceId = toServiceId(id);
  if (serviceId === null) return null;
  getDb()
    .prepare("UPDATE service SET name = ?, description = ?, duration = ?, priority = ? WHERE id = ?")
    .run(name, description, duration, priority, serviceId);
  return findService(serviceId);
}

seedIfEmpty();

module.exports = {
  resetServices,
  seedIfEmpty,
  seedWalkIns,
  listServices,
  updateQueueStatus,
  findService,
  createService,
  updateService,
};
