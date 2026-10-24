const assert = require("node:assert/strict");
const { describe, test, beforeEach, afterEach } = require("node:test");
const { once } = require("events");
const createApp = require("../src/app");
const { resetUsers } = require("../src/store/users");
const { resetServices } = require("../src/store/services");
const { resetQueues } = require("../src/store/queues");
const { resetHistory } = require("../src/store/history");
const {
  resetNotifications,
  addNotification,
  listNotifications,
  hasNotification,
} = require("../src/store/notifications");
const {
  NOTIFICATION_TYPES,
  isAlmostServed,
  joinedMessage,
  almostServedMessage,
  findNewlyAlmostServed,
} = require("../src/logic/notifications");
const { send } = require("./http");

function resetAll() {
  resetUsers();
  resetServices();
  resetQueues();
  resetHistory();
  resetNotifications();
}

describe("notification rules", () => {
  test("counts positions 1 and 2 as almost served", () => {
    assert.equal(isAlmostServed(1), true);
    assert.equal(isAlmostServed(2), true);
    assert.equal(isAlmostServed(3), false);
    assert.equal(isAlmostServed(0), false);
  });

  test("builds the joined message with position and wait", () => {
    assert.equal(
      joinedMessage("Financial Aid", 8, 160),
      "You joined the Financial Aid queue. You are #8 in line, with an estimated wait of 160 min.",
    );
  });

  test("tells the first person they're next and the second they're almost up", () => {
    assert.equal(
      almostServedMessage("Registrar", 1),
      "You're next at Registrar. Please head to the service desk.",
    );
    assert.equal(
      almostServedMessage("Registrar", 2),
      "You're almost up at Registrar. You are #2 in line.",
    );
  });

  test("finds only real users at the front who haven't been told yet", () => {
    const line = [
      { id: 1, userId: null },
      { id: 2, userId: 10 },
      { id: 3, userId: 11 },
    ];
    const notified = (entryId) => entryId === 2;
    assert.deepEqual(findNewlyAlmostServed(line, notified), []);

    const nobodyNotified = () => false;
    assert.deepEqual(findNewlyAlmostServed(line, nobodyNotified), [
      { entry: { id: 2, userId: 10 }, position: 2 },
    ]);
  });
});

describe("notification store", () => {
  beforeEach(resetNotifications);

  test("lists only one user's notifications, newest first", () => {
    addNotification({
      userId: 1,
      entryId: 5,
      type: "joined",
      message: "first",
    });
    addNotification({
      userId: 2,
      entryId: 6,
      type: "joined",
      message: "other user",
    });
    addNotification({
      userId: 1,
      entryId: 5,
      type: "almost-served",
      message: "second",
    });

    const messages = listNotifications(1).map(
      (notification) => notification.message,
    );
    assert.deepEqual(messages, ["second", "first"]);
  });

  test("knows whether an entry already got a type of notification", () => {
    addNotification({ userId: 1, entryId: 5, type: "joined", message: "hi" });
    assert.equal(hasNotification(5, "joined"), true);
    assert.equal(hasNotification(5, "almost-served"), false);
    assert.equal(hasNotification(6, "joined"), false);
  });

  test("starts empty after a reset", () => {
    addNotification({ userId: 1, entryId: 5, type: "joined", message: "hi" });
    resetNotifications();
    assert.deepEqual(listNotifications(1), []);
  });
});

