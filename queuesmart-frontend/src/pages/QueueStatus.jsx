import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import QuickActionButton from "../components/QuickActionButton";
import mockServices from "../data/mockServices";

const UPDATE_INTERVAL_MS = 10000;
const ALMOST_READY_POSITION = 2;

const STATUS_LABELS = {
  waiting: "Waiting",
  "almost-ready": "Almost ready",
  served: "Served",
};

const STATUS_MESSAGES = {
  waiting: "Hang tight. We'll let you know when you're close.",
  "almost-ready": "You're almost up. Please make your way to the service desk.",
  served: "Please head to the service desk now.",
};

function getStatus(position) {
  if (position === 0) {
    return "served";
  }
  if (position <= ALMOST_READY_POSITION) {
    return "almost-ready";
  }
  return "waiting";
}

function formatWait(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function QueueStatus() {
  const location = useLocation();
  const serviceId = location.state?.serviceId;
  const service = mockServices.find((item) => item.id === serviceId) ?? mockServices[0];
  // Joining puts the user at the back of the line.
  const startPosition = service.queueLength + 1;

  const [position, setPosition] = useState(startPosition);
  const [hasLeft, setHasLeft] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  // Mock live updates: move up one spot each interval until served.
  useEffect(() => {
    if (hasLeft || position === 0) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setPosition((current) => current - 1);
      setLastUpdated(new Date());
    }, UPDATE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [position, hasLeft]);

  function leaveQueue() {
    setHasLeft(true);
    setConfirmingLeave(false);
  }

  function rejoinQueue() {
    setPosition(startPosition);
    setHasLeft(false);
    setLastUpdated(new Date());
  }

  if (hasLeft) {
    return (
      <main>
        <h1>Queue Status</h1>
        <h2>{service.name}</h2>
        <p>You have left the queue.</p>
        <QuickActionButton label="Rejoin queue" onClick={rejoinQueue} />
      </main>
    );
  }

  const status = getStatus(position);

  return (
    <main>
      <h1>Queue Status</h1>
      <h2>{service.name}</h2>
      <p>{service.description}</p>
      <div aria-live="polite">
        <p>{status === "served" ? "It's your turn!" : `You are #${position} in line`}</p>
        <p>Estimated wait: {formatWait(position * service.duration)}</p>
        <p>Status: {STATUS_LABELS[status]}</p>
        <p>{STATUS_MESSAGES[status]}</p>
      </div>
      <p>Last updated: {lastUpdated.toLocaleTimeString()}</p>
      {status !== "served" &&
        (confirmingLeave ? (
          <>
            <p>Leave the queue? You will lose your spot.</p>
            <QuickActionButton label="Yes, leave queue" onClick={leaveQueue} />{" "}
            <QuickActionButton label="Stay in queue" onClick={() => setConfirmingLeave(false)} />
          </>
        ) : (
          <QuickActionButton label="Leave queue" onClick={() => setConfirmingLeave(true)} />
        ))}
    </main>
  );
}

export default QueueStatus;
