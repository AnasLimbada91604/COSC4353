const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { getDb } = require("../src/db");
const { resetUsers } = require("../src/store/users");
const { resetServices, findService } = require("../src/store/services");
const {
  resetQueues,
  joinQueue,
  leaveQueue,
  serveNext,
  getQueue,
  findActiveEntry,
  findLatestEntry,
  moveEntry,
  removeEntry,
  setEntryPriority,
} = require("../src/store/queues");
const { addUser } = require("./dbHelpers");

const ADVISING = 1;
const users = (line) => line.map((entry) => entry.userId);

function resetLines() {
  resetUsers();
  resetServices();
  resetQueues();
  [101, 102, 103].forEach(addUser);
}

function savedEntry(id) {
  return getDb().prepare("SELECT * FROM queue_entry WHERE id = ?").get(id);
}

function savedPositions(serviceId) {
  return getDb()
    .prepare(`
      SELECT e.position FROM queue_entry e
      INNER JOIN queue q ON q.id = e.queue_id
      WHERE q.service_id = ? AND e.status = 'waiting'
      ORDER BY e.position
    `)
    .all(serviceId)
    .map((row) => row.position);
}

describe("queue ordering", () => {
  beforeEach(resetLines);

  test("puts a new user at the back of a same-priority line", () => {
    const joined = joinQueue(101, findService(ADVISING));
    assert.equal(joined.position, 5);
    assert.deepEqual(users(getQueue(ADVISING)), [null, null, null, null, 101]);
  });

  test("keeps same-priority users in the order they arrived", () => {
    joinQueue(101, findService(ADVISING));
    joinQueue(102, findService(ADVISING));
    joinQueue(103, findService(ADVISING));
    assert.deepEqual(users(getQueue(ADVISING)).slice(-3), [101, 102, 103]);
  });

  test("gives the new user the service's priority", () => {
    const joined = joinQueue(101, findService(ADVISING));
    assert.equal(joined.entry.priority, "Medium");
  });

  test("puts a High-priority user ahead of earlier Medium arrivals", () => {
    joinQueue(101, findService(ADVISING));
    const late = joinQueue(102, findService(ADVISING));
    setEntryPriority(ADVISING, late.entry.id, "High");

    assert.deepEqual(users(getQueue(ADVISING)), [
      102,
      null,
      null,
      null,
      null,
      101,
    ]);
  });

  test("keeps arrival order among High-priority users", () => {
    const first = joinQueue(101, findService(ADVISING));
    const second = joinQueue(102, findService(ADVISING));
    setEntryPriority(ADVISING, first.entry.id, "High");
    setEntryPriority(ADVISING, second.entry.id, "High");

    assert.deepEqual(users(getQueue(ADVISING)).slice(0, 2), [101, 102]);
  });

  test("lets a later Medium arrival go ahead of a Low-priority user", () => {
    const early = joinQueue(101, findService(ADVISING));
    setEntryPriority(ADVISING, early.entry.id, "Low");
    const late = joinQueue(102, findService(ADVISING));

    assert.equal(late.position, 5);
    assert.deepEqual(users(getQueue(ADVISING)).slice(-2), [102, 101]);
  });

  test("puts a newly raised user behind people already in the higher group", () => {
    const first = joinQueue(101, findService(ADVISING));
    const second = joinQueue(102, findService(ADVISING));
    setEntryPriority(ADVISING, second.entry.id, "High");
    setEntryPriority(ADVISING, first.entry.id, "High");

    assert.deepEqual(users(getQueue(ADVISING)).slice(0, 2), [102, 101]);
  });
});

describe("joining and leaving", () => {
  beforeEach(resetLines);

  test("finds the user's spot after joining", () => {
    joinQueue(101, findService(ADVISING));
    const found = findActiveEntry(101);
    assert.equal(found.serviceId, ADVISING);
    assert.equal(found.position, 5);
  });

  test("returns null for a user who isn't in any queue", () => {
    assert.equal(findActiveEntry(999), null);
  });

  test("removes the user and moves everyone behind them up", () => {
    joinQueue(101, findService(ADVISING));
    joinQueue(102, findService(ADVISING));

    const left = leaveQueue(101);

    assert.equal(left.userId, 101);
    assert.equal(findActiveEntry(101), null);
    assert.equal(findActiveEntry(102).position, 5);
  });

  test("returns null when leaving without being in a queue", () => {
    assert.equal(leaveQueue(999), null);
  });

  test("serves people from the front, in order", () => {
    joinQueue(101, findService(ADVISING));
    for (let i = 0; i < 4; i += 1) {
      serveNext(ADVISING);
    }
    assert.equal(serveNext(ADVISING).userId, 101);
    assert.equal(serveNext(ADVISING), null);
  });
});

