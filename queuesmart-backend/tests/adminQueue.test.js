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