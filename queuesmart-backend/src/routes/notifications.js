const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { listNotifications, markViewed } = require("../store/notifications");

const router = express.Router();

router.use(authenticate);


router.get("/", (req, res) => {
  res.json({ notifications: listNotifications(req.user.id) });
});

router.patch("/:id/viewed", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      errors: [{ field: "id", message: "Notification id must be a positive whole number." }],
    });
  }
  const notification = markViewed(req.user.id, id);
  if (!notification) {
    return res.status(404).json({ message: "Notification not found." });
  }
  return res.json({ notification });
});

module.exports = router;
