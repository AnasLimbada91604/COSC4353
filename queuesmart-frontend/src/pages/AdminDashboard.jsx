import { useState } from "react";
import ServiceCard from "../components/ServiceCard";
import mockServices from "../data/mockServices";

function AdminDashboard() {
  const [services, setServices] = useState(mockServices);

  function toggleQueue(serviceId) {
    setServices((current) =>
      current.map((service) =>
        service.id === serviceId ? { ...service, isOpen: !service.isOpen } : service
      )
    );
  }

  return (
    <main>
      <h1>Admin Dashboard</h1>
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} onToggleQueue={toggleQueue} />
      ))}
    </main>
  );
}

export default AdminDashboard;
