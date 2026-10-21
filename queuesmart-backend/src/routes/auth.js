const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getSecret } = require("../config");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/authenticate");
const { email, password, role } = require("../validation/rules");
const { createUser, findByEmail, toPublic } = require("../store/users");

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(["user", "admin"]);

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, getSecret(), { expiresIn: "8h" });
}

router.post("/register", validate({ email, password, role }), async (req, res, next) => {
  try {
    const errors = [];
    if (!EMAIL_PATTERN.test(req.body.email)) {
      errors.push({ field: "email", message: "Enter a valid email address." });
    }

    const normalizedRole = req.body.role.toLowerCase();
    if (!ROLES.has(normalizedRole)) {
      errors.push({ field: "role", message: "Role must be user or admin." });
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    if (findByEmail(req.body.email)) {
      return res.status(409).json({
        errors: [{ field: "email", message: "An account with that email already exists." }],
      });
    }

    const user = await createUser({
      email: req.body.email,
      password: req.body.password,
      role: normalizedRole,
    });

    return res.status(201).json({ user: toPublic(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", validate({ email, password }), async (req, res, next) => {
  try {
    if (!EMAIL_PATTERN.test(req.body.email)) {
      return res.status(400).json({
        errors: [{ field: "email", message: "Enter a valid email address." }],
      });
    }

    const user = findByEmail(req.body.email);
    const passwordMatches =
      user !== null && (await bcrypt.compare(req.body.password, user.passwordHash));

    if (!passwordMatches) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }

    return res.json({
      token: signToken(user),
      user: toPublic(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
