const assert = require("node:assert/strict");
const { describe, test, beforeEach, afterEach } = require("node:test");
const { once } = require("events");
const createApp = require("../src/app");
const { resetUsers } = require("../src/store/users");
const { resetServices } = require("../src/store/services");
const { send } = require("./http");
const {maxDuration, priorityOptions} = require("../src/validation/rules.js");

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

async function loginAs(role) {
    const email = `${role}@queuesmart.edu`;
    await send(base, "/api/auth/register", {
        method: "POST",
        body: { email, password: "password123", role },
    });
    const signedIn = await send(base, "/api/auth/login", {
        method: "POST",
        body: { email, password: "password123" },
    });
    return signedIn.body.token;
}

function postService(token, overrides = {}) {
    return send(base, "/api/services", {
        method: "POST",
        token,
        body: {
            name: "Tutoring",
            description: "Homework help",
            duration: 30,
            priority: "Medium",
            ...overrides,
        },
    });
}

function putService(token, id, overrides = {}) {
    return send(base, `/api/services/${id}`, {
        method: "PUT",
        token,
        body: {
            name: "Tutoring",
            description: "Homework help",
            duration: 30,
            priority: "Medium",
            ...overrides,
        },
    })
}

describe("POST /api/services", () => {
    test("creates a service with the next id", async () => {
        const token = await loginAs("admin");          // arrange

        const response = await postService(token);     // act

        assert.equal(response.status, 201);            // assert
        assert.deepEqual(response.body.service, {
            id: 5,
            name: "Tutoring",
            description: "Homework help",
            duration: 30,
            priority: "Medium",
            queueLength: 0,
            isOpen: true,
        });
    });

    test("logged in as non admin cannot create a service", async () => {
        const token = await loginAs("user");
        const response = await postService(token);
        assert.equal(response.status, 403);
    })

    test("no login token is rejected", async () => {
        const response = await postService(undefined);
        assert.equal(response.status, 401);
    })

    test("empty strings for all four fields are rejected", async () => {
        const token = await loginAs("admin");
        const response = await postService(token, {
            name: "",
            description: "",
            duration: "",
            priority: "",
        });
        assert.equal(response.status, 400);
        assert.deepEqual(response.body.errors, [
            { field: "name", message: "Service name is required." },
            { field: "description", message: "Service description is required." },
            { field: "duration", message: "Service duration is required." },
            { field: "priority", message: "Service priority is required." }
        ]);
    })

    test("rejects a service with a zero duration", async () => {
        const token = await loginAs("admin");
        const response = await postService(token, { duration: 0 });
        assert.equal(response.status, 400);
        assert.deepEqual(response.body.errors, [
            { field: "duration", message: `Duration must be a whole number from 1 to ${maxDuration}.` }
        ]);
    })

    test("the service is ID is incremented", async () => {
        const token = await loginAs("admin");
        await postService(token);
        const response = await postService(token);
        assert.equal(response.status, 201);
        assert.equal(response.body.service.id, 6);
    })

    test("priority is not an allowed value", async () => {
        const token = await loginAs("admin");
        const response = await postService(token, { priority: "IMMEDIATE" });
        assert.equal(response.status, 400);
        assert.deepEqual(response.body.errors, [
            { field: "priority", message: `Priority must be one of: ${priorityOptions.join(", ")}.` }
        ]);
    })

    test("name is out of range", async () => {
        const token = await loginAs("admin");
        const response = await postService(token, { name: "a".repeat(101) });
        assert.equal(response.status, 400);
        assert.deepEqual(response.body.errors, [
            { field: "name", message: 'Service name must be at most 100 characters.' }
        ]);
    })
});

describe("PUT /api/services/:id", () => {

    test("updates register, then call GET to check", async () => {
        const token = await loginAs("admin");
        const updated = await putService(token, 3, { name: "Updated Registrar", duration: 25, priority: "High" })
        assert.equal(updated.status, 200);
        assert.deepEqual(updated.body.service, {
            id: 3,
            name: "Updated Registrar",
            description: "Homework help",
            duration: 25,
            priority: "High",
            queueLength: 2,
            isOpen: false
        });
        const list = await send(base, "/api/services", { method: "GET", token });
        const registrar = list.body.services.find((service) => service.id === 3);
        assert.equal(registrar.name, "Updated Registrar");
    })

    test("rejects an update with a zero duration", async () => {
        const token = await loginAs("admin");
        const response = await postService(token);
        const id = response.body.service.id;
        const updated = await putService(token, id, { duration: 0 });
        assert.equal(updated.status, 400);
        assert.deepEqual(updated.body.errors, [
            { field: "duration", message: `Duration must be a whole number from 1 to ${maxDuration}.` }
        ]);
    })

    test("checks if the service exists", async () => {
        const token = await loginAs("admin");
        const response = await putService(token, 100, { name: "Updated Registrar", duration: 25, priority: "High" })
        assert.equal(response.status, 404);
        assert.equal(response.body.message, "Service not found.");
    })

    test("reject with a duration too long", async () => {
        const token = await loginAs("admin");
        const response = await putService(token, 3, { name: "Updated Registrar", duration: 481, priority: "High" })
        assert.equal(response.status, 400);
        assert.deepEqual(response.body.errors, [
            { field: "duration", message: `Duration must be a whole number from 1 to ${maxDuration}.` }
        ]);
    })

    test("checks if is user and not admin in PUT", async () => {
        const token = await loginAs("user");
        const response = await putService(token, 3);
        assert.equal(response.status, 403);
    })
});