const express = require("express");
const { validate } = require("../middleware/validate");
const { authenticate, requireRole } = require("../middleware/authenticate");
const { isOpen } = require("../validation/rules");
const { listServices, updateQueueStatus } = require("../store/services");

const router = express.Router();

router.use(authenticate, requireRole("admin"));

router.get("/", (req, res) => {
  res.json({ services: listServices() });
});

router.patch("/:id", validate({ isOpen }), (req, res) => {
  const service = updateQueueStatus(req.params.id, req.body.isOpen);
  if (!service) {
    return res.status(404).json({ message: "Service not found." });
  }
  return res.json({ service });
});

module.exports = router;
