export function formatWait(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function servicesFrom(data) {
  return Array.isArray(data) ? data : (data.services ?? []);
}
