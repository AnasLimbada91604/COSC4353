const express = require("express");
const { validate } = require("../middleware/validate");
const { authenticate, requireRole } = require("../middleware/authenticate");
const { isOpen, serviceName, servicePriority,
  serviceDuration, serviceDescription, priorityOptions, maxDuration} = require("../validation/rules");
const { listServices, updateQueueStatus, createService, updateService} = require("../store/services");

const validateService = validate({ name: serviceName, description: serviceDescription, duration: serviceDuration, priority: servicePriority });

function serviceFieldErrors(body) {
  const errors = [];
  if (!Number.isInteger(body.duration) || body.duration < 1 || body.duration > maxDuration) {
    errors.push({ field: "duration", message: `Duration must be a whole number from 1 to ${maxDuration}.` });
  }
  if (!priorityOptions.includes(body.priority)) {
    errors.push({ field: "priority", message: `Priority must be one of: ${priorityOptions.join(", ")}.` });
  }
  return errors;
}

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

router.post("/", validateService, (req, res) => {
  const errors = serviceFieldErrors(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  const service = createService(
      {name: req.body.name, description: req.body.description, duration: req.body.duration, priority: req.body.priority});
  return res.status(201).json({ service });
});

router.put("/:id", validateService, (req, res) => {
  const errors = serviceFieldErrors(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  const service = updateService(req.params.id, {name: req.body.name, description: req.body.description, duration: req.body.duration, priority: req.body.priority});
  if (!service) {
    return res.status(404).json({ message: "Service not found." });
  }
  return res.status(200).json({ service });
});

module.exports = router;
