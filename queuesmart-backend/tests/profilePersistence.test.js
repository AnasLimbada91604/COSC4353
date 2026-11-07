const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, test, beforeEach, after } = require("node:test");

// A real file on disk: these tests prove profile data survives, which :memory: can't show.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "queuesmart-profile-"));
process.env.DB_PATH = path.join(directory, "test.sqlite");

const createApp = require("../src/app");
const { closeDb, getDb } = require("../src/db");
const { resetUsers } = require("../src/store/users");
const { ensureProfileColumns, findProfile } = require("../src/store/profiles");
const { withServer, send } = require("./http");

after(() => {
  closeDb();
  fs.rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  resetUsers();
});

async function signIn(base, email) {
  await send(base, "/api/auth/register", {
    method: "POST",
    body: { fullName: "Test User", email, password: "password123", role: "user" },
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

describe("profile data after a server restart", () => {
  test("keeps an update, and keeps a removed phone removed", async () => {
    const token = await runServer(async (base) => {
      const signedIn = await signIn(base, "student@queuesmart.edu");
      const body = {
        fullName: "Updated Name",
        contactPhone: "713-555-0100",
        notificationPreferences: { email: false, sms: true },
      };
      await send(base, "/api/profile", { method: "PUT", token: signedIn, body });
      return signedIn;
    });

    await runServer(async (base) => {
      const { body } = await send(base, "/api/profile", { token });
      assert.equal(body.profile.fullName, "Updated Name");
      assert.equal(body.profile.contactPhone, "713-555-0100");

      const cleared = await send(base, "/api/profile", {
        method: "PUT",
        token,
        body: { fullName: "Updated Name", notificationPreferences: { email: true, sms: false } },
      });
      assert.equal(cleared.status, 200);
    });

    await runServer(async (base) => {
      const { body } = await send(base, "/api/profile", { token });
      assert.equal(body.profile.contactPhone, null);
      assert.deepEqual(body.profile.notificationPreferences, { email: true, sms: false });
    });
  });

  test("adds the new columns to a database made before they existed", () => {
    ensureProfileColumns();
    getDb().exec(`
      ALTER TABLE user_profile DROP COLUMN contact_phone;
      ALTER TABLE user_profile DROP COLUMN notification_preferences;
      INSERT INTO user_credentials (id, email, password_hash, role) VALUES (1, 'old@queuesmart.edu', 'hash', 'user');
      INSERT INTO user_profile (user_id, full_name) VALUES (1, 'Old Account');
    `);
    closeDb();

    const profile = findProfile(1);

    assert.equal(profile.fullName, "Old Account");
    assert.equal(profile.contactPhone, null);
    assert.deepEqual(profile.notificationPreferences, { email: true, sms: false });
    assert.throws(
      () => getDb().prepare("UPDATE user_profile SET contact_phone = '1' WHERE user_id = 1").run(),
      /CHECK/
    );
  });
});
