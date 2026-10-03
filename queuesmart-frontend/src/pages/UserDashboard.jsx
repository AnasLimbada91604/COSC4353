import { useNavigate } from "react-router-dom";
import QuickActionButton from "../components/QuickActionButton";
import mockServices from "../data/mockServices";
import { formatWait, getCurrentQueue } from "../data/currentQueue";

const ALMOST_READY_POSITION = 2;

function buildNotifications(current, currentService) {
  const notes = [];
  if (currentService) {
    const joinedTime = new Date(current.joinedAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    notes.push(`You joined the ${currentService.name} queue at ${joinedTime}.`);
    if (current.position <= ALMOST_READY_POSITION) {
      notes.push(
        `You're almost up at ${currentService.name}. Please head to the service desk.`,
      );
    }
  }
  mockServices
    .filter((service) => !service.isOpen)
    .forEach((service) =>
      notes.push(
        `${service.name} is closed right now and not taking new people.`,
      ),
    );
  return notes;
}

function UserDashboard() {
  const navigate = useNavigate();

  const current = getCurrentQueue();
  const currentService =
    current && mockServices.find((service) => service.id === current.serviceId);
  const activeServices = mockServices.filter((service) => service.isOpen);
  const notifications = buildNotifications(current, currentService);

  return (
    <main>
      <h1>User Dashboard</h1>

      <h2>Your Queue Status</h2>
      {currentService ? (
        <>
          <p>
            You are #{current.position} in line for {currentService.name}.
            Estimated wait:{" "}
            {formatWait(current.position * currentService.duration)}.
          </p>
          <QuickActionButton
            label="View live status"
            onClick={() =>
              navigate("/queue-status", {
                state: { serviceId: currentService.id },
              })
            }
          />{" "}
          <QuickActionButton
            label="Leave or change queue"
            onClick={() => navigate("/join")}
          />
        </>
      ) : (
        <>
          <p>You're not in a queue right now.</p>
          <QuickActionButton
            label="Join a queue"
            onClick={() => navigate("/join")}
          />
        </>
      )}

      <h2>Active Services</h2>
      {activeServices.length === 0 ? (
        <p>No services are open right now.</p>
      ) : (
        <ul>
          {activeServices.map((service) => (
            <li key={service.id}>
              <strong>{service.name}</strong>: {service.queueLength} in line,
              about {formatWait((service.queueLength + 1) * service.duration)}{" "}
              wait if you join now
            </li>
          ))}
        </ul>
      )}

      <h2>Notifications</h2>
      {notifications.length === 0 ? (
        <p>No new notifications.</p>
      ) : (
        <ul>
          {notifications.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default UserDashboard;
