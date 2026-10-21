const assert = require("node:assert/strict");
const { describe, test } = require("node:test");
const express = require("express");
const { validate } = require("../src/middleware/validate");
const { withServer, send } = require("./http");

function appWith(rules) {
  const app = express();
  app.use(express.json());
  app.post("/check", validate(rules), (req, res) => {
    res.json(req.body);
  });
  return app;
}

const accountRules = {
  email: {
    required: true,
    type: "string",
    trim: true,
    minLength: 5,
    maxLength: 254,
    label: "Email",
  },
  password: {
    required: true,
    type: "string",
    minLength: 8,
    maxLength: 72,
    label: "Password",
  },
};

const queueRules = {
  isOpen: { required: true, type: "boolean", label: "Queue status" },
  age: { required: true, type: "number", label: "Age" },
};

describe("validation middleware", () => {
  test("rejects missing required fields", async () => {
    const response = await withServer(appWith(accountRules), (base) =>
      send(base, "/check", { method: "POST", body: {} })
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "email", message: "Email is required." },
      { field: "password", message: "Password is required." },
    ]);
  });

  test("treats a whitespace-only required string as missing", async () => {
    const response = await withServer(appWith(accountRules), (base) =>
      send(base, "/check", {
        method: "POST",
        body: { email: "   ", password: "password123" },
      })
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "email", message: "Email is required." },
    ]);
  });

  test("rejects values with the wrong type", async () => {
    const response = await withServer(appWith(accountRules), (base) =>
      send(base, "/check", {
        method: "POST",
        body: { email: "user@queuesmart.edu", password: 12345678 },
      })
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "password", message: "Password must be a string." },
    ]);
  });

  test("rejects strings outside the allowed length", async () => {
    const shortPassword = await withServer(appWith(accountRules), (base) =>
      send(base, "/check", {
        method: "POST",
        body: { email: "user@queuesmart.edu", password: "short" },
      })
    );
    const longEmail = await withServer(appWith(accountRules), (base) =>
      send(base, "/check", {
        method: "POST",
        body: { email: `${"a".repeat(250)}@b.co`, password: "password123" },
      })
    );

    assert.equal(shortPassword.status, 400);
    assert.deepEqual(shortPassword.body.errors, [
      { field: "password", message: "Password must be at least 8 characters." },
    ]);
    assert.equal(longEmail.status, 400);
    assert.equal(longEmail.body.errors[0].field, "email");
    assert.equal(longEmail.body.errors[0].message, "Email must be at most 254 characters.");
  });

  test("accepts a valid body and trims string fields that ask for it", async () => {
    const response = await withServer(appWith(accountRules), (base) =>
      send(base, "/check", {
        method: "POST",
        body: {
          email: "  user@queuesmart.edu  ",
          password: "password123",
          extra: "kept",
        },
      })
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      email: "user@queuesmart.edu",
      password: "password123",
      extra: "kept",
    });
  });

  test("accepts boolean false and numeric zero when those types are required", async () => {
    const response = await withServer(appWith(queueRules), (base) =>
      send(base, "/check", { method: "POST", body: { isOpen: false, age: 0 } })
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { isOpen: false, age: 0 });
  });

  test("rejects a string where a boolean is required", async () => {
    const response = await withServer(appWith(queueRules), (base) =>
      send(base, "/check", { method: "POST", body: { isOpen: "false", age: 1 } })
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      { field: "isOpen", message: "Queue status must be a boolean." },
    ]);
  });
});
