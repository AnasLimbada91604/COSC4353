function fieldLabel(field, rule) {
  if (rule.label) return rule.label;
  const spaced = field
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

function validate(rules) {
  return function validateRequest(req, res, next) {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
    const errors = [];
    const cleaned = {};

    for (const [field, rule] of Object.entries(rules)) {
      let value = body[field];
      if (rule.trim && typeof value === "string") {
        value = value.trim();
      }

      const label = fieldLabel(field, rule);
      if (isMissing(value)) {
        if (rule.required) {
          errors.push({ field, message: `${label} is required.` });
        }
        continue;
      }

      if (rule.type && typeof value !== rule.type) {
        errors.push({ field, message: `${label} must be a ${rule.type}.` });
        continue;
      }

      if (typeof value === "string" && rule.minLength != null && value.length < rule.minLength) {
        errors.push({
          field,
          message: `${label} must be at least ${rule.minLength} characters.`,
        });
        continue;
      }

      if (typeof value === "string" && rule.maxLength != null && value.length > rule.maxLength) {
        errors.push({
          field,
          message: `${label} must be at most ${rule.maxLength} characters.`,
        });
        continue;
      }

      cleaned[field] = value;
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    req.body = { ...body, ...cleaned };
    next();
  };
}

module.exports = { validate };
