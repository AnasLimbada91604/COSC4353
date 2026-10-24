import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import QuickActionButton from "../components/QuickActionButton";
import { api } from "../api";
import { formatWait, servicesFrom } from "../queueDisplay";

const NOTIFICATIONS_SHOWN = 5;

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function UserDashboard() {
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [services, setServices] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [statusData, servicesData, notificationData] = await Promise.all([
          api("/queue/status"),
          api("/services"),
          api("/notifications"),
        ]);
        const open = servicesFrom(servicesData).filter(
          (service) => service.isOpen,
        );
        const estimates = await Promise.all(
          open.map((service) => api(`/queue/${service.id}/estimate`)),
        );

        setStatus(statusData);
        setServices(
          open.map((service, index) => ({
            ...service,
            estimate: estimates[index],
          })),
        );
        setNotifications(notificationData.notifications);
        setError("");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <main>
        <h1>User Dashboard</h1>
        <p>Loading your dashboard...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <h1>User Dashboard</h1>
        <p role="alert">
          {error}{" "}
          {/token|sign in|log in|unauthorized/i.test(error) && (
            <Link to="/login">Log in</Link>
          )}
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>User Dashboard</h1>

      <h2>Your queue status</h2>
      {status.inQueue ? (
        <>
          <p>
            You are #{status.position} in line for {status.service.name}.
            Estimated wait: {formatWait(status.estimatedWaitMinutes)}.
          </p>
          <QuickActionButton
            label="View live status"
            onClick={() => navigate("/queue-status")}
          />{" "}
          <QuickActionButton
            label="Leave or change queue"
            onClick={() => navigate("/join")}
          />
        </>
      ) : (
        <>
          <p>
            {status.status === "served"
              ? `You were served at ${status.service.name}. You're not in a queue right now.`
              : "You're not in a queue right now."}
          </p>
          <QuickActionButton
            label="Join a queue"
            onClick={() => navigate("/join")}
          />
        </>
      )}

      <h2>Active services</h2>
      {services.length === 0 ? (
        <p>No services are open right now.</p>
      ) : (
        <ul>
          {services.map((service) => (
            <li key={service.id}>
              <strong>{service.name}</strong>: {service.estimate.peopleInLine}{" "}
              in line, about {formatWait(service.estimate.estimatedWaitMinutes)}{" "}
              wait if you join now
            </li>
          ))}
        </ul>
      )}

      <h2>Notifications</h2>
      {notifications.length === 0 ? (
        <p>
          No notifications yet. You'll get one when you join a queue and when
          you're almost up.
        </p>
      ) : (
        <ul>
          {notifications.slice(0, NOTIFICATIONS_SHOWN).map((notification) => (
            <li key={notification.id}>
              {notification.message} ({formatTime(notification.createdAt)})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default UserDashboard;
