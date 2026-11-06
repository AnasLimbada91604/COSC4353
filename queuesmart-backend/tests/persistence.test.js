const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, test, beforeEach, after } = require("node:test");

// A real file on disk: this suite proves data survives, which :memory: can't show.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "queuesmart-"));
process.env.DB_PATH = path.join(directory, "test.sqlite");

const createApp = require("../src/app");
const { closeDb, getDb } = require("../src/db");
const { resetUsers } = require("../src/store/users");
const { resetServices, seedIfEmpty, findService } = require("../src/store/services");
const { resetQueues } = require("../src/store/queues");
const { withServer, send } = require("./http");

after(() => {
  closeDb();
  fs.rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  resetUsers();
  resetServices();
  resetQueues();
});

async function signIn(base, email, role = "user") {
  await send(base, "/api/auth/register", {
    method: "POST",
    body: { fullName: "Test User", email, password: "password123", role },
  });
  const response = await send(base, "/api/auth/login", {
    method: "POST",
    body: { email, password: "password123" },
  });
  return response.body.token;
}

// Runs the steps against a fresh app, then closes the database, like stopping the server.
async function runServer(steps) {
  const result = await withServer(createApp(), steps);
  closeDb();
  return result;
}

async function adminLine(base, token) {
  const response = await send(base, "/api/queue/1", { token });
  return response.body.queue;
}

