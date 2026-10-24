const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const { resetServices, findService } = require("../src/store/services");
const {
  resetQueues,
  joinQueue,
  leaveQueue,
  serveNext,
  getQueue,
  findActiveEntry,
  setEntryPriority,
} = require("../src/store/queues");

const ADVISING = 1;
const users = (line) => line.map((entry) => entry.userId);

describe("queue ordering", () => {
  beforeEach(() => {
    resetServices();
    resetQueues();
  });

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
  beforeEach(() => {
    resetServices();
    resetQueues();
  });

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
