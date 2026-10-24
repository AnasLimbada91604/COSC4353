import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import QuickActionButton from "../components/QuickActionButton";
import { api } from "../api";
import { formatWait, servicesFrom } from "../queueDisplay";

function JoinQueue() {
  const navigate = useNavigate();
  const location = useLocation();

  const [services, setServices] = useState([]);
  const [status, setStatus] = useState(null); // GET /queue/status
  const [selectedId, setSelectedId] = useState(null);
  const [estimate, setEstimate] = useState(null); // GET /queue/:id/estimate
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [busy, setBusy] = useState(false);

  const openServices = services.filter((service) => service.isOpen);
  const closedServices = services.filter((service) => !service.isOpen);
  const selected = openServices.find((service) => service.id === selectedId);

  const loadPage = useCallback(async () => {
    try {
      const [servicesData, statusData] = await Promise.all([
        api("/services"),
        api("/queue/status"),
      ]);
      const list = servicesFrom(servicesData);
      setServices(list);
      setStatus(statusData);
      setError("");

      const open = list.filter((service) => service.isOpen);
      const preferred = [
        location.state?.serviceId,
        statusData.service?.id,
      ].find((id) => open.some((service) => service.id === id));
      setSelectedId((current) => current ?? preferred ?? open[0]?.id ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [location.state]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Fetch the wait estimate whenever a different service is picked.
  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    setEstimate(null);
    api(`/queue/${selectedId}/estimate`)
      .then((data) => !cancelled && setEstimate(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleJoin() {
    setBusy(true);
    setNotice("");
    try {
      const joined = await api("/queue/join", {
        method: "POST",
        body: { serviceId: selectedId },
      });
      setStatus(joined);
      setNotice(
        joined.notifications?.[0]?.message ??
          `You joined ${joined.service.name}.`,
      );
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    try {
      const leftName = status.service.name;
      await api("/queue/leave", { method: "POST" });
      setStatus({ inQueue: false });
      setConfirmingLeave(false);
      setNotice(`You left the ${leftName} queue.`);
      setError("");
      // The line just got shorter, so refresh the estimate.
      if (selectedId != null)
        setEstimate(await api(`/queue/${selectedId}/estimate`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main>
        <h1>Join Queue</h1>
        <p>Loading services...</p>
      </main>
    );
  }

  const inQueue = Boolean(status?.inQueue);

  return (
    <main>
      <h1>Join Queue</h1>

      {error && (
        <p role="alert">
          {error}{" "}
          {/token|sign in|log in|unauthorized/i.test(error) && (
            <Link to="/login">Log in</Link>
          )}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}

      {inQueue && (
        <section>
          <h2>Your queue</h2>
          <p>
            You are #{status.position} in line for {status.service.name}.
            Estimated wait: {formatWait(status.estimatedWaitMinutes)}.
          </p>
          {confirmingLeave ? (
            <>
              <p>Leave the queue? You will lose your spot.</p>
              <QuickActionButton
                label="Yes, leave queue"
                onClick={handleLeave}
                disabled={busy}
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
                onClick={() => navigate("/queue-status")}
              />
            </>
          )}
        </section>
      )}

      <h2>Choose a service</h2>
      {!selected ? (
        <p>No services are open right now. Check back later.</p>
      ) : (
        <>
          <label htmlFor="join-service">Service</label>
          <select
            id="join-service"
            value={selectedId}
            onChange={(event) => setSelectedId(Number(event.target.value))}
          >
            {openServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>

          <h3>{selected.name}</h3>
          <p>{selected.description}</p>
          {estimate && estimate.serviceId === selected.id ? (
            <>
              <p>People in line: {estimate.peopleInLine}</p>
              <p>Average time per person: {estimate.minutesPerPerson} min</p>
              <p>
                Estimated wait if you join now:{" "}
                {formatWait(estimate.estimatedWaitMinutes)}
              </p>
            </>
          ) : (
            <p>Checking the wait time...</p>
          )}

          {!inQueue && (
            <QuickActionButton
              label="Join queue"
              onClick={handleJoin}
              disabled={busy}
            />
          )}
          {inQueue && status.service.id === selected.id && (
            <p>You're already in this queue.</p>
          )}
          {inQueue && status.service.id !== selected.id && (
            <p>
              You can be in one queue at a time. Leave {status.service.name} to
              join this one.
            </p>
          )}
        </>
      )}

      {closedServices.length > 0 && (
        <p>
          Closed right now:{" "}
          {closedServices.map((service) => service.name).join(", ")}
        </p>
      )}
    </main>
  );
}

export default JoinQueue;
