const express = require("express");
const { validate } = require("../middleware/validate");
const { authenticate, requireRole } = require("../middleware/authenticate");
const { serviceId } = require("../validation/rules");
const { findService } = require("../store/services");
const { findActiveEntry, joinQueue, leaveQueue, serveNext } = require("../store/queues");
const { OUTCOMES, recordJoin, closeEntry, listHistory } = require("../store/history");
const {
  estimateWaitMinutes,
  estimateServeAt,
  getQueueStatus,
} = require("../logic/waitTime");

const router = express.Router();

router.use(authenticate);

function buildStatus(found, now = new Date()) {
  const service = findService(found.serviceId);
  return {
    inQueue: true,
    service: { id: service.id, name: service.name, description: service.description },
    position: found.position,
    minutesPerPerson: service.duration,
    estimatedWaitMinutes: estimateWaitMinutes(found.position, service.duration),
    estimatedServeAt: estimateServeAt(found.position, service.duration, now).toISOString(),
    status: getQueueStatus(found.position),
    joinedAt: found.entry.joinedAt,
    updatedAt: now.toISOString(),
  };
}

router.get("/status", (req, res) => {
  const found = findActiveEntry(req.user.id);
  if (found) {
    return res.json(buildStatus(found));
  }

  const [latest] = listHistory(req.user.id);
  if (latest && latest.outcome === OUTCOMES.SERVED) {
    return res.json({
      inQueue: false,
      status: "served",
      service: { id: latest.serviceId, name: latest.serviceName },
      servedAt: latest.endedAt,
    });
  }
  return res.json({ inQueue: false });
});

router.post("/join", validate({ serviceId }), (req, res) => {
  const service = findService(req.body.serviceId);
  if (!service) {
    return res.status(404).json({ message: "Service not found." });
  }
  if (!service.isOpen) {
    return res.status(409).json({ message: "That queue is closed right now." });
  }
  if (findActiveEntry(req.user.id)) {
    return res.status(409).json({ message: "You can be in one queue at a time." });
  }

  const joined = joinQueue(req.user.id, service);
  const status = buildStatus(joined);
  recordJoin({
    userId: req.user.id,
    service,
    position: joined.position,
    estimatedWaitMinutes: status.estimatedWaitMinutes,
    joinedAt: joined.entry.joinedAt,
  });
  return res.status(201).json(status);
});

router.post("/leave", (req, res) => {
  const entry = leaveQueue(req.user.id);
  if (!entry) {
    return res.status(404).json({ message: "You are not in a queue." });
  }
  closeEntry(req.user.id, OUTCOMES.LEFT);
  return res.json({ inQueue: false });
});

router.post("/:serviceId/serve", requireRole("admin"), (req, res) => {
  const service = findService(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ message: "Service not found." });
  }
  const served = serveNext(service.id);
  if (!served) {
    return res.status(409).json({ message: "No one is waiting." });
  }
  if (served.userId !== null) {
    closeEntry(served.userId, OUTCOMES.SERVED);
  }
  return res.json({ served });
});

module.exports = router;
