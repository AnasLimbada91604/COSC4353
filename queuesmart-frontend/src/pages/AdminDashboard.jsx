import ServiceCard from "../components/ServiceCard";
import mockServices from "../data/mockServices";

function AdminDashboard() {
  return (
    <main>
      <h1>Admin Dashboard</h1>
      {mockServices.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </main>
  );
}

export default AdminDashboard;
