function ServiceCard({ service }) {
  return (
    <article className="service-card">
      <h3>{service.name}</h3>
      <p>Queue length: {service.queueLength}</p>
    </article>
  );
}

export default ServiceCard;
