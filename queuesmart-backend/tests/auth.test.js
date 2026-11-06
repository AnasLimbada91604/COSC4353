const assert = require("node:assert/strict");
const { describe, test, beforeEach, afterEach } = require("node:test");
const { once } = require("events");
const createApp = require("../src/app");
const { resetUsers, findByEmail } = require("../src/store/users");
const { getDb } = require("../src/db");
const { resetServices } = require("../src/store/services");
const { send } = require("./http");

let server;
let base;

beforeEach(async () => {
  resetUsers();
  resetServices();
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function register(body = {}) {
  return send(base, "/api/auth/register", {
    method: "POST",
    body: {
      fullName: "Alex Student",
      email: "student@queuesmart.edu",
      password: "password123",
      role: "user",
      ...body,
    },
  });
}

function login(email, password) {
  return send(base, "/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

describe("auth", () => {
  test("registers a user and stores a hash instead of the password", async () => {
    const response = await register();

    assert.equal(response.status, 201);
    assert.deepEqual(response.body.user, {
      id: 1,
      email: "student@queuesmart.edu",
      role: "user",
      fullName: "Alex Student",
    });
    assert.equal(response.body.token, undefined);
    assert.equal(response.body.user.passwordHash, undefined);

    const stored = findByEmail("student@queuesmart.edu");
    assert.equal(stored.password, undefined);
    assert.equal(stored.fullName, "Alex Student");
    assert.notEqual(stored.passwordHash, "password123");

    const database = getDb();
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('user_credentials', 'user_profile') ORDER BY name"
      )
      .all()
      .map((row) => row.name);
    assert.deepEqual(tables, ["user_credentials", "user_profile"]);

    const credential = database
      .prepare("SELECT email, password_hash, role FROM user_credentials WHERE id = ?")
      .get(1);
    const profile = database
      .prepare("SELECT full_name FROM user_profile WHERE user_id = ?")
      .get(1);
    assert.equal(credential.email, "student@queuesmart.edu");
    assert.equal(credential.role, "user");
    assert.notEqual(credential.password_hash, "password123");
    assert.equal(profile.full_name, "Alex Student");
    assert.equal(
      database.prepare("SELECT sql FROM sqlite_master WHERE name = 'user_credentials'").get().sql.includes(
        "email TEXT NOT NULL COLLATE NOCASE UNIQUE"
      ),
      true
    );
  });

  test("registers an admin and returns that role from login", async () => {
    const created = await register({
      email: "advisor@queuesmart.edu",
      role: "Admin",
    });
    const response = await login("advisor@queuesmart.edu", "password123");

    assert.equal(created.status, 201);
    assert.equal(created.body.user.role, "admin");
    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, "advisor@queuesmart.edu");
    assert.equal(response.body.user.role, "admin");
    assert.equal(typeof response.body.token, "string");
  });

  test("logs in with a differently cased email", async () => {
    await register();
    const response = await login("Student@QueueSmart.edu", "password123");

    assert.equal(response.status, 200);
    assert.equal(response.body.user.role, "user");
  });

  test("rejects a duplicate email because the database requires unique emails", async () => {
    await register();
    const response = await register({
      email: "STUDENT@queuesmart.edu",
      fullName: "Someone Else",
    });

    assert.equal(response.status, 409);
    assert.deepEqual(response.body.errors, [
      { field: "email", message: "An account with that email already exists." },
    ]);
    assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM user_credentials").get().count, 1);
    assert.throws(
      () =>
        getDb()
          .prepare(
            "INSERT INTO user_credentials (email, password_hash, role) VALUES (?, ?, ?)"
          )
          .run("Student@QueueSmart.edu", "hash", "user"),
      /UNIQUE constraint failed: user_credentials\.email/
    );
  });

  test("rejects registration without a full name", async () => {
    const response = await register({ fullName: "   " });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "fullName", message: "Full name is required." },
    ]);
  });

  test("rejects registration that fails shared field validation", async () => {
    const response = await register({ email: "a@b.co", password: "short", role: "user" });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "password", message: "Password must be at least 8 characters." },
    ]);
  });

  test("rejects an unknown role after length and type checks pass", async () => {
    const response = await register({ role: "guest" });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "role", message: "Role must be user or admin." },
    ]);
  });

  test("rejects a malformed email", async () => {
    const response = await register({ email: "not-an-email" });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "email", message: "Enter a valid email address." },
    ]);
  });

  test("rejects login when the password is wrong or the account is missing", async () => {
    await register();
    const wrongPassword = await login("student@queuesmart.edu", "password999");
    const missingAccount = await login("missing@queuesmart.edu", "password123");

    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.message, "Email or password is incorrect.");
    assert.equal(missingAccount.status, 401);
  });

  test("login uses the shared validator for missing fields", async () => {
    const response = await login("", "");

    assert.equal(response.status, 400);
    assert.deepEqual(
      response.body.errors.map((error) => error.field),
      ["email", "password"]
    );
  });

  test("returns the signed-in user from the token", async () => {
    await register();
    const signedIn = await login("student@queuesmart.edu", "password123");
    const response = await send(base, "/api/auth/me", { token: signedIn.body.token });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, "student@queuesmart.edu");
    assert.equal(response.body.user.role, "user");
    assert.equal(response.body.user.fullName, "Alex Student");
  });

  test("rejects a missing or invalid token", async () => {
    const missing = await send(base, "/api/auth/me");
    const invalid = await send(base, "/api/auth/me", { token: "not-a-token" });

    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
  });

  test("lets an admin list services and open or close a queue", async () => {
    await register({ email: "admin@queuesmart.edu", role: "admin" });
    const signedIn = await login("admin@queuesmart.edu", "password123");
    const token = signedIn.body.token;

    const listed = await send(base, "/api/services", { token });
    const opened = await send(base, "/api/services/3", {
      method: "PATCH",
      token,
      body: { isOpen: true },
    });
    const listedAgain = await send(base, "/api/services", { token });
    const registrar = listedAgain.body.services.find((service) => service.id === 3);

    assert.equal(listed.status, 200);
    assert.equal(listed.body.services.length, 4);
    assert.equal(listed.body.services.find((service) => service.id === 3).isOpen, false);
    assert.equal(opened.status, 200);
    assert.equal(opened.body.service.id, 3);
    assert.equal(opened.body.service.name, "Registrar");
    assert.equal(opened.body.service.isOpen, true);
    assert.equal(registrar.isOpen, true);
  });

  test("blocks users from the admin service routes", async () => {
    await register();
    const signedIn = await login("student@queuesmart.edu", "password123");
    const token = signedIn.body.token;

    const listed = await send(base, "/api/services", { token });
    const updated = await send(base, "/api/services/1", {
      method: "PATCH",
      token,
      body: { isOpen: false },
    });

    assert.equal(listed.status, 403);
    assert.equal(updated.status, 403);
  });

  test("requires an admin token before it validates a queue update", async () => {
    const missingToken = await send(base, "/api/services/1", {
      method: "PATCH",
      body: { isOpen: false },
    });

    assert.equal(missingToken.status, 401);
  });

  test("rejects a queue update with the wrong field type", async () => {
    await register({ email: "admin@queuesmart.edu", role: "admin" });
    const signedIn = await login("admin@queuesmart.edu", "password123");
    const response = await send(base, "/api/services/1", {
      method: "PATCH",
      token: signedIn.body.token,
      body: { isOpen: "yes" },
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "isOpen", message: "Queue status must be a boolean." },
    ]);
  });

  test("returns 404 when the service does not exist", async () => {
    await register({ email: "admin@queuesmart.edu", role: "admin" });
    const signedIn = await login("admin@queuesmart.edu", "password123");
    const response = await send(base, "/api/services/99", {
      method: "PATCH",
      token: signedIn.body.token,
      body: { isOpen: false },
    });

    assert.equal(response.status, 404);
  });
});
