import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QuickActionButton from "../components/QuickActionButton";
import { api } from "../api";
import { formatWait } from "../data/currentQueue";

const UPDATE_INTERVAL_MS = 10000;

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

function QueueStatus() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState("");
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setQueue(await api("/queue/status"));
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      if (err.status === 401) {
        navigate("/login");
      } else {
        setError("Can't reach the server. Showing the last update.");
      }
    }
  }, [navigate]);

  // Poll the API every interval instead of the old mock countdown.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, UPDATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function leaveQueue() {
    setConfirmingLeave(false);
    try {
      await api("/queue/leave", { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!queue) {
    return (
      <main>
        <h1>Queue Status</h1>
        <p>{error || "Loading..."}</p>
      </main>
    );
  }

  if (!queue.inQueue) {
    return (
      <main>
        <h1>Queue Status</h1>
        {queue.status === "served" ? (
          <>
            <h2>{queue.service.name}</h2>
            <p>It's your turn!</p>
            <p>{STATUS_MESSAGES.served}</p>
          </>
        ) : (
          <p>You're not in a queue right now.</p>
        )}
        <QuickActionButton label="Join a queue" onClick={() => navigate("/join")} />
      </main>
    );
  }

  return (
    <main>
      <h1>Queue Status</h1>
      <h2>{queue.service.name}</h2>
      <p>{queue.service.description}</p>
      <div aria-live="polite">
        <p>You are #{queue.position} in line</p>
        <p>Estimated wait: {formatWait(queue.estimatedWaitMinutes)}</p>
        <p>Status: {STATUS_LABELS[queue.status]}</p>
        <p>{STATUS_MESSAGES[queue.status]}</p>
      </div>
      <p>Last updated: {lastUpdated.toLocaleTimeString()}</p>
      {error && <p role="alert">{error}</p>}
      {confirmingLeave ? (
        <>
          <p>Leave the queue? You will lose your spot.</p>
          <QuickActionButton label="Yes, leave queue" onClick={leaveQueue} />{" "}
          <QuickActionButton label="Stay in queue" onClick={() => setConfirmingLeave(false)} />
        </>
      ) : (
        <QuickActionButton label="Leave queue" onClick={() => setConfirmingLeave(true)} />
      )}
    </main>
  );
}

export default QueueStatus;
