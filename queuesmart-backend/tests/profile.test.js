const assert = require("node:assert/strict");
const { describe, test, beforeEach } = require("node:test");
const createApp = require("../src/app");
const { resetUsers, createUser } = require("../src/store/users");
const { ensureProfileColumns, findProfile, updateProfile } = require("../src/store/profiles");
const { getDb } = require("../src/db");
const { withServer, send } = require("./http");

const DEFAULTS = { email: true, sms: false };

function registerBody(extra = {}) {
  return {
    fullName: "Alex Student",
    email: "student@queuesmart.edu",
    password: "password123",
    role: "user",
    ...extra,
  };
}

async function signIn(base, extra = {}) {
  const body = registerBody(extra);
  const registered = await send(base, "/api/auth/register", { method: "POST", body });
  const loggedIn = await send(base, "/api/auth/login", {
    method: "POST",
    body: { email: body.email, password: body.password },
  });
  return { registered, token: loggedIn.body.token };
}

function put(base, token, body) {
  return send(base, "/api/profile", { method: "PUT", token, body });
}

function validUpdate(extra = {}) {
  return {
    fullName: "Alex Student",
    contactPhone: "713-555-0100",
    notificationPreferences: { email: false, sms: true },
    ...extra,
  };
}

beforeEach(() => {
  resetUsers();
});

describe("a new account's profile", () => {
  test("leaves the phone empty and uses the default preferences when they are left out", async () => {
    await withServer(createApp(), async (base) => {
      const { token } = await signIn(base);

      const { body } = await send(base, "/api/profile", { token });

      assert.equal(body.profile.contactPhone, null);
      assert.deepEqual(body.profile.notificationPreferences, DEFAULTS);
    });
  });

});

describe("updating a profile", () => {
  test("saves every field and returns the new profile", async () => {
    await withServer(createApp(), async (base) => {
      const { token } = await signIn(base);

      const updated = await put(base, token, validUpdate({ fullName: "  Alex Q. Student  " }));
      const read = await send(base, "/api/profile", { token });

      assert.equal(updated.status, 200);
      assert.equal(updated.body.profile.fullName, "Alex Q. Student");
      assert.equal(updated.body.profile.contactPhone, "713-555-0100");
      assert.deepEqual(updated.body.profile.notificationPreferences, { email: false, sms: true });
      assert.deepEqual(read.body.profile, updated.body.profile);
    });
  });

  test("shows the new name on the account too", async () => {
    await withServer(createApp(), async (base) => {
      const { token } = await signIn(base);

      await put(base, token, validUpdate({ fullName: "New Name" }));
      const me = await send(base, "/api/auth/me", { token });

      assert.equal(me.body.user.fullName, "New Name");
    });
  });

  test("removes the phone when it is left out, blank or null", async () => {
    await withServer(createApp(), async (base) => {
      const { token } = await signIn(base);
      const withoutPhone = validUpdate();
      delete withoutPhone.contactPhone;

      for (const body of [withoutPhone, validUpdate({ contactPhone: "   " }), validUpdate({ contactPhone: null })]) {
        await put(base, token, validUpdate());
        const response = await put(base, token, body);
        assert.equal(response.status, 200);
        assert.equal(response.body.profile.contactPhone, null);
      }
    });
  });

  test("ignores fields a user can't change here", async () => {
    await withServer(createApp(), async (base) => {
      const { token } = await signIn(base);

      const response = await put(base, token, validUpdate({ email: "other@queuesmart.edu", role: "admin", id: 99 }));
      const me = await send(base, "/api/auth/me", { token });

      assert.equal(response.body.profile.id, 1);
      assert.equal(me.body.user.email, "student@queuesmart.edu");
      assert.equal(me.body.user.role, "user");
    });
  });

  test("only changes the signed-in user's profile", async () => {
    await withServer(createApp(), async (base) => {
      const { token } = await signIn(base);
      await signIn(base, { email: "other@queuesmart.edu", fullName: "Other Person" });

      await put(base, token, validUpdate({ fullName: "Changed" }));

      assert.equal(findProfile(2).fullName, "Other Person");
      assert.equal(findProfile(2).contactPhone, null);
    });
  });

  test("requires a token", async () => {
    await withServer(createApp(), async (base) => {
      const read = await send(base, "/api/profile");
      const update = await put(base, undefined, validUpdate());

      assert.equal(read.status, 401);
      assert.equal(update.status, 401);
    });
  });
});

