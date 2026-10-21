const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { listHistory } = require("../store/history");

const router = express.Router();

router.get("/", authenticate, (req, res) => {
  res.json({ history: listHistory(req.user.id) });
});

module.exports = router;
