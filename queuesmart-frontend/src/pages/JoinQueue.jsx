import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import QuickActionButton from "../components/QuickActionButton";
import mockServices from "../data/mockServices";
import { api } from "../api";
import { formatWait } from "../data/currentQueue";

function toCurrent(status) {
  return {
    serviceId: status.service.id,
    position: status.position,
    joinedAt: status.joinedAt,
  };
}

function JoinQueue() {
  const navigate = useNavigate();
  const location = useLocation();

  const openServices = mockServices.filter((service) => service.isOpen);
  const closedServices = mockServices.filter((service) => !service.isOpen);

  const [current, setCurrent] = useState(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [notice, setNotice] = useState("");

  const startId =
    [location.state?.serviceId, current?.serviceId].find((id) =>
      openServices.some((service) => service.id === id),
    ) ?? openServices[0]?.id;
  const [selectedId, setSelectedId] = useState(startId);

  const service = openServices.find((item) => item.id === selectedId);
  const currentService =
    current && mockServices.find((item) => item.id === current.serviceId);

  useEffect(() => {
    api("/queue/status")
      .then((status) => setCurrent(status.inQueue ? toCurrent(status) : null))
      .catch(() => setCurrent(null));
  }, []);

  async function handleJoin() {
    try {
      const status = await api("/queue/join", {
        method: "POST",
        body: { serviceId: service.id },
      });
      setCurrent(toCurrent(status));
      setNotice(`You joined ${service.name}. You are #${status.position} in line.`);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function handleLeave() {
    try {
      await api("/queue/leave", { method: "POST" });
      setCurrent(null);
      setNotice(`You left the ${currentService.name} queue.`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setConfirmingLeave(false);
    }
  }

  return (
    <main>
      <h1>Join Queue</h1>

      {notice && <p role="status">{notice}</p>}

      {currentService && (
        <section>
          <h2>Your queue</h2>
          <p>
            You are #{current.position} in line for {currentService.name}.
            Estimated wait:{" "}
            {formatWait(current.position * currentService.duration)}.
          </p>
          {confirmingLeave ? (
            <>
              <p>Leave the queue? You will lose your spot.</p>
              <QuickActionButton
                label="Yes, leave queue"
                onClick={handleLeave}
              />{" "}
              <QuickActionButton
                label="Stay in queue"
                onClick={() => setConfirmingLeave(false)}
              />
            </>
          ) : (
            <>
              <QuickActionButton
                label="Leave queue"
                onClick={() => setConfirmingLeave(true)}
              />{" "}
              <QuickActionButton
                label="View live status"
                onClick={() =>
                  navigate("/queue-status", {
                    state: { serviceId: currentService.id },
                  })
                }
              />
            </>
          )}
        </section>
      )}

      <h2>Choose A Service</h2>
      {!service ? (
        <p>No services are open right now. Check back later.</p>
      ) : (
        <>
          <label htmlFor="join-service">Service</label>
          <select
            id="join-service"
            value={selectedId}
            onChange={(event) => setSelectedId(Number(event.target.value))}
          >
            {openServices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <h3>{service.name}</h3>
          <p>{service.description}</p>
          <p>People in line: {service.queueLength}</p>
          <p>Average time per person: {service.duration} min</p>
          <p>
            Estimated wait if you join now:{" "}
            {formatWait((service.queueLength + 1) * service.duration)}
          </p>

          {!current && (
            <QuickActionButton label="Join queue" onClick={handleJoin} />
          )}
          {current && current.serviceId === service.id && (
            <p>You're already in this queue.</p>
          )}
          {current && current.serviceId !== service.id && (
            <p>
              You can be in one queue at a time. Leave {currentService.name} to
              join this one.
            </p>
          )}
        </>
      )}

      {closedServices.length > 0 && (
        <p>
          Closed right now: {closedServices.map((item) => item.name).join(", ")}
        </p>
      )}
    </main>
  );
}

export default JoinQueue;