describe("saved queue entries", () => {
  beforeEach(resetLines);

  test("saves the queue, user, position, join time and waiting status on join", () => {
    const joined = joinQueue(101, findService(ADVISING));
    const row = savedEntry(joined.entry.id);
    const queue = getDb().prepare("SELECT id FROM queue WHERE service_id = ?").get(ADVISING);

    assert.equal(row.queue_id, queue.id);
    assert.equal(row.user_id, 101);
    assert.equal(row.position, 5);
    assert.equal(row.status, "waiting");
    assert.equal(row.join_time, joined.entry.joinedAt);
    assert.equal(row.ended_at, null);
  });

  test("marks an entry canceled when the user leaves, and keeps the row", () => {
    const joined = joinQueue(101, findService(ADVISING));
    leaveQueue(101);

    const row = savedEntry(joined.entry.id);
    assert.equal(row.status, "canceled");
    assert.notEqual(row.ended_at, null);
    assert.equal(findLatestEntry(101).status, "canceled");
  });

  test("marks an entry served when it reaches the front", () => {
    const joined = joinQueue(101, findService(ADVISING));
    for (let i = 0; i < 5; i += 1) {
      serveNext(ADVISING);
    }

    const row = savedEntry(joined.entry.id);
    assert.equal(row.status, "served");
    assert.notEqual(row.ended_at, null);
    assert.equal(findActiveEntry(101), null);
  });

  test("marks an admin-removed entry canceled", () => {
    const joined = joinQueue(101, findService(ADVISING));
    removeEntry(ADVISING, joined.entry.id);
    assert.equal(savedEntry(joined.entry.id).status, "canceled");
  });

  test("lets a user rejoin after leaving, as a new entry", () => {
    const first = joinQueue(101, findService(ADVISING));
    leaveQueue(101);
    const second = joinQueue(101, findService(ADVISING));

    assert.notEqual(second.entry.id, first.entry.id);
    assert.equal(findActiveEntry(101).entry.id, second.entry.id);
    assert.equal(findLatestEntry(101).id, second.entry.id);
  });

  test("has no latest entry for a user who never joined", () => {
    assert.equal(findLatestEntry(102), null);
  });

  test("keeps saved positions gapless through every change to the line", () => {
    const first = joinQueue(101, findService(ADVISING));
    const second = joinQueue(102, findService(ADVISING));
    joinQueue(103, findService(ADVISING));
    assert.deepEqual(savedPositions(ADVISING), [1, 2, 3, 4, 5, 6, 7]);

    setEntryPriority(ADVISING, second.entry.id, "High");
    assert.deepEqual(savedPositions(ADVISING), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(findActiveEntry(102).position, 1);

    leaveQueue(101);
    assert.deepEqual(savedPositions(ADVISING), [1, 2, 3, 4, 5, 6]);

    serveNext(ADVISING);
    assert.deepEqual(savedPositions(ADVISING), [1, 2, 3, 4, 5]);
    assert.equal(findActiveEntry(103).position, 5);
    assert.equal(savedEntry(first.entry.id).status, "canceled");
  });

  test("saves a move as a position swap and the neighbor's priority", () => {
    const joined = joinQueue(101, findService(ADVISING));
    const [, , , walkIn] = getQueue(ADVISING);
    setEntryPriority(ADVISING, walkIn.id, "Low");
    // The walk-in dropped behind the user, who is now #4 and Medium.
    assert.equal(findActiveEntry(101).position, 4);

    const moved = moveEntry(ADVISING, joined.entry.id, "down");

    assert.equal(moved.entry.priority, "Low");
    const row = savedEntry(joined.entry.id);
    assert.equal(row.position, 5);
    assert.equal(row.priority, "Low");
  });

  test("returns the entry unchanged when its priority doesn't change", () => {
    const joined = joinQueue(101, findService(ADVISING));
    const same = setEntryPriority(ADVISING, joined.entry.id, "Medium");
    assert.equal(same.position, 5);
    assert.equal(findActiveEntry(101).position, 5);
  });
});
