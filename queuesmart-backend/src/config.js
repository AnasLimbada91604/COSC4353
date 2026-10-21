function getSecret() {
  return process.env.JWT_SECRET || "queuesmart-dev-secret";
}

function getPort() {
  const port = Number(process.env.PORT);
  return Number.isInteger(port) && port > 0 ? port : 4000;
}

module.exports = { getSecret, getPort };
