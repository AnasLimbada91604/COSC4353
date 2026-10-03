const STORAGE_KEY = "queuesmart-current-queue";


export function getCurrentQueue() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}


export function joinQueue(service) {
  const entry = {
    serviceId: service.id,
    position: service.queueLength + 1,
    joinedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  return entry;
}

export function leaveQueue() {
  localStorage.removeItem(STORAGE_KEY);
}


export function formatWait(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
