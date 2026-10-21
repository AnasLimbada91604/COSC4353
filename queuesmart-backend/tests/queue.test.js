const assert = require("node:assert/strict");
const { describe, test, beforeEach, afterEach } = require("node:test");
const { once } = require("events");
const createApp = require("../src/app");
const { resetUsers } = require("../src/store/users");
const { resetServices } = require("../src/store/services");
const { resetQueues } = require("../src/store/queues");
const { resetHistory } = require("../src/store/history");
const { send } = require("./http");

let server;
let base;

beforeEach(async () => {
  resetUsers();
  resetServices();
  resetQueues();
  resetHistory();
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function signIn(email, role = "user") {
  await send(base, "/api/auth/register", {
    method: "POST",
    body: { email, password: "password123", role },
  });
  const response = await send(base, "/api/auth/login", {
    method: "POST",
    body: { email, password: "password123" },
  });
  return response.body.token;
}

function join(token, serviceId) {
  return send(base, "/api/queue/join", { method: "POST", token, body: { serviceId } });
}

function serve(token, serviceId) {
  return send(base, `/api/queue/${serviceId}/serve`, { method: "POST", token });
}

describe("queue status and history endpoints", () => {
  test("requires a token", async () => {
    const status = await send(base, "/api/queue/status");
    const history = await send(base, "/api/history");

    assert.equal(status.status, 401);
    assert.equal(history.status, 401);
  });

  test("reports not in a queue before joining", async () => {
    const token = await signIn("student@queuesmart.edu");
    const response = await send(base, "/api/queue/status", { token });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { inQueue: false });
  });

  test("joins at the back of the line with the estimated wait", async () => {
    const token = await signIn("student@queuesmart.edu");
    const joined = await join(token, 1);
    const status = await send(base, "/api/queue/status", { token });

    assert.equal(joined.status, 201);
    assert.equal(status.body.inQueue, true);
    assert.equal(status.body.service.name, "Academic Advising");
    assert.equal(status.body.position, 5);
    assert.equal(status.body.minutesPerPerson, 15);
    assert.equal(status.body.estimatedWaitMinutes, 75);
    assert.equal(status.body.status, "waiting");
  });

  test("moves the user up and lowers the wait when an admin serves", async () => {
    const token = await signIn("student@queuesmart.edu");
    const adminToken = await signIn("admin@queuesmart.edu", "admin");
    await join(token, 1);

    for (let i = 0; i < 3; i += 1) {
      await serve(adminToken, 1);
    }
    const status = await send(base, "/api/queue/status", { token });

    assert.equal(status.body.position, 2);
    assert.equal(status.body.estimatedWaitMinutes, 30);
    assert.equal(status.body.status, "almost-ready");
  });

  test("shows served and records it in history when the user is served", async () => {
    const token = await signIn("student@queuesmart.edu");
    const adminToken = await signIn("admin@queuesmart.edu", "admin");
    await join(token, 1);

    for (let i = 0; i < 5; i += 1) {
      await serve(adminToken, 1);
    }
    const status = await send(base, "/api/queue/status", { token });
    const history = await send(base, "/api/history", { token });

    assert.equal(status.body.inQueue, false);
    assert.equal(status.body.status, "served");
    assert.equal(status.body.service.name, "Academic Advising");
    assert.equal(history.body.history.length, 1);
    assert.equal(history.body.history[0].outcome, "Served");
  });

  test("records leaving the queue in history", async () => {
    const token = await signIn("student@queuesmart.edu");
    await join(token, 2);
    const left = await send(base, "/api/queue/leave", { method: "POST", token });
    const status = await send(base, "/api/queue/status", { token });
    const history = await send(base, "/api/history", { token });

    assert.equal(left.status, 200);
    assert.deepEqual(status.body, { inQueue: false });
    assert.equal(history.body.history[0].serviceName, "Financial Aid");
    assert.equal(history.body.history[0].outcome, "Left queue");
  });

  test("shows each user only their own history", async () => {
    const first = await signIn("first@queuesmart.edu");
    const second = await signIn("second@queuesmart.edu");
    await join(first, 1);

    const history = await send(base, "/api/history", { token: second });

    assert.deepEqual(history.body.history, []);
  });

  test("rejects joining a closed, missing or second queue", async () => {
    const token = await signIn("student@queuesmart.edu");
    const closed = await join(token, 3);
    const missing = await join(token, 99);
    await join(token, 1);
    const second = await join(token, 2);

    assert.equal(closed.status, 409);
    assert.equal(missing.status, 404);
    assert.equal(second.status, 409);
  });

  test("validates the service id", async () => {
    const token = await signIn("student@queuesmart.edu");
    const response = await join(token, "1");

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "serviceId", message: "Service must be a number." },
    ]);
  });

  test("returns 404 when leaving without being in a queue", async () => {
    const token = await signIn("student@queuesmart.edu");
    const response = await send(base, "/api/queue/leave", { method: "POST", token });

    assert.equal(response.status, 404);
  });

  test("lets only admins serve, and only from a queue with people in it", async () => {
    const token = await signIn("student@queuesmart.edu");
    const adminToken = await signIn("admin@queuesmart.edu", "admin");

    const asUser = await serve(token, 1);
    const missing = await serve(adminToken, 99);
    for (let i = 0; i < 4; i += 1) {
      await serve(adminToken, 1);
    }
    const empty = await serve(adminToken, 1);

    assert.equal(asUser.status, 403);
    assert.equal(missing.status, 404);
    assert.equal(empty.status, 409);
  });
});
