const createApp = require("./app");
const { getPort } = require("./config");
const { countUsers, createUser } = require("./store/users");

async function seedAccounts() {
  if (countUsers() > 0) return;

  await createUser({
    email: "admin@queuesmart.edu",
    password: "Admin12345",
    role: "admin",
  });
  await createUser({
    email: "user@queuesmart.edu",
    password: "User12345",
    role: "user",
  });

  console.log("Seeded admin@queuesmart.edu / Admin12345");
  console.log("Seeded user@queuesmart.edu / User12345");
}

async function start() {
  await seedAccounts();
  const port = getPort();
  const app = createApp();
  app.listen(port, "127.0.0.1", () => {
    console.log(`QueueSmart API listening on http://127.0.0.1:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
