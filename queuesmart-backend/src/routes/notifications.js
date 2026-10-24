const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { listNotifications } = require("../store/notifications");

const router = express.Router();

router.use(authenticate);


router.get("/", (req, res) => {
  res.json({ notifications: listNotifications(req.user.id) });
});

module.exports = router;
