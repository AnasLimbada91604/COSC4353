import mockHistory from "../data/mockHistory";
import mockServices from "../data/mockServices";

function formatDate(isoDate) {
  // Parse as local time so the date doesn't shift a day in US time zones.
  return new Date(`${isoDate}T00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function History() {
  const entries = [...mockHistory].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main>
      <h1>History</h1>
      {entries.length === 0 && <p>You haven't joined any queues yet.</p>}
      {entries.map((entry) => {
        const service = mockServices.find((item) => item.id === entry.serviceId);
        return (
          <article key={entry.id}>
            <h2>{service ? service.name : "Unknown service"}</h2>
            <p>Date: {formatDate(entry.date)}</p>
            <p>Outcome: {entry.outcome}</p>
          </article>
        );
      })}
    </main>
  );
}

export default History;
