const assert = require("node:assert/strict");
const { describe, test, beforeEach, afterEach } = require("node:test");
const { once } = require("events");
const createApp = require("../src/app");
const { getDb } = require("../src/db");
const { resetUsers } = require("../src/store/users");
const { resetServices, findService } = require("../src/store/services");
const { resetQueues, joinQueue } = require("../src/store/queues");
const {
  NOTIFICATION_STATUS,
  resetNotifications,
  addNotification,
  listNotifications,
  hasNotification,
  markViewed,
} = require("../src/store/notifications");
const {
  NOTIFICATION_TYPES,
  isAlmostServed,
  joinedMessage,
  almostServedMessage,
  findNewlyAlmostServed,
} = require("../src/logic/notifications");
const { addUser } = require("./dbHelpers");
const { send } = require("./http");

function resetAll() {
  resetUsers();
  resetServices();
  resetQueues();
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
  let firstEntry;
  let secondEntry;

  beforeEach(() => {
    resetAll();
    addUser(1);
    addUser(2);
    firstEntry = joinQueue(1, findService(1)).entry.id;
    secondEntry = joinQueue(2, findService(2)).entry.id;
  });

  test("lists only one user's notifications, newest first", () => {
    addNotification({ userId: 1, entryId: firstEntry, type: "joined", message: "first" });
    addNotification({ userId: 2, entryId: secondEntry, type: "joined", message: "other user" });
    addNotification({ userId: 1, entryId: firstEntry, type: "almost-served", message: "second" });

    const messages = listNotifications(1).map(
      (notification) => notification.message,
    );
    assert.deepEqual(messages, ["second", "first"]);
  });

  test("knows whether an entry already got a type of notification", () => {
    addNotification({ userId: 1, entryId: firstEntry, type: "joined", message: "hi" });
    assert.equal(hasNotification(firstEntry, "joined"), true);
    assert.equal(hasNotification(firstEntry, "almost-served"), false);
    assert.equal(hasNotification(secondEntry, "joined"), false);
  });

  test("starts empty after a reset", () => {
    addNotification({ userId: 1, entryId: firstEntry, type: "joined", message: "hi" });
    resetNotifications();
    assert.deepEqual(listNotifications(1), []);
  });

  test("saves a new notification as sent, with no viewed time", () => {
    const saved = addNotification({ userId: 1, entryId: firstEntry, type: "joined", message: "hi" });

    assert.equal(saved.status, NOTIFICATION_STATUS.SENT);
    assert.equal(saved.viewedAt, null);
    assert.equal(new Date(saved.createdAt).toISOString(), saved.createdAt);
  });

  test("looks up which service a notification is about", () => {
    const saved = addNotification({ userId: 2, entryId: secondEntry, type: "joined", message: "hi" });
    assert.equal(saved.serviceId, 2);
    assert.equal(saved.serviceName, "Financial Aid");
  });

  test("allows a notification that isn't tied to a queue entry", () => {
    const saved = addNotification({ userId: 1, type: "joined", message: "hi" });
    assert.equal(saved.entryId, null);
    assert.equal(saved.serviceName, null);
  });

  test("marks a notification viewed and saves the time", () => {
    const saved = addNotification({ userId: 1, entryId: firstEntry, type: "joined", message: "hi" });

    const viewed = markViewed(1, saved.id);

    assert.equal(viewed.status, NOTIFICATION_STATUS.VIEWED);
    assert.equal(new Date(viewed.viewedAt).toISOString(), viewed.viewedAt);
    assert.equal(listNotifications(1)[0].status, NOTIFICATION_STATUS.VIEWED);
  });

  test("keeps the first viewed time when marked twice", () => {
    const saved = addNotification({ userId: 1, entryId: firstEntry, type: "joined", message: "hi" });
    const stored = "2026-01-01T00:00:00.000Z";
    getDb().prepare("UPDATE notification SET status = 'viewed', viewed_at = ? WHERE id = ?").run(stored, saved.id);

    assert.equal(markViewed(1, saved.id).viewedAt, stored);
  });

  test("won't mark another user's notification, or one that doesn't exist", () => {
    const saved = addNotification({ userId: 1, entryId: firstEntry, type: "joined", message: "hi" });

    assert.equal(markViewed(2, saved.id), null);
    assert.equal(markViewed(1, 999), null);
    assert.equal(listNotifications(1)[0].status, NOTIFICATION_STATUS.SENT);
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
      body: { fullName: "Test User", email, password: "password123", role },
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

  const markAsViewed = (token, id) =>
    send(base, `/api/notifications/${id}/viewed`, { method: "PATCH", token });

  test("returns new notifications with a sent status", async () => {
    const token = await signIn("student@queuesmart.edu");
    const joined = await join(token, 1);

    assert.equal(joined.body.notifications[0].status, "sent");
    assert.equal((await notificationsFor(token))[0].status, "sent");
  });

  test("marks a notification viewed, and it stays viewed", async () => {
    const token = await signIn("student@queuesmart.edu");
    await join(token, 1);
    const [notification] = await notificationsFor(token);

    const response = await markAsViewed(token, notification.id);

    assert.equal(response.status, 200);
    assert.equal(response.body.notification.status, "viewed");
    assert.notEqual(response.body.notification.viewedAt, null);
    assert.equal((await notificationsFor(token))[0].status, "viewed");
  });

  test("won't let one user mark another user's notification", async () => {
    const owner = await signIn("owner@queuesmart.edu");
    const other = await signIn("other@queuesmart.edu");
    await join(owner, 1);
    const [notification] = await notificationsFor(owner);

    const response = await markAsViewed(other, notification.id);

    assert.equal(response.status, 404);
    assert.equal((await notificationsFor(owner))[0].status, "sent");
  });

  test("returns 404 for a notification that doesn't exist", async () => {
    const token = await signIn("student@queuesmart.edu");
    assert.equal((await markAsViewed(token, 999)).status, 404);
  });

  test("rejects a notification id that isn't a positive whole number", async () => {
    const token = await signIn("student@queuesmart.edu");
    for (const id of ["abc", "0", "-1", "1.5"]) {
      const response = await markAsViewed(token, id);
      assert.equal(response.status, 400);
      assert.equal(response.body.errors[0].field, "id");
    }
  });

  test("requires a token to mark a notification viewed", async () => {
    assert.equal((await markAsViewed(undefined, 1)).status, 401);
  });
});
