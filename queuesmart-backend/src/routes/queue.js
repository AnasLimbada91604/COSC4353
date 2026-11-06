const express = require("express");
const { withTransaction } = require("../db");
const { validate } = require("../middleware/validate");
const { authenticate, requireRole } = require("../middleware/authenticate");
const { serviceId, moveDirection, entryPriority, moveDirections, priorityOptions } = require("../validation/rules");
const { findService, listServices } = require("../store/services");
const {ENTRY_STATUS, findActiveEntry, findLatestEntry, joinQueue, leaveQueue, serveNext, getQueue, removeEntry, moveEntry, setEntryPriority,} = require("../store/queues");
const {
  estimateWaitMinutes,
  estimateServeAt,
  getQueueStatus,
} = require("../logic/waitTime");
const { findById } = require("../store/users");
const { notifyJoined, notifyAlmostServed } = require("../logic/notifications");

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

// admin view needed for qm screen
function adminQueueView(service) {
  const queue = getQueue(service.id).map((entry, index) => {
    const user = entry.userId === null ? null : findById(entry.userId);
    return {
      id: entry.id,
      name: user ? user.email : `Walk-in #${entry.id}`,
      priority: entry.priority,
      joinedAt: entry.joinedAt,
      position: index + 1,
    };
  });
  return {
    service: { id: service.id, name: service.name, duration: service.duration },
    queue,
  };
}

router.get("/status", (req, res) => {
  const found = findActiveEntry(req.user.id);
  if (found) {
    return res.json(buildStatus(found));
  }

  const latest = findLatestEntry(req.user.id);
  if (latest && latest.status === ENTRY_STATUS.SERVED) {
    const service = findService(latest.serviceId);
    return res.json({
      inQueue: false,
      status: "served",
      service: { id: service.id, name: service.name },
      servedAt: latest.endedAt,
    });
  }
  return res.json({ inQueue: false });
});

// What a signed-in user can join. /api/services stays admin-only.
router.get("/services", (req, res) => {
  res.json({ services: listServices() });
});

// admin: everyone waiting for one service, in served order

router.get("/:serviceId/estimate", (req, res) => {
  const service = findService(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ message: "Service not found." });
  }
  const peopleInLine = getQueue(service.id).length;
  return res.json({
    serviceId: service.id,
    isOpen: service.isOpen,
    peopleInLine,
    minutesPerPerson: service.duration,
    estimatedWaitMinutes: estimateWaitMinutes(
      peopleInLine + 1,
      service.duration,
    ),
  });
});

router.get("/:serviceId", requireRole("admin"), (req, res) => {
  const service = findService(req.params.serviceId);
  if (!service) {
    return res.status(404).json({ message: "Service not found." });
  }
  return res.json(adminQueueView(service));
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

  // Saved together, so a failed notification can't leave a half-finished join behind.
  const { status, notifications } = withTransaction(() => {
    const entry = joinQueue(req.user.id, service);
    const entryStatus = buildStatus(entry);
    return {
      status: entryStatus,
      notifications: [
        notifyJoined({
          userId: req.user.id,
          entryId: entry.entry.id,
          service,
          position: entry.position,
          estimatedWaitMinutes: entryStatus.estimatedWaitMinutes,
        }),
        ...notifyAlmostServed(service),
      ].filter((notification) => notification.userId === req.user.id),
    };
  });
  return res.status(201).json({ ...status, notifications });
});

router.post("/leave", (req, res) => {
  const entry = withTransaction(() => {
    const left = leaveQueue(req.user.id);
    if (left) {
      notifyAlmostServed(findService(left.serviceId));
    }
    return left;
  });
  if (!entry) {
    return res.status(404).json({ message: "You are not in a queue." });
  }
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
  notifyAlmostServed(service);
  return res.json({ served });
});
// for qm screen, take someone out of line (recorded as a no-show for real users)
router.delete("/:serviceId/entries/:entryId", requireRole("admin"), (req, res) => {
    const service = findService(req.params.serviceId);
    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }
    const removed = removeEntry(service.id, req.params.entryId);
    if (!removed) {
      return res.status(404).json({ message: "That person is not in this queue." });
    }
    notifyAlmostServed(service);
    return res.json(adminQueueView(service));
  });
// for qm screen, move someone up or down one spot
router.patch(
  "/:serviceId/entries/:entryId/move",
  requireRole("admin"),
  validate({ direction: moveDirection }),
  (req, res) => {
    if (!moveDirections.includes(req.body.direction)) {
      return res.status(400).json({
        errors: [{ field: "direction", message: `Direction must be one of: ${moveDirections.join(", ")}.` }],
      });
    }
    const service = findService(req.params.serviceId);
    if (!service) {
      return res.status(404).json({ message: "Service not found." });
    }
    const result = moveEntry(service.id, req.params.entryId, req.body.direction);
    if (result.error === "not-found") {
      return res.status(404).json({ message: "That person is not in this queue." });
    }
    if (result.error === "at-end") {
      return res.status(409).json({ message: `Can't move ${req.body.direction} any further.` });
    }
    notifyAlmostServed(service);
    return res.json(adminQueueView(service));
  }
);

// for qm screen, change someone's priority; they're re-placed in line to match
router.patch(
    "/:serviceId/entries/:entryId/priority",
    requireRole("admin"),
    validate({ priority: entryPriority }),
    (req, res) => {
      if (!priorityOptions.includes(req.body.priority)) {
        return res.status(400).json({
          errors: [{ field: "priority", message: `Priority must be one of: ${priorityOptions.join(", ")}.` }],
        });
      }
      const service = findService(req.params.serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found." });
      }
      const updated = setEntryPriority(service.id, req.params.entryId, req.body.priority);
      if (!updated) {
        return res.status(404).json({ message: "That person is not in this queue." });
      }
      notifyAlmostServed(service);
      return res.json(adminQueueView(service));
    }
);

module.exports = router;
