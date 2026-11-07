const { getDb } = require("../src/db");

// A bare account, so queue_entry and notification rows have a real user to point at.
function addUser(id) {
  getDb()
    .prepare(
      "INSERT INTO user_credentials (id, email, password_hash, role) VALUES (?, ?, 'hash', 'user')",
    )
    .run(id, `user${id}@queuesmart.edu`);
}

module.exports = { addUser };
