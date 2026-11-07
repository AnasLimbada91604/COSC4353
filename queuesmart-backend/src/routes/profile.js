const express = require("express");
const { validate } = require("../middleware/validate");
const { validateProfileFields } = require("../middleware/validateProfile");
const { authenticate } = require("../middleware/authenticate");
const { fullName } = require("../validation/rules");
const { findProfile, updateProfile } = require("../store/profiles");

const router = express.Router();

router.use(authenticate);

router.get("/", (req, res) => {
  res.json({ profile: findProfile(req.user.id) });
});

// PUT replaces the whole profile: leaving contactPhone out or blank removes it.
router.put("/", validate({ fullName }), validateProfileFields, (req, res) => {
  res.json({ profile: updateProfile(req.user.id, req.body) });
});

module.exports = router;
