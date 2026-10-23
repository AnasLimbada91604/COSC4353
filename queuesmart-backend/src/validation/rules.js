const email = {
  required: true,
  type: "string",
  trim: true,
  minLength: 5,
  maxLength: 254,
  label: "Email",
};

const password = {
  required: true,
  type: "string",
  minLength: 8,
  maxLength: 72,
  label: "Password",
};

const role = {
  required: true,
  type: "string",
  trim: true,
  minLength: 4,
  maxLength: 5,
  label: "Role",
};

const isOpen = {
  required: true,
  type: "boolean",
  label: "Queue status",
};

const serviceName = {
  required: true,
  type: "string",
  trim: true,
  maxLength: 100,
  label: "Service name",
};

const serviceDescription = {
  required: true,
  type: "string",
  trim: true,
  maxLength: 500,
  label: "Service description",
};

const serviceDuration = {
  required: true,
  type: "number",
  label: "Service duration",
};

const servicePriority = {
  required: true,
  type: "string",
  trim: true,
  label: "Service priority",
};

const priorityOptions = ["Low", "Medium", "High"];
const maxDuration = 480;

const serviceId = {
    required: true,
    type: "number",
    label: "Service",
};

module.exports = { email, password, role, isOpen, serviceId, serviceName, serviceDescription, serviceDuration, servicePriority, priorityOptions, maxDuration};
