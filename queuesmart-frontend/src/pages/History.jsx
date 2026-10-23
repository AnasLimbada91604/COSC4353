import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { formatWait } from "../data/currentQueue";

function formatDate(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function History() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/history")
      .then((data) => setEntries(data.history))
      .catch((err) => {
        if (err.status === 401) {
          navigate("/login");
        } else {
          setError("Couldn't load your history. Try again in a moment.");
        }
      });
  }, [navigate]);

  return (
    <main>
      <h1>History</h1>
      {error && <p role="alert">{error}</p>}
      {!entries && !error && <p>Loading...</p>}
      {entries?.length === 0 && <p>You haven't joined any queues yet.</p>}
      {entries?.map((entry) => (
        <article key={entry.id}>
          <h2>{entry.serviceName}</h2>
          <p>Date: {formatDate(entry.joinedAt)}</p>
          <p>Outcome: {entry.outcome}</p>
          {entry.actualWaitMinutes !== null && (
            <p>Time in line: {formatWait(entry.actualWaitMinutes)}</p>
          )}
        </article>
      ))}
    </main>
  );
}

export default History;
