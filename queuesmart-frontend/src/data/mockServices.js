const mockServices = [
  {
    id: 1,
    name: "Academic Advising",
    description: "Course planning and degree questions",
    duration: 15,
    priority: "Normal",
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
    priority: "Normal",
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

export default mockServices;