describe("data after a server restart", () => {
  test("keeps the user's place in line and the wait estimate", async () => {
    const token = await runServer(async (base) => {
      const signedIn = await signIn(base, "student@queuesmart.edu");
      const joined = await send(base, "/api/queue/join", { method: "POST", token: signedIn, body: { serviceId: 1 } });
      assert.equal(joined.status, 201);
      return signedIn;
    });

    await runServer(async (base) => {
      const status = await send(base, "/api/queue/status", { token });
      const estimate = await send(base, "/api/queue/1/estimate", { token });

      assert.equal(status.body.inQueue, true);
      assert.equal(status.body.service.name, "Academic Advising");
      assert.equal(status.body.position, 5);
      assert.equal(status.body.estimatedWaitMinutes, 75);
      assert.equal(estimate.body.peopleInLine, 5);
    });
  });

  test("still enforces one queue at a time", async () => {
    const token = await runServer(async (base) => {
      const signedIn = await signIn(base, "student@queuesmart.edu");
      await send(base, "/api/queue/join", { method: "POST", token: signedIn, body: { serviceId: 1 } });
      return signedIn;
    });

    await runServer(async (base) => {
      const second = await send(base, "/api/queue/join", { method: "POST", token, body: { serviceId: 2 } });
      assert.equal(second.status, 409);
    });
  });

  test("keeps notifications and whether each one was viewed", async () => {
    const token = await runServer(async (base) => {
      const signedIn = await signIn(base, "student@queuesmart.edu");
      const admin = await signIn(base, "admin@queuesmart.edu", "admin");
      await send(base, "/api/queue/join", { method: "POST", token: signedIn, body: { serviceId: 1 } });
      for (let i = 0; i < 3; i += 1) {
        await send(base, "/api/queue/1/serve", { method: "POST", token: admin });
      }
      const { body } = await send(base, "/api/notifications", { token: signedIn });
      const joined = body.notifications.find((item) => item.type === "joined");
      await send(base, `/api/notifications/${joined.id}/viewed`, { method: "PATCH", token: signedIn });
      return signedIn;
    });

    await runServer(async (base) => {
      const { body } = await send(base, "/api/notifications", { token });
      assert.deepEqual(
        body.notifications.map((item) => [item.type, item.status]),
        [["almost-served", "sent"], ["joined", "viewed"]],
      );
      assert.notEqual(body.notifications[1].viewedAt, null);
    });
  });

  test("doesn't repeat the almost-served alert for someone already told", async () => {
    const { token, admin } = await runServer(async (base) => {
      const signedIn = await signIn(base, "student@queuesmart.edu");
      const adminToken = await signIn(base, "admin@queuesmart.edu", "admin");
      await send(base, "/api/queue/join", { method: "POST", token: signedIn, body: { serviceId: 1 } });
      for (let i = 0; i < 3; i += 1) {
        await send(base, "/api/queue/1/serve", { method: "POST", token: adminToken });
      }
      return { token: signedIn, admin: adminToken };
    });

    await runServer(async (base) => {
      await send(base, "/api/queue/1/serve", { method: "POST", token: admin });
      const { body } = await send(base, "/api/notifications", { token });
      assert.deepEqual(body.notifications.map((item) => item.type), ["almost-served", "joined"]);
    });
  });

  test("keeps a user out of line after they leave", async () => {
    const token = await runServer(async (base) => {
      const signedIn = await signIn(base, "student@queuesmart.edu");
      await send(base, "/api/queue/join", { method: "POST", token: signedIn, body: { serviceId: 1 } });
      await send(base, "/api/queue/leave", { method: "POST", token: signedIn });
      return signedIn;
    });

    await runServer(async (base) => {
      const status = await send(base, "/api/queue/status", { token });
      const estimate = await send(base, "/api/queue/1/estimate", { token });
      assert.deepEqual(status.body, { inQueue: false });
      assert.equal(estimate.body.peopleInLine, 4);
    });
  });

  test("still shows served, with the service, after a restart", async () => {
    const token = await runServer(async (base) => {
      const signedIn = await signIn(base, "student@queuesmart.edu");
      const admin = await signIn(base, "admin@queuesmart.edu", "admin");
      await send(base, "/api/queue/join", { method: "POST", token: signedIn, body: { serviceId: 1 } });
      for (let i = 0; i < 5; i += 1) {
        await send(base, "/api/queue/1/serve", { method: "POST", token: admin });
      }
      return signedIn;
    });

    await runServer(async (base) => {
      const status = await send(base, "/api/queue/status", { token });
      assert.equal(status.body.status, "served");
      assert.equal(status.body.service.name, "Academic Advising");
      assert.notEqual(status.body.servedAt, null);
    });
  });

  test("keeps services an admin created, and queues an admin closed", async () => {
    const created = await runServer(async (base) => {
      const admin = await signIn(base, "admin@queuesmart.edu", "admin");
      const response = await send(base, "/api/services", {
        method: "POST",
        token: admin,
        body: { name: "Tutoring", description: "Homework help", duration: 30, priority: "Low" },
      });
      await send(base, "/api/services/1", { method: "PATCH", token: admin, body: { isOpen: false } });
      return response.body.service;
    });

    assert.equal(findService(created.id).name, "Tutoring");
    assert.equal(findService(1).isOpen, false);
    closeDb();
  });

  test("doesn't re-seed the walk-ins once the database has data", async () => {
    await runServer(async (base) => {
      const admin = await signIn(base, "admin@queuesmart.edu", "admin");
      await send(base, "/api/queue/1/serve", { method: "POST", token: admin });
    });

    seedIfEmpty();

    assert.equal(findService(1).queueLength, 3);
    closeDb();
  });

  test("seeds a database that has no services", () => {
    getDb().exec("DELETE FROM service");
    seedIfEmpty();
    assert.equal(findService(1).name, "Academic Advising");
    assert.equal(findService(1).queueLength, 4);
  });
});

