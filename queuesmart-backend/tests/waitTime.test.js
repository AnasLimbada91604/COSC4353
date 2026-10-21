const assert = require("node:assert/strict");
const { describe, test } = require("node:test");
const {
  estimateWaitMinutes,
  estimateServeAt,
  getQueueStatus,
} = require("../src/logic/waitTime");

describe("wait-time estimation", () => {
  test("multiplies position by minutes per person", () => {
    assert.equal(estimateWaitMinutes(5, 15), 75);
    assert.equal(estimateWaitMinutes(8, 20), 160);
  });

  test("the first person still waits one slot", () => {
    assert.equal(estimateWaitMinutes(1, 10), 10);
  });

  test("rejects positions that are not whole numbers of 1 or more", () => {
    for (const position of [0, -1, 2.5, NaN, "3", undefined]) {
      assert.throws(() => estimateWaitMinutes(position, 15), RangeError);
    }
  });

  test("rejects durations that are not positive numbers", () => {
    for (const minutes of [0, -5, NaN, Infinity, "15", null]) {
      assert.throws(() => estimateWaitMinutes(3, minutes), RangeError);
    }
  });

  test("adds the wait to the given time", () => {
    const now = new Date("2026-10-20T15:00:00.000Z");
    const serveAt = estimateServeAt(5, 15, now);

    assert.equal(serveAt.toISOString(), "2026-10-20T16:15:00.000Z");
  });

  test("marks positions 1 and 2 as almost ready and the rest as waiting", () => {
    assert.equal(getQueueStatus(1), "almost-ready");
    assert.equal(getQueueStatus(2), "almost-ready");
    assert.equal(getQueueStatus(3), "waiting");
    assert.equal(getQueueStatus(12), "waiting");
  });
});