describe("notification endpoints", () => {
  let server;
  let base;

  beforeEach(async () => {
    resetAll();
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

  const join = (token, serviceId) =>
    send(base, "/api/queue/join", {
      method: "POST",
      token,
      body: { serviceId },
    });
  const serve = (token, serviceId) =>
    send(base, `/api/queue/${serviceId}/serve`, { method: "POST", token });
  const leave = (token) =>
    send(base, "/api/queue/leave", { method: "POST", token });
  const notificationsFor = async (token) =>
    (await send(base, "/api/notifications", { token })).body.notifications;
  const typesFor = async (token) =>
    (await notificationsFor(token)).map((n) => n.type);

  test("requires a token", async () => {
    const response = await send(base, "/api/notifications");
    assert.equal(response.status, 401);
  });

  test("starts with no notifications", async () => {
    const token = await signIn("student@queuesmart.edu");
    assert.deepEqual(await notificationsFor(token), []);
  });

  test("sends a joined notification and returns it with the join response", async () => {
    const token = await signIn("student@queuesmart.edu");
    const joined = await join(token, 1);
    const notifications = await notificationsFor(token);

    assert.equal(joined.status, 201);
    assert.equal(joined.body.notifications.length, 1);
    assert.equal(joined.body.notifications[0].type, NOTIFICATION_TYPES.JOINED);
    assert.equal(notifications.length, 1);
    assert.equal(
      notifications[0].message,
      "You joined the Academic Advising queue. You are #5 in line, with an estimated wait of 75 min.",
    );
  });

  test("doesn't send a joined notification when the join is rejected", async () => {
    const token = await signIn("student@queuesmart.edu");
    await join(token, 3); // Registrar is closed
    assert.deepEqual(await notificationsFor(token), []);
  });

  test("sends an almost-served notification once the user reaches #2", async () => {
    const token = await signIn("student@queuesmart.edu");
    const adminToken = await signIn("admin@queuesmart.edu", "admin");
    await join(token, 1); // #5

    await serve(adminToken, 1); // #4
    await serve(adminToken, 1); // #3
    assert.deepEqual(await typesFor(token), ["joined"]);

    await serve(adminToken, 1); // #2
    const notifications = await notificationsFor(token);
    assert.deepEqual(
      notifications.map((n) => n.type),
      ["almost-served", "joined"],
    );
    assert.equal(
      notifications[0].message,
      "You're almost up at Academic Advising. You are #2 in line.",
    );
  });

  test("sends the almost-served alert only once per time in line", async () => {
    const token = await signIn("student@queuesmart.edu");
    const adminToken = await signIn("admin@queuesmart.edu", "admin");
    await join(token, 1);

    for (let i = 0; i < 4; i += 1) {
      await serve(adminToken, 1);
    }
    assert.deepEqual(await typesFor(token), ["almost-served", "joined"]);
  });

  test("notifies the next user when someone ahead of them leaves", async () => {
    const first = await signIn("first@queuesmart.edu");
    const second = await signIn("second@queuesmart.edu");
    const adminToken = await signIn("admin@queuesmart.edu", "admin");
    await join(first, 1); // #5
    await join(second, 1); // #6
    for (let i = 0; i < 3; i += 1) {
      await serve(adminToken, 1);
    }
    assert.deepEqual(await typesFor(second), ["joined"]);

    await leave(first);
    assert.deepEqual(await typesFor(second), ["almost-served", "joined"]);
  });

  test("notifies the next user when an admin removes someone", async () => {
    const token = await signIn("student@queuesmart.edu");
    const adminToken = await signIn("admin@queuesmart.edu", "admin");
    await join(token, 1);
    await serve(adminToken, 1);
    await serve(adminToken, 1);

    const queue = await send(base, "/api/queue/1", { token: adminToken });
    const frontId = queue.body.queue[0].id;
    await send(base, `/api/queue/1/entries/${frontId}`, {
      method: "DELETE",
      token: adminToken,
    });

    assert.deepEqual(await typesFor(token), ["almost-served", "joined"]);
  });

  test("notifies a user right away when an admin raises their priority", async () => {
    const token = await signIn("student@queuesmart.edu");
    const adminToken = await signIn("admin@queuesmart.edu", "admin");
    await join(token, 1);

    const queue = await send(base, "/api/queue/1", { token: adminToken });
    const mine = queue.body.queue.find(
      (entry) => entry.name === "student@queuesmart.edu",
    );
    await send(base, `/api/queue/1/entries/${mine.id}/priority`, {
      method: "PATCH",
      token: adminToken,
      body: { priority: "High" },
    });

    const notifications = await notificationsFor(token);
    assert.equal(notifications[0].type, "almost-served");
    assert.equal(
      notifications[0].message,
      "You're next at Academic Advising. Please head to the service desk.",
    );
  });

  test("shows each user only their own notifications", async () => {
    const first = await signIn("first@queuesmart.edu");
    const second = await signIn("second@queuesmart.edu");
    await join(first, 1);
    assert.deepEqual(await notificationsFor(second), []);
  });
});
