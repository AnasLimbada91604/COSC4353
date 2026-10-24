const { getQueue } = require("../store/queues");
const { addNotification, hasNotification } = require("../store/notifications");

const NOTIFICATION_TYPES = { JOINED: "joined", ALMOST_SERVED: "almost-served" };

const ALMOST_SERVED_POSITION = 2;

function isAlmostServed(position) {
  return position >= 1 && position <= ALMOST_SERVED_POSITION;
}

function joinedMessage(serviceName, position, estimatedWaitMinutes) {
  return `You joined the ${serviceName} queue. You are #${position} in line, with an estimated wait of ${estimatedWaitMinutes} min.`;
}

function almostServedMessage(serviceName, position) {
  if (position === 1) {
    return `You're next at ${serviceName}. Please head to the service desk.`;
  }
  return `You're almost up at ${serviceName}. You are #${position} in line.`;
}

function findNewlyAlmostServed(line, alreadyNotified) {
  const result = [];
  line.forEach((entry, index) => {
    const position = index + 1;
    if (
      entry.userId !== null &&
      isAlmostServed(position) &&
      !alreadyNotified(entry.id)
    ) {
      result.push({ entry, position });
    }
  });
  return result;
}

function notifyJoined({
  userId,
  entryId,
  service,
  position,
  estimatedWaitMinutes,
}) {
  return addNotification({
    userId,
    entryId,
    type: NOTIFICATION_TYPES.JOINED,
    serviceId: service.id,
    serviceName: service.name,
    message: joinedMessage(service.name, position, estimatedWaitMinutes),
  });
}

function notifyAlmostServed(service) {
  const alreadyNotified = (entryId) =>
    hasNotification(entryId, NOTIFICATION_TYPES.ALMOST_SERVED);
  return findNewlyAlmostServed(getQueue(service.id), alreadyNotified).map(
    ({ entry, position }) =>
      addNotification({
        userId: entry.userId,
        entryId: entry.id,
        type: NOTIFICATION_TYPES.ALMOST_SERVED,
        serviceId: service.id,
        serviceName: service.name,
        message: almostServedMessage(service.name, position),
      }),
  );
}

module.exports = {
  NOTIFICATION_TYPES,
  ALMOST_SERVED_POSITION,
  isAlmostServed,
  joinedMessage,
  almostServedMessage,
  findNewlyAlmostServed,
  notifyJoined,
  notifyAlmostServed,
};
