const bcrypt = require("bcryptjs");

const SALT_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 10;

let users = [];
let nextId = 1;

function resetUsers() {
  users = [];
  nextId = 1;
}

function countUsers() {
  return users.length;
}

function toPublic(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

function findByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return users.find((user) => user.email === normalized) || null;
}

function findById(id) {
  const numericId = Number(id);
  return users.find((user) => user.id === numericId) || null;
}

async function createUser({ email, password, role }) {
  const user = {
    id: nextId,
    email: email.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
    role,
  };
  nextId += 1;
  users.push(user);
  return user;
}

module.exports = {
  resetUsers,
  countUsers,
  toPublic,
  findByEmail,
  findById,
  createUser,
};