describe("profile validation", () => {
  async function errorsFor(body) {
    resetUsers();
    return withServer(createApp(), async (base) => {
      const { token } = await signIn(base);
      const response = await put(base, token, body);
      assert.equal(response.status, 400);
      return response.body.errors;
    });
  }

  test("requires a full name", async () => {
    assert.deepEqual(await errorsFor(validUpdate({ fullName: "   " })), [
      { field: "fullName", message: "Full name is required." },
    ]);
  });

  test("limits the full name to 100 characters", async () => {
    assert.deepEqual(await errorsFor(validUpdate({ fullName: "x".repeat(101) })), [
      { field: "fullName", message: "Full name must be at most 100 characters." },
    ]);
  });

  test("rejects a phone that is too short or too long", async () => {
    assert.deepEqual(await errorsFor(validUpdate({ contactPhone: "123456" })), [
      { field: "contactPhone", message: "Contact phone must be at least 7 characters." },
    ]);
    assert.deepEqual(await errorsFor(validUpdate({ contactPhone: "1".repeat(21) })), [
      { field: "contactPhone", message: "Contact phone must be at most 20 characters." },
    ]);
  });

  test("accepts a phone at the length limits", async () => {
    await withServer(createApp(), async (base) => {
      const { token } = await signIn(base);

      for (const contactPhone of ["1234567", "1".repeat(20)]) {
        const response = await put(base, token, validUpdate({ contactPhone }));
        assert.equal(response.status, 200);
        assert.equal(response.body.profile.contactPhone, contactPhone);
      }
    });
  });

  test("rejects a phone with letters or the wrong type", async () => {
    assert.deepEqual(await errorsFor(validUpdate({ contactPhone: "call-me-maybe" })), [
      { field: "contactPhone", message: "Contact phone can only contain digits, spaces and + ( ) . -" },
    ]);
    assert.deepEqual(await errorsFor(validUpdate({ contactPhone: 7135550100 })), [
      { field: "contactPhone", message: "Contact phone must be a string." },
    ]);
  });

  test("requires preferences on an update", async () => {
    const withoutPreferences = validUpdate();
    delete withoutPreferences.notificationPreferences;

    assert.deepEqual(await errorsFor(withoutPreferences), [
      { field: "notificationPreferences", message: "Notification preferences are required." },
    ]);
  });

  test("rejects preferences in the wrong format", async () => {
    const message = "Notification preferences must set email and sms to true or false.";
    const badValues = [
      "email",
      true,
      ["email"],
      {},
      { email: true },
      { email: "yes", sms: false },
      { email: true, sms: false, push: true },
      { email: true, push: false },
    ];

    for (const notificationPreferences of badValues) {
      assert.deepEqual(await errorsFor(validUpdate({ notificationPreferences })), [
        { field: "notificationPreferences", message },
      ]);
    }
  });
});

describe("user_profile table", () => {
  beforeEach(() => {
    ensureProfileColumns();
  });

  function addProfile(userId, column, value) {
    getDb()
      .prepare("INSERT INTO user_credentials (id, email, password_hash, role) VALUES (?, ?, 'hash', 'user')")
      .run(userId, `user${userId}@queuesmart.edu`);
    return getDb()
      .prepare(`INSERT INTO user_profile (user_id, full_name, ${column}) VALUES (?, 'Name', ?)`)
      .run(userId, value);
  }

  test("has every UserProfile field", () => {
    const columns = getDb().prepare("PRAGMA table_info(user_profile)").all().map((column) => column.name);

    assert.deepEqual(columns, ["user_id", "full_name", "contact_phone", "notification_preferences"]);
  });

  test("rejects a phone outside the length limits", () => {
    assert.throws(() => addProfile(1, "contact_phone", "123456"), /CHECK/);
    assert.throws(() => addProfile(2, "contact_phone", "1".repeat(21)), /CHECK/);
  });

  test("rejects preferences that aren't JSON", () => {
    assert.throws(() => addProfile(1, "notification_preferences", "email"), /CHECK/);
  });

  test("defaults the preferences when a row doesn't set them", () => {
    addProfile(1, "contact_phone", null);

    assert.deepEqual(findProfile(1).notificationPreferences, DEFAULTS);
  });

  test("removes the profile with its account", async () => {
    await createUser(registerBody());

    getDb().prepare("DELETE FROM user_credentials WHERE id = 1").run();

    assert.equal(findProfile(1), null);
    assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM user_profile").get().count, 0);
  });
});

describe("profile store", () => {
  test("returns null for a user with no profile", () => {
    assert.equal(findProfile(99), null);
  });

  test("stores preferences in a fixed key order with no extra keys", async () => {
    await createUser(registerBody());

    updateProfile(1, {
      fullName: "Alex",
      notificationPreferences: { sms: true, email: false, extra: 1 },
    });

    const row = getDb().prepare("SELECT notification_preferences FROM user_profile WHERE user_id = 1").get();
    assert.equal(row.notification_preferences, '{"email":false,"sms":true}');
  });
});
