import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { priorityOptions } from "../data/priorities";
import "./QueueManagement.css";

function formatJoinedAt(isoString) {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// queue logic lives in the backend; this screen only calls the API

function QueueManagement() {
    const navigate = useNavigate();
    const [services, setServices] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState(null);
    const [serviceInfo, setServiceInfo] = useState(null);
    const [queue, setQueue] = useState([]);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [isBusy, setIsBusy] = useState(false);

    // double-check with the admin
    const [confirmingId, setConfirmingId] = useState(null);
    const [pendingMove, setPendingMove] = useState(null);

    // not logged in -> login page or logged in but not admin -> message (cause it was weird to be open to everyone)
    const handleError = useCallback((err) => {
        if (err.status === 401) {
            navigate("/login");
        } else if (err.status === 403) {
            setError("Only admins can manage queues. Log in with an admin account.");
        } else {
            setError(err.message || "Can't reach the server. Try again in a moment.");
        }
    }, [navigate]);

    // load the service list once, then select the first service
    useEffect(() => {
        api("/services")
            .then((data) => {
                setServices(data.services);
                if (data.services.length > 0) setSelectedServiceId(data.services[0].id);
            })
            .catch(handleError);
    }, [handleError]);

    // fetch the selected service's line from the backend
    const loadQueue = useCallback(async () => {
        if (selectedServiceId === null) return;
        try {
            const data = await api(`/queue/${selectedServiceId}`);
            setServiceInfo(data.service);
            setQueue(data.queue);
            setError("");
        } catch (err) {
            handleError(err);
        }
    }, [selectedServiceId, handleError]);

    // reload whenever a different service is picked
    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    // only one prompt open at a time
    function clearPrompts() {
        setConfirmingId(null);
        setPendingMove(null);
    }

    // run a request that returns the updated line, then show it and a notice
    async function runAction(request, successNotice) {
        setIsBusy(true);
        clearPrompts();
        try {
            const data = await request();
            setQueue(data.queue);
            setNotice(successNotice);
            setError("");
        } catch (err) {
            handleError(err);
        } finally {
            setIsBusy(false);
        }
    }

    // serve returns only who was served, so reload the line afterward
    async function serveNext() {
        if (queue.length === 0) return;
        const next = queue[0];
        setIsBusy(true);
        clearPrompts();
        try {
            await api(`/queue/${selectedServiceId}/serve`, { method: "POST" });
            setNotice(`Now serving ${next.name}.`);
            await loadQueue();
        } catch (err) {
            handleError(err);
        } finally {
            setIsBusy(false);
        }
    }

    function startRemove(entry) {
        setPendingMove(null);
        setConfirmingId(entry.id);
    }

    function removeEntry(entry) {
        runAction(
            () => api(`/queue/${selectedServiceId}/entries/${entry.id}`, { method: "DELETE" }),
            `${entry.name} was removed from the queue.`
        );
    }

    // send the move; the backend swaps them and applies the neighbor's priority if it differs
    function sendMove(entry, direction, newPriority) {
        const word = direction === -1 ? "up" : "down";
        runAction(
            () => api(`/queue/${selectedServiceId}/entries/${entry.id}/move`, {
                method: "PATCH",
                body: { direction: word },
            }),
            newPriority === entry.priority
                ? `${entry.name} moved ${word}.`
                : `${entry.name} moved ${word} and is now ${newPriority} priority.`
        );
    }

    // same-priority neighbor: move right away, else ask first since it changes priority
    function moveEntry(index, direction) {           // direction: -1 = up, +1 = down
        const target = index + direction;
        if (target < 0 || target >= queue.length) return;   // can't move past the ends
        const entry = queue[index];
        const neighbor = queue[target];
        clearPrompts();

        if (neighbor.priority !== entry.priority) {
            setPendingMove({ entryId: entry.id, direction, newPriority: neighbor.priority });
            return;
        }
        sendMove(entry, direction, entry.priority);
    }

    function confirmMove() {
        if (!pendingMove) return;
        const entry = queue.find((item) => item.id === pendingMove.entryId);
        if (!entry) return clearPrompts();
        sendMove(entry, pendingMove.direction, pendingMove.newPriority);
    }

    // the backend re-places them in line to match the new priority
    function updatePriority(entry, newPriority) {
        if (newPriority === entry.priority) return;
        runAction(
            () => api(`/queue/${selectedServiceId}/entries/${entry.id}/priority`, {
                method: "PATCH",
                body: { priority: newPriority },
            }),
            `${entry.name} priority changed to ${newPriority}.`
        );
    }

    return (
        <main>
            <h1>Queue Management</h1>
            {error && <p role="alert">{error}</p>}

            <label htmlFor="queue-service">Service</label>
            <select
                id="queue-service"
                value={selectedServiceId ?? ""}
                onChange={(event) => {
                    setSelectedServiceId(Number(event.target.value));
                    setNotice("");
                    clearPrompts();
                }}
            >
                {services.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>

            {serviceInfo && (
                <>
                    <h2>{serviceInfo.name}: {queue.length} in line</h2>
                    <p>Estimated wait for the last person: {Math.max(0, (queue.length - 1) * serviceInfo.duration)} min</p>
                </>
            )}

            {queue.length === 0 && <p>No one is waiting.</p>}
            {notice && <p role="status">{notice}</p>}
            <button type="button" onClick={serveNext} disabled={queue.length === 0 || isBusy}>
                Serve next
            </button>

            <ol className="queueList">
                {queue.map((entry, index) => {
                    const isPendingMove = pendingMove?.entryId === entry.id;
                    return (
                        <li key={entry.id} className="queueEntry">
                            <div className="queueEntryName">
                                {entry.name}
                                <span className="queueEntryMeta">joined {formatJoinedAt(entry.joinedAt)}</span>
                            </div>

                            <div className="queueControls">
                                <select
                                    aria-label={`Priority for ${entry.name}`}
                                    value={entry.priority}
                                    disabled={isBusy}
                                    onChange={(event) => updatePriority(entry, event.target.value)}
                                >
                                    {priorityOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                                <button type="button" onClick={() => moveEntry(index, -1)} disabled={index === 0 || isBusy}>Move up</button>
                                <button type="button" onClick={() => moveEntry(index, 1)} disabled={index === queue.length - 1 || isBusy}>Move down</button>
                                {confirmingId === entry.id ? (
                                    <>
                                        <button type="button" onClick={() => removeEntry(entry)} disabled={isBusy}>Yes, remove</button>
                                        <button type="button" onClick={() => setConfirmingId(null)}>Cancel</button>
                                    </>
                                ) : (
                                    <button type="button" onClick={() => startRemove(entry)} disabled={isBusy}>Remove</button>
                                )}
                            </div>

                            {isPendingMove && (
                                <div className="queueControls queuePrompt" role="alert">
                                    <span>
                                        Moving {entry.name} {pendingMove.direction === -1 ? "up" : "down"} changes
                                        their priority from {entry.priority} to {pendingMove.newPriority}.
                                    </span>
                                    <button type="button" onClick={confirmMove} disabled={isBusy}>Move and change priority</button>
                                    <button type="button" onClick={() => setPendingMove(null)}>Cancel</button>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
        </main>
    );
}

export default QueueManagement;