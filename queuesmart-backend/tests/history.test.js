const assert = require("node:assert/strict");
const { getDb } = require("../src/db");
const { describe, test, beforeEach } = require("node:test");
const { resetUsers } = require("../src/store/users");
const { resetServices, findService } = require("../src/store/services");
const { resetQueues, joinQueue, leaveQueue, serveNext, removeEntry } = require("../src/store/queues");
const { OUTCOMES, listHistory } = require("../src/store/history");
const { addUser } = require("./dbHelpers");

beforeEach(() => {
  resetUsers();
  resetServices();
  resetQueues();
  addUser(7);
  addUser(8);
});

describe("history store", () => {
  test("shows a visit still in progress", () => {
    joinQueue(7, findService(1));

    const [visit] = listHistory(7);
    assert.equal(visit.serviceName, "Academic Advising");
    assert.equal(visit.outcome, OUTCOMES.IN_QUEUE);
    assert.equal(visit.endedAt, null);
    assert.equal(visit.actualWaitMinutes, null);
  });

  test("records leaving the queue", () => {
    joinQueue(7, findService(1));
    leaveQueue(7);

    const [visit] = listHistory(7);
    assert.equal(visit.outcome, OUTCOMES.LEFT);
    assert.notEqual(visit.endedAt, null);
  });

  test("records being served", () => {
    const joined = joinQueue(7, findService(1));
    for (let i = 0; i < joined.position; i += 1) serveNext(1);

    assert.equal(listHistory(7)[0].outcome, OUTCOMES.SERVED);
  });

  test("records being removed by an admin as a no-show", () => {
    const joined = joinQueue(7, findService(1));
    removeEntry(1, joined.entry.id);

    assert.equal(listHistory(7)[0].outcome, OUTCOMES.NO_SHOW);
  });

  test("works out the minutes spent in line", () => {
    const joined = joinQueue(7, findService(1));
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    getDb().prepare("UPDATE queue_entry SET join_time = ? WHERE id = ?").run(thirtyMinutesAgo, joined.entry.id);
    leaveQueue(7);

    assert.equal(listHistory(7)[0].actualWaitMinutes, 30);
  });

  test("lists only that user's visits, newest first", () => {
    joinQueue(7, findService(1));
    leaveQueue(7);
    joinQueue(8, findService(2));
    joinQueue(7, findService(4));

    const history = listHistory(7);
    assert.deepEqual(history.map((visit) => visit.serviceName), ["Student Accounts", "Academic Advising"]);
    assert.ok(history.every((visit) => visit.userId === 7));
  });

  test("is empty for a user with no visits, even with walk-ins in line", () => {
    assert.deepEqual(listHistory(8), []);
  });
});