const MIN_PHONE_LENGTH = 7;
const MAX_PHONE_LENGTH = 20;
const PHONE_PATTERN = /^[0-9+().\s-]+$/;
const PREFERENCE_CHANNELS = ["email", "sms"];

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

function phoneError(value) {
  if (typeof value !== "string") return "Contact phone must be a string.";
  if (value.length < MIN_PHONE_LENGTH) {
    return `Contact phone must be at least ${MIN_PHONE_LENGTH} characters.`;
  }
  if (value.length > MAX_PHONE_LENGTH) {
    return `Contact phone must be at most ${MAX_PHONE_LENGTH} characters.`;
  }
  if (!PHONE_PATTERN.test(value)) {
    return "Contact phone can only contain digits, spaces and + ( ) . -";
  }
  return null;
}

function preferencesError(value) {
  const isValid =
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === PREFERENCE_CHANNELS.length &&
    PREFERENCE_CHANNELS.every((channel) => typeof value[channel] === "boolean");
  return isValid ? null : "Notification preferences must set email and sms to true or false.";
}

// Runs after validate(), which has already made sure req.body is an object.
function validateProfileFields(req, res, next) {
  const errors = [];

  let phone = req.body.contactPhone;
  if (typeof phone === "string") {
    phone = phone.trim();
    req.body.contactPhone = phone;
  }
  if (!isMissing(phone)) {
    const message = phoneError(phone);
    if (message) errors.push({ field: "contactPhone", message });
  }

  const preferences = req.body.notificationPreferences;
  if (isMissing(preferences)) {
    errors.push({ field: "notificationPreferences", message: "Notification preferences are required." });
  } else {
    const message = preferencesError(preferences);
    if (message) errors.push({ field: "notificationPreferences", message });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}

module.exports = { validateProfileFields };
