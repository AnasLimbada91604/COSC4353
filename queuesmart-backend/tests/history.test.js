const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const {
  OUTCOMES,
  resetHistory,
  recordJoin,
  closeEntry,
  listHistory,
} = require("../src/store/history");

const advising = { id: 1, name: "Academic Advising" };
const financialAid = { id: 2, name: "Financial Aid" };

function join(userId, service, joinedAt) {
  return recordJoin({ userId, service, position: 5, estimatedWaitMinutes: 75, joinedAt });
}

beforeEach(() => {
  resetHistory();
});

describe("history store", () => {
  test("records a join as an open entry", () => {
    const entry = join(7, advising, "2026-10-20T15:00:00.000Z");

    assert.deepEqual(entry, {
      id: 1,
      userId: 7,
      serviceId: 1,
      serviceName: "Academic Advising",
      joinedAt: "2026-10-20T15:00:00.000Z",
      endedAt: null,
      positionAtJoin: 5,
      estimatedWaitMinutes: 75,
      actualWaitMinutes: null,
      outcome: "In queue",
    });
  });

  test("closes the open entry with the outcome and the minutes waited", () => {
    join(7, advising, "2026-10-20T15:00:00.000Z");
    const closed = closeEntry(7, OUTCOMES.SERVED, new Date("2026-10-20T16:10:00.000Z"));

    assert.equal(closed.outcome, "Served");
    assert.equal(closed.endedAt, "2026-10-20T16:10:00.000Z");
    assert.equal(closed.actualWaitMinutes, 70);
  });

  test("records leaving the queue", () => {
    join(7, advising, "2026-10-20T15:00:00.000Z");
    closeEntry(7, OUTCOMES.LEFT, new Date("2026-10-20T15:05:00.000Z"));

    assert.equal(listHistory(7)[0].outcome, "Left queue");
  });

  test("returns null when the user has no open entry", () => {
    assert.equal(closeEntry(7, OUTCOMES.SERVED), null);

    join(7, advising, "2026-10-20T15:00:00.000Z");
    closeEntry(7, OUTCOMES.LEFT);
    assert.equal(closeEntry(7, OUTCOMES.SERVED), null);
  });

  test("rejects an unknown or non-closing outcome", () => {
    join(7, advising, "2026-10-20T15:00:00.000Z");

    assert.throws(() => closeEntry(7, "Finished"), RangeError);
    assert.throws(() => closeEntry(7, OUTCOMES.IN_QUEUE), RangeError);
  });

  test("lists only that user's entries, newest first", () => {
    join(7, advising, "2026-10-01T15:00:00.000Z");
    closeEntry(7, OUTCOMES.SERVED, new Date("2026-10-01T16:00:00.000Z"));
    join(8, advising, "2026-10-05T15:00:00.000Z");
    join(7, financialAid, "2026-10-10T15:00:00.000Z");

    const entries = listHistory(7);

    assert.deepEqual(
      entries.map((entry) => entry.serviceName),
      ["Financial Aid", "Academic Advising"]
    );
    assert.equal(listHistory(99).length, 0);
  });

  test("returns copies so callers cannot change stored history", () => {
    join(7, advising, "2026-10-20T15:00:00.000Z");
    listHistory(7)[0].outcome = "Served";

    assert.equal(listHistory(7)[0].outcome, "In queue");
  });
});
