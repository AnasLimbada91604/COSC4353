import { useState } from "react";
import mockServices from "../data/mockServices";
import mockQueue from "../data/mockQueue";
import { priorityOptions, priorityRank } from "../data/priorities";
import "./QueueManagement.css";

// place updated entry at new priority queue, if coming from lower p place at bottom, if from higher p place on top
function insertByPriority(queue, entry, atFront = false) {
    const rank = priorityRank[entry.priority];
    let i = 0;
    while (
        i < queue.length &&
        (atFront ? priorityRank[queue[i].priority] > rank : priorityRank[queue[i].priority] >= rank)
        ) {
        i++;
    }
    return queue.slice(0, i).concat(entry, queue.slice(i));
}

function QueueManagement() {
    // define the queues for the queue management
    const [queues, setQueues] = useState(mockQueue);
    const [selectedServiceId, setSelectedServiceId] = useState(mockServices[0].id);

    // set the service and current queue
    const service = mockServices.find((item) => item.id === selectedServiceId);
    const currentQueue = queues[selectedServiceId] ?? [];

    // double-check with the user to remove and tell when removed
    const [confirmingId, setConfirmingId] = useState(null);   // whose Remove is being confirmed
    const [notice, setNotice] = useState("");
    const [pendingMove, setPendingMove] = useState(null);

    // always renders the current queue
    function updateCurrentQueue(nextLine) {
        setQueues((current) => ({ ...current, [selectedServiceId]: nextLine }));
        clearPrompts();
    }

    // only one confirm prompt open at a time
    function clearPrompts() {
        setConfirmingId(null);
        setPendingMove(null);
    }

    // cut the person served out of the queue, notify, update the queue (only if queue is not empty)
    function serveNext() {
        if (currentQueue.length === 0) return;
        const [served, ...rest] = currentQueue;
        updateCurrentQueue(rest);
        setNotice(`Now serving ${served.name}.`);
    }

    // cut the person out of the queue, notify
    function removeEntry(entry) {
        updateCurrentQueue(currentQueue.filter((item) => item.id !== entry.id));
        clearPrompts();
        setNotice(`${entry.name} was removed from the queue.`);
    }

    // clean up at after removal approval
    function startRemove(entry) {
        setPendingMove(null);
        setConfirmingId(entry.id);
    }

    // swap entry with its neighbor also the moved entry ends up with newPriority
    function applyMove(index, direction, newPriority) {
        const target = index + direction;
        const entry = currentQueue[index];
        const nextLine = [...currentQueue];
        nextLine[index] = currentQueue[target];
        nextLine[target] = { ...entry, priority: newPriority };
        updateCurrentQueue(nextLine);

        const moveText = `${entry.name} moved ${direction === -1 ? "up" : "down"}`;
        setNotice(
            newPriority === entry.priority
                ? `${moveText}.`
                : `${moveText} and is now ${newPriority} priority.`
        );
    }

    // same-priority neighbor: move right away, else ask first since it changes priority
    function moveEntry(index, direction) {           // direction: -1 = up, +1 = down
        const target = index + direction;
        if (target < 0 || target >= currentQueue.length) return;   // can't move past the ends
        const entry = currentQueue[index];
        const neighbor = currentQueue[target];
        clearPrompts();

        // ask to move priority if different
        if (neighbor.priority !== entry.priority) {
            setPendingMove({ entryId: entry.id, direction, newPriority: neighbor.priority });
            return;
        }
        applyMove(index, direction, entry.priority);
    }

    function confirmMove() {
        if (!pendingMove) return;
        const { entryId, direction, newPriority } = pendingMove;
        setPendingMove(null);

        const index = currentQueue.findIndex((item) => item.id === entryId);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= currentQueue.length) return;
        applyMove(index, direction, newPriority);
    }

    // make new queue with updated priority and notify/cleanup
    function updatePriority(entry, newPriority) {
        if (newPriority === entry.priority) return;
        const nextLine = currentQueue.filter((item) => item.id !== entry.id);
        const newEntry = {...entry, priority: newPriority};
        const isLowering = priorityRank[newPriority] < priorityRank[entry.priority];
        updateCurrentQueue(insertByPriority(nextLine, newEntry, isLowering));
        clearPrompts();
        setNotice(`${entry.name} priority changed to ${newPriority}.`);
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
            <p>Estimated wait for the last person: {Math.max(0, (currentQueue.length - 1) * service.duration)} min</p>

            {currentQueue.length === 0 && <p>No one is waiting.</p>}
            {notice && <p role="status">{notice}</p>}
            <button type="button" onClick={serveNext} disabled={currentQueue.length === 0}>
                Serve next
            </button>

            <ol className="queueList">
                {currentQueue.map((entry, index) => {
                    const isPendingMove = pendingMove?.entryId === entry.id;
                    return (
                        <li key={entry.id} className="queueEntry">
                            <div className="queueEntryName">
                                {entry.name}
                                <span className="queueEntryMeta">joined {entry.joinedAt}</span>
                            </div>

                            <div className="queueControls">
                                <select
                                    aria-label={`Priority for ${entry.name}`}
                                    value={entry.priority}
                                    onChange={(event) => updatePriority(entry, event.target.value)}
                                >
                                    {priorityOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                                <button type="button" onClick={() => moveEntry(index, -1)} disabled={index === 0}>Move up</button>
                                <button type="button" onClick={() => moveEntry(index, 1)} disabled={index === currentQueue.length - 1}>Move down</button>
                                {confirmingId === entry.id ? (
                                    <>
                                        <button type="button" onClick={() => removeEntry(entry)}>Yes, remove</button>
                                        <button type="button" onClick={() => setConfirmingId(null)}>Cancel</button>
                                    </>
                                ) : (
                                    <button type="button" onClick={() => startRemove(entry)}>Remove</button>
                                )}
                            </div>

                            {isPendingMove && (
                                <div className="queueControls queuePrompt" role="alert">
                                    <span>
                                        Moving {entry.name} {pendingMove.direction === -1 ? "up" : "down"} changes
                                        their priority from {entry.priority} to {pendingMove.newPriority}.
                                    </span>
                                    <button type="button" onClick={confirmMove}>Move and change priority</button>
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