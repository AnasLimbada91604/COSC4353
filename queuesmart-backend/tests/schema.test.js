const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { getDb, withTransaction } = require("../src/db");
const { resetUsers } = require("../src/store/users");
const { resetServices } = require("../src/store/services");
const { addUser } = require("./dbHelpers");

const NOW = "2026-11-05T12:00:00.000Z";
const LONG_TEXT = "x".repeat(501);

function run(sql, ...values) {
  return getDb().prepare(sql).run(...values);
}

function addEntry({
  queueId = 1,
  userId = 1,
  position = 10,
  priority = "Low",
  joinTime = NOW,
  status = "waiting",
} = {}) {
  return run(
    "INSERT INTO queue_entry (queue_id, user_id, position, priority, join_time, status) VALUES (?, ?, ?, ?, ?, ?)",
    queueId,
    userId,
    position,
    priority,
    joinTime,
    status,
  );
}

function addRow({ userId = 1, entryId = null, type = "joined", message = "hi", status = "sent", createdAt = NOW } = {}) {
  return run(
    "INSERT INTO notification (user_id, entry_id, type, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    userId,
    entryId,
    type,
    message,
    status,
    createdAt,
  );
}

beforeEach(() => {
  resetUsers();
  resetServices();
  addUser(1);
});

describe("service and queue tables", () => {
  test("gives every seeded service one queue", () => {
    const rows = getDb().prepare("SELECT service_id, status FROM queue ORDER BY service_id").all();
    assert.deepEqual(
      rows.map((row) => [row.service_id, row.status]),
      [[1, "open"], [2, "open"], [3, "closed"], [4, "open"]],
    );
  });

  test("rejects a second queue for the same service", () => {
    assert.throws(() => run("INSERT INTO queue (service_id, created_at) VALUES (1, ?)", NOW), /UNIQUE/);
  });

  test("rejects a queue for a service that doesn't exist", () => {
    assert.throws(() => run("INSERT INTO queue (service_id, created_at) VALUES (99, ?)", NOW), /FOREIGN KEY/);
  });

  test("rejects an unknown queue status", () => {
    assert.throws(() => run("UPDATE queue SET status = 'paused' WHERE id = 1"), /CHECK/);
  });

  test("enforces the service field limits", () => {
    const insert = (name, description, duration, priority) =>
      run("INSERT INTO service (name, description, duration, priority) VALUES (?, ?, ?, ?)", name, description, duration, priority);

    assert.throws(() => insert("x".repeat(101), "ok", 10, "Low"), /CHECK/);
    assert.throws(() => insert("ok", LONG_TEXT, 10, "Low"), /CHECK/);
    assert.throws(() => insert("ok", "ok", 0, "Low"), /CHECK/);
    assert.throws(() => insert("ok", "ok", 481, "Low"), /CHECK/);
    assert.throws(() => insert("ok", "ok", 10, "Urgent"), /CHECK/);
    assert.throws(() => insert(null, "ok", 10, "Low"), /NOT NULL/);
  });
});

describe("queue_entry table", () => {
  test("defaults a new entry to waiting", () => {
    const { lastInsertRowid } = run(
      "INSERT INTO queue_entry (queue_id, user_id, position, priority, join_time) VALUES (1, 1, 10, 'Low', ?)",
      NOW,
    );
    const row = getDb().prepare("SELECT status FROM queue_entry WHERE id = ?").get(lastInsertRowid);
    assert.equal(row.status, "waiting");
  });

  test("rejects a user or queue that doesn't exist", () => {
    assert.throws(() => addEntry({ userId: 999 }), /FOREIGN KEY/);
    assert.throws(() => addEntry({ queueId: 999 }), /FOREIGN KEY/);
  });

  test("rejects an unknown status, priority or a position below 1", () => {
    assert.throws(() => addEntry({ status: "paused" }), /CHECK/);
    assert.throws(() => addEntry({ priority: "Urgent" }), /CHECK/);
    assert.throws(() => addEntry({ position: 0 }), /CHECK/);
  });

  test("requires a join time", () => {
    assert.throws(() => addEntry({ joinTime: null }), /NOT NULL/);
  });

  test("allows only one waiting entry per user, across every queue", () => {
    addEntry();
    assert.throws(() => addEntry({ queueId: 2 }), /UNIQUE/);
  });

  test("allows a new waiting entry once the old one has ended", () => {
    addEntry({ status: "served" });
    addEntry({ status: "canceled" });
    assert.doesNotThrow(() => addEntry());
  });

  test("allows many walk-ins, who have no user", () => {
    addEntry({ userId: null });
    assert.doesNotThrow(() => addEntry({ userId: null }));
  });
});

describe("notification table", () => {
  test("defaults a new notification to sent", () => {
    const { lastInsertRowid } = run(
      "INSERT INTO notification (user_id, type, message, created_at) VALUES (1, 'joined', 'hi', ?)",
      NOW,
    );
    const row = getDb().prepare("SELECT status, viewed_at FROM notification WHERE id = ?").get(lastInsertRowid);
    assert.equal(row.status, "sent");
    assert.equal(row.viewed_at, null);
  });

  test("rejects a user or entry that doesn't exist", () => {
    assert.throws(() => addRow({ userId: 999 }), /FOREIGN KEY/);
    assert.throws(() => addRow({ entryId: 999 }), /FOREIGN KEY/);
  });

  test("only allows sent or viewed", () => {
    assert.throws(() => addRow({ status: "read" }), /CHECK/);
    assert.doesNotThrow(() => addRow({ status: "viewed" }));
  });

  test("rejects an unknown type", () => {
    assert.throws(() => addRow({ type: "promo" }), /CHECK/);
  });

  test("requires a message and a timestamp, and limits the message length", () => {
    assert.throws(() => addRow({ message: null }), /NOT NULL/);
    assert.throws(() => addRow({ message: "" }), /CHECK/);
    assert.throws(() => addRow({ message: LONG_TEXT }), /CHECK/);
    assert.throws(() => addRow({ createdAt: null }), /NOT NULL/);
  });

  test("allows only one of each type per queue entry", () => {
    const { lastInsertRowid } = addEntry();
    const entryId = Number(lastInsertRowid);
    addRow({ entryId });

    assert.throws(() => addRow({ entryId }), /UNIQUE/);
    assert.doesNotThrow(() => addRow({ entryId, type: "almost-served" }));
  });

  test("removes a user's entries and notifications with their account", () => {
    addEntry();
    addRow();
    run("DELETE FROM user_credentials WHERE id = 1");

    const count = (table) => getDb().prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = 1`).get().count;
    assert.equal(count("queue_entry"), 0);
    assert.equal(count("notification"), 0);
  });
});

describe("transactions", () => {
  test("rolls back everything when a nested transaction fails", () => {
    assert.throws(() =>
      withTransaction(() => {
        addEntry();
        withTransaction(() => {
          addRow({ userId: 999 });
        });
      }),
    /FOREIGN KEY/);

    assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM queue_entry WHERE user_id = 1").get().count, 0);
  });

  test("works normally again after a rollback", () => {
    assert.throws(() => withTransaction(() => addRow({ userId: 999 })), /FOREIGN KEY/);
    withTransaction(() => addRow());
    assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM notification").get().count, 1);
  });
});
