const jwt = require("jsonwebtoken");
const { getSecret } = require("../config");
const { findById, toPublic } = require("../store/users");

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, getSecret());
    const user = findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }
    req.user = toPublic(user);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function requireRole(...roles) {
  return function checkRole(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to do that." });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
