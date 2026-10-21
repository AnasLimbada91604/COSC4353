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

module.exports = { email, password, role, isOpen };
