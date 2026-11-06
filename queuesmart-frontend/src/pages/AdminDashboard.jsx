import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ServiceCard from "../components/ServiceCard";
import { api } from "../api";

function AdminDashboard() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    api("/services")
      .then((data) => {
        if (!active) return;
        setServices(data.services);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) {
          navigate("/login");
          return;
        }
        if (err.status === 403) {
          setError("Only admins can view the dashboard. Log in with an admin account.");
          return;
        }
        setError(err.message || "Can't reach the server. Try again in a moment.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  async function toggleQueue(serviceId) {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return;

    try {
      const data = await api(`/services/${serviceId}`, {
        method: "PATCH",
        body: { isOpen: !service.isOpen },
      });
      setServices((current) =>
        current.map((item) => (item.id === serviceId ? data.service : item))
      );
      setError("");
    } catch (err) {
      if (err.status === 401) {
        navigate("/login");
        return;
      }
      setError(err.message || "Can't reach the server. Try again in a moment.");
    }
  }

  if (loading) {
    return (
      <main>
        <h1>Admin Dashboard</h1>
        <p>Loading services...</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Admin Dashboard</h1>
      {error && <p role="alert">{error}</p>}
      {!error && services.length === 0 && <p>No services yet.</p>}
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} onToggleQueue={toggleQueue} />
      ))}
    </main>
  );
}

export default AdminDashboard;
