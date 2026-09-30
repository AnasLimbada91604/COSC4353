import QuickActionButton from "./QuickActionButton";

function ServiceCard({ service, onToggleQueue }) {
  return (
    <article className="service-card">
      <h2>{service.name}</h2>
      <p>{service.description}</p>
      <p>Duration: {service.duration} min</p>
      <p>Priority: {service.priority}</p>
      <p>Queue length: {service.queueLength}</p>
      <p>Queue: {service.isOpen ? "Open" : "Closed"}</p>
      <QuickActionButton
        label={service.isOpen ? "Close queue" : "Open queue"}
        onClick={() => onToggleQueue(service.id)}
      />
    </article>
  );
}

export default ServiceCard;
