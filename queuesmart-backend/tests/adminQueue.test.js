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
    resetQueues(); // after resetServices: placeholder entries come from the seeded queueLength
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

async function loginAs(role, email = `${role}@queuesmart.edu`) {
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

function viewQueue(token, serviceId) {
    return send(base, `/api/queue/${serviceId}`, { method: "GET", token });
}

describe("GET /api/queue/:serviceId", () => {
    test("shows the seeded queue in served order", async () => {
        const token = await loginAs("admin");

        const response = await viewQueue(token, 1);

        assert.equal(response.status, 200);
        assert.deepEqual(response.body.service, { id: 1, name: "Academic Advising", duration: 15 });
        assert.equal(response.body.queue.length, 4);
        assert.deepEqual(response.body.queue.map((entry) => entry.position), [1, 2, 3, 4]);
        assert.equal(response.body.queue[0].name, `Walk-in #${response.body.queue[0].id}`);
    });

    test("shows a user who joined by their email, at the back", async () => {
        const adminToken = await loginAs("admin");
        const userToken = await loginAs("user", "priya@queuesmart.edu");
        await send(base, "/api/queue/join", { method: "POST", token: userToken, body: { serviceId: 1 } });

        const response = await viewQueue(adminToken, 1);

        assert.equal(response.body.queue.length, 5);
        assert.equal(response.body.queue[4].name, "priya@queuesmart.edu");
        assert.equal(response.body.queue[4].position, 5);
    });

    test("is one shorter after serving next", async () => {
        const token = await loginAs("admin");
        const before = await viewQueue(token, 1);

        const served = await send(base, "/api/queue/1/serve", { method: "POST", token });
        const after = await viewQueue(token, 1);

        assert.equal(served.body.served.id, before.body.queue[0].id);
        assert.equal(after.body.queue.length, 3);
        assert.equal(after.body.queue[0].position, 1);
    });

    test("returns 404 for an unknown service", async () => {
        const token = await loginAs("admin");
        const response = await viewQueue(token, 999);
        assert.equal(response.status, 404);
        assert.equal(response.body.message, "Service not found.");
    });

    test("blocks non-admins and missing tokens", async () => {
        const token = await loginAs("user");
        assert.equal((await viewQueue(token, 1)).status, 403);
        assert.equal((await viewQueue(undefined, 1)).status, 401);
    });
});

function removeFromQueue(token, serviceId, entryId) {
    return send(base, `/api/queue/${serviceId}/entries/${entryId}`, { method: "DELETE", token });
}

function moveInQueue(token, serviceId, entryId, direction) {
    return send(base, `/api/queue/${serviceId}/entries/${entryId}/move`, {
        method: "PATCH",
        token,
        body: { direction },
    });
}

function setPriority(token, serviceId, entryId, priority) {
    return send(base, `/api/queue/${serviceId}/entries/${entryId}/priority`, {
        method: "PATCH",
        token,
        body: { priority },
    });
}

// ids of everyone in line, in served order
function idsOf(response) {
    return response.body.queue.map((entry) => entry.id);
}

describe("DELETE /api/queue/:serviceId/entries/:entryId", () => {
    test("removes that person and returns the shorter line", async () => {
        const token = await loginAs("admin");
        const before = await viewQueue(token, 1);
        const [first, second, third, fourth] = idsOf(before);

        const response = await removeFromQueue(token, 1, second);

        assert.equal(response.status, 200);
        assert.deepEqual(idsOf(response), [first, third, fourth]);
        assert.deepEqual(response.body.queue.map((entry) => entry.position), [1, 2, 3]);
    });

    test("records a removed user as a no-show in their history", async () => {
        const adminToken = await loginAs("admin");
        const userToken = await loginAs("user");
        const joined = await send(base, "/api/queue/join", { method: "POST", token: userToken, body: { serviceId: 1 } });
        const line = await viewQueue(adminToken, 1);
        const userEntry = line.body.queue.find((entry) => entry.name === "user@queuesmart.edu");
        assert.equal(joined.status, 201);

        await removeFromQueue(adminToken, 1, userEntry.id);

        const status = await send(base, "/api/queue/status", { method: "GET", token: userToken });
        const history = await send(base, "/api/history", { method: "GET", token: userToken });
        assert.equal(status.body.inQueue, false);
        assert.equal(history.body.history[0].outcome, "No-show");
    });

    test("returns 404 for an unknown person or service", async () => {
        const token = await loginAs("admin");
        assert.equal((await removeFromQueue(token, 1, 999)).status, 404);
        assert.equal((await removeFromQueue(token, 999, 1)).status, 404);
    });

    test("blocks non-admins", async () => {
        const token = await loginAs("user");
        assert.equal((await removeFromQueue(token, 1, 1)).status, 403);
    });
});

describe("PATCH /api/queue/:serviceId/entries/:entryId/priority", () => {
    test("raising priority moves them to the back of the higher group", async () => {
        const token = await loginAs("admin");
        const [first, second, third, fourth] = idsOf(await viewQueue(token, 1)); // all Medium

        await setPriority(token, 1, fourth, "High");
        const response = await setPriority(token, 1, third, "High");

        assert.equal(response.status, 200);
        assert.deepEqual(idsOf(response), [fourth, third, first, second]);
        assert.equal(response.body.queue[1].priority, "High");
    });

    test("lowering priority moves them to the front of the lower group", async () => {
        const token = await loginAs("admin");
        const [first, second, third, fourth] = idsOf(await viewQueue(token, 1));

        await setPriority(token, 1, fourth, "Low");
        const response = await setPriority(token, 1, first, "Low");

        assert.deepEqual(idsOf(response), [second, third, first, fourth]);
    });

    test("rejects a priority that isn't Low, Medium or High", async () => {
        const token = await loginAs("admin");
        const response = await setPriority(token, 1, 1, "Urgent");
        assert.equal(response.status, 400);
        assert.equal(response.body.errors[0].field, "priority");
    });

    test("returns 404 for someone not in the queue", async () => {
        const token = await loginAs("admin");
        assert.equal((await setPriority(token, 1, 999, "High")).status, 404);
    });
});

describe("PATCH /api/queue/:serviceId/entries/:entryId/move", () => {
    test("swaps with the neighbor and keeps priority inside the same group", async () => {
        const token = await loginAs("admin");
        const [first, second, third, fourth] = idsOf(await viewQueue(token, 1));

        const response = await moveInQueue(token, 1, second, "up");

        assert.equal(response.status, 200);
        assert.deepEqual(idsOf(response), [second, first, third, fourth]);
        assert.equal(response.body.queue[0].priority, "Medium");
    });

    test("crossing into another group takes that group's priority", async () => {
        const token = await loginAs("admin");
        const [, , , fourth] = idsOf(await viewQueue(token, 1));
        await setPriority(token, 1, fourth, "High"); // fourth is now first, the only High

        const response = await moveInQueue(token, 1, fourth, "down");

        assert.equal(response.body.queue[1].id, fourth);
        assert.equal(response.body.queue[1].priority, "Medium");
    });

    test("can't move past either end of the line", async () => {
        const token = await loginAs("admin");
        const [first, , , fourth] = idsOf(await viewQueue(token, 1));
        assert.equal((await moveInQueue(token, 1, first, "up")).status, 409);
        assert.equal((await moveInQueue(token, 1, fourth, "down")).status, 409);
    });

    test("rejects a direction that isn't up or down", async () => {
        const token = await loginAs("admin");
        const response = await moveInQueue(token, 1, 1, "sideways");
        assert.equal(response.status, 400);
        assert.equal(response.body.errors[0].field, "direction");
    });
});