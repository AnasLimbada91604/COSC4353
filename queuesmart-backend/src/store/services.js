const initialServices = [
  {
    id: 1,
    name: "Academic Advising",
    description: "Course planning and degree questions",
    duration: 15,
    priority: "Medium",
    queueLength: 4,
    isOpen: true,
  },
  {
    id: 2,
    name: "Financial Aid",
    description: "Aid status and document questions",
    duration: 20,
    priority: "High",
    queueLength: 7,
    isOpen: true,
  },
  {
    id: 3,
    name: "Registrar",
    description: "Enrollment, transcripts, and records",
    duration: 10,
    priority: "Medium",
    queueLength: 2,
    isOpen: false,
  },
  {
    id: 4,
    name: "Student Accounts",
    description: "Billing and payment questions",
    duration: 15,
    priority: "Low",
    queueLength: 5,
    isOpen: true,
  },
];

let services = cloneSeed();

function cloneSeed() {
  return initialServices.map((service) => ({ ...service }));
}

function resetServices() {
  services = cloneSeed();
}

function listServices() {
  return services.map((service) => ({ ...service }));
}

function findService(id) {
  const service = services.find((item) => item.id === Number(id));
  return service ? { ...service } : null;
}

function updateQueueStatus(id, isOpen) {
  const service = services.find((item) => item.id === Number(id));
  if (!service) return null;
  service.isOpen = isOpen;
  return { ...service };
}

module.exports = { resetServices, listServices, findService, updateQueueStatus };