describe("admin queue changes after a server restart", () => {
  test("keeps the new order after moving someone up", async () => {
    const { token, movedId } = await runServer(async (base) => {
      const admin = await signIn(base, "admin@queuesmart.edu", "admin");
      const line = await adminLine(base, admin);
      const moved = await send(base, `/api/queue/1/entries/${line[1].id}/move`, {
        method: "PATCH",
        token: admin,
        body: { direction: "up" },
      });
      assert.equal(moved.status, 200);
      return { token: admin, movedId: line[1].id };
    });

    await runServer(async (base) => {
      const line = await adminLine(base, token);
      assert.equal(line[0].id, movedId);
      assert.deepEqual(line.map((entry) => entry.position), [1, 2, 3, 4]);
    });
  });

  test("keeps a raised priority and the place it moved to", async () => {
    const { token, raisedId } = await runServer(async (base) => {
      const admin = await signIn(base, "admin@queuesmart.edu", "admin");
      const line = await adminLine(base, admin);
      const raised = await send(base, `/api/queue/1/entries/${line[3].id}/priority`, {
        method: "PATCH",
        token: admin,
        body: { priority: "High" },
      });
      assert.equal(raised.status, 200);
      return { token: admin, raisedId: line[3].id };
    });

    await runServer(async (base) => {
      const [first] = await adminLine(base, token);
      assert.equal(first.id, raisedId);
      assert.equal(first.priority, "High");
    });
  });

  test("keeps a removed entry out of line, saved as canceled by an admin", async () => {
    const { token, removedId } = await runServer(async (base) => {
      const admin = await signIn(base, "admin@queuesmart.edu", "admin");
      const line = await adminLine(base, admin);
      const removed = await send(base, `/api/queue/1/entries/${line[0].id}`, { method: "DELETE", token: admin });
      assert.equal(removed.status, 200);
      return { token: admin, removedId: line[0].id };
    });

    await runServer(async (base) => {
      const line = await adminLine(base, token);
      assert.equal(line.length, 3);
      assert.ok(line.every((entry) => entry.id !== removedId));
      assert.deepEqual(line.map((entry) => entry.position), [1, 2, 3]);
    });

    // The row is still there, just ended: remove updates it instead of deleting it.
    const row = getDb().prepare("SELECT status, end_reason FROM queue_entry WHERE id = ?").get(removedId);
    assert.equal(row.status, "canceled");
    assert.equal(row.end_reason, "removed");
    closeDb();
  });
});

describe("join is all or nothing", () => {
  test("saves no entry when the notification can't be saved", async (t) => {
    t.mock.method(console, "error", () => {});
    await withServer(createApp(), async (base) => {
      const token = await signIn(base, "student@queuesmart.edu");
      getDb().exec(`
        CREATE TRIGGER fail_notification BEFORE INSERT ON notification
        BEGIN SELECT RAISE(ABORT, 'notification failed'); END;
      `);

      const response = await send(base, "/api/queue/join", { method: "POST", token, body: { serviceId: 1 } });
      getDb().exec("DROP TRIGGER fail_notification");

      const status = await send(base, "/api/queue/status", { token });
      assert.equal(response.status, 500);
      assert.deepEqual(status.body, { inQueue: false });
      assert.equal(findService(1).queueLength, 4);
    });
  });

  test("leaves the user in line when the next person's alert can't be saved", async (t) => {
    t.mock.method(console, "error", () => {});
    await withServer(createApp(), async (base) => {
      const leaver = await signIn(base, "leaver@queuesmart.edu");
      const waiter = await signIn(base, "waiter@queuesmart.edu");
      const admin = await signIn(base, "admin@queuesmart.edu", "admin");
      await send(base, "/api/queue/join", { method: "POST", token: leaver, body: { serviceId: 1 } });
      await send(base, "/api/queue/join", { method: "POST", token: waiter, body: { serviceId: 1 } });
      for (let i = 0; i < 3; i += 1) {
        await send(base, "/api/queue/1/serve", { method: "POST", token: admin });
      }
      getDb().exec(`
        CREATE TRIGGER fail_notification BEFORE INSERT ON notification
        BEGIN SELECT RAISE(ABORT, 'notification failed'); END;
      `);

      const response = await send(base, "/api/queue/leave", { method: "POST", token: leaver });
      getDb().exec("DROP TRIGGER fail_notification");

      const status = await send(base, "/api/queue/status", { token: leaver });
      assert.equal(response.status, 500);
      assert.equal(status.body.inQueue, true);
      assert.equal(status.body.position, 2);
    });
  });
});
