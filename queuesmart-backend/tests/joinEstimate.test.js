const assert = require("node:assert/strict");
const { describe, test, beforeEach, afterEach } = require("node:test");
const { once } = require("events");
const createApp = require("../src/app");
const { resetUsers } = require("../src/store/users");
const { resetServices } = require("../src/store/services");
const { resetQueues } = require("../src/store/queues");
const { resetHistory } = require("../src/store/history");
const { resetNotifications } = require("../src/store/notifications");
const { send } = require("./http");

describe("join estimate endpoint", () => {
  let server;
  let base;

  beforeEach(async () => {
    resetUsers();
    resetServices();
    resetQueues();
    resetHistory();
    resetNotifications();
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function signIn(email) {
    await send(base, "/api/auth/register", {
      method: "POST",
      body: { email, password: "password123", role: "user" },
    });
    const response = await send(base, "/api/auth/login", {
      method: "POST",
      body: { email, password: "password123" },
    });
    return response.body.token;
  }

  test("requires a token", async () => {
    const response = await send(base, "/api/queue/1/estimate");
    assert.equal(response.status, 401);
  });

  test("estimates the wait for joining at the back of the line", async () => {
    const token = await signIn("student@queuesmart.edu");
    const response = await send(base, "/api/queue/1/estimate", { token });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      serviceId: 1,
      isOpen: true,
      peopleInLine: 4,
      minutesPerPerson: 15,
      estimatedWaitMinutes: 75,
    });
  });

  test("goes up when someone else joins", async () => {
    const other = await signIn("other@queuesmart.edu");
    const token = await signIn("student@queuesmart.edu");
    await send(base, "/api/queue/join", {
      method: "POST",
      token: other,
      body: { serviceId: 1 },
    });

    const response = await send(base, "/api/queue/1/estimate", { token });
    assert.equal(response.body.peopleInLine, 5);
    assert.equal(response.body.estimatedWaitMinutes, 90);
  });

  test("returns 404 for a service that doesn't exist", async () => {
    const token = await signIn("student@queuesmart.edu");
    const response = await send(base, "/api/queue/99/estimate", { token });
    assert.equal(response.status, 404);
  });

  test("doesn't let a user reach the admin queue view", async () => {
    const token = await signIn("student@queuesmart.edu");
    const response = await send(base, "/api/queue/1", { token });
    assert.equal(response.status, 403);
  });
});
