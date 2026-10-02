import { useState } from "react";
import mockServices from "../data/mockServices";
import mockQueue from "../data/mockQueue";

function QueueManagement() {
    // define the queues for the queue managment
    const [queues, setQueues] = useState(mockQueue);
    const [selectedServiceId, setSelectedServiceId] = useState(mockServices[0].id);

    // set the service and current queue
    const service = mockServices.find((item) => item.id === selectedServiceId);
    const currentQueue = queues[selectedServiceId] ?? [];

    // double-check with the user to remove and tell when removed
    const [confirmingId, setConfirmingId] = useState(null);   // whose Remove is being confirmed
    const [notice, setNotice] = useState("");

    // always renders the current queue
    function updateCurrentQueue(nextLine) {
        setQueues((current) => ({ ...current, [selectedServiceId]: nextLine }));
    }

    // cut the person served out of the queue, notify, update the queue (only if queue is not empty)
    function serveNext() {
        if (currentQueue.length === 0) return;
        const [served, ...rest] = currentQueue;
        updateCurrentQueue(rest);
        setNotice(`Now serving ${served.name}.`);
    }

    // cut the person out of the queue, notify, update the queue
    function removeEntry(entry) {
        updateCurrentQueue(currentQueue.filter((item) => item.id !== entry.id));
        setConfirmingId(null);
        setNotice(`${entry.name} was removed from the queue.`);
    }

    // grab desired index change, swap index values, update queue, notify
    function moveEntry(index, direction) {           // direction: -1 = up, +1 = down
        const target = index + direction;
        if (target < 0 || target >= currentQueue.length) return;   // can't move past the ends
        const nextLine = [...currentQueue];
        [nextLine[index], nextLine[target]] = [nextLine[target], nextLine[index]];
        updateCurrentQueue(nextLine);
        setNotice(`${currentQueue[index].name} moved ${direction === -1 ? "up" : "down"}.`);
    }



    return (
        <main>
            <h1>Queue Management</h1>

            <label htmlFor="queue-service">Service</label>
            <select
                id="queue-service"
                value={selectedServiceId}
                onChange={(event) => {
                    setSelectedServiceId(Number(event.target.value));
                    setNotice("");
                    setConfirmingId(null);
                }}
            >
                {mockServices.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                ))}
            </select>

            <h2>{service.name}: {currentQueue.length} in line</h2>
            <p>Estimated wait for the last person: {currentQueue.length * service.duration} min</p>

            {currentQueue.length === 0 && <p>No one is waiting.</p>}
            {notice && <p role="status">{notice}</p>}
            <button type="button" onClick={serveNext} disabled={currentQueue.length === 0}>
                Serve next
            </button>

            <ol>
                {currentQueue.map((entry, index) => (
                    <li key={entry.id}>
                        {entry.name} (joined {entry.joinedAt})
                        <button type="button" onClick={() => moveEntry(index, -1)} disabled={index === 0}>Move up</button>
                        <button type="button" onClick={() => moveEntry(index, 1)} disabled={index === currentQueue.length - 1}>Move down</button>
                        {confirmingId === entry.id ? (
                            <>
                                <button type="button" onClick={() => removeEntry(entry)}>Yes, remove</button>
                                <button type="button" onClick={() => setConfirmingId(null)}>Cancel</button>
                            </>
                        ) : (
                            <button type="button" onClick={() => setConfirmingId(entry.id)}>Remove</button>
                        )}
                    </li>
                ))}
            </ol>
        </main>
    );
}

export default QueueManagement;