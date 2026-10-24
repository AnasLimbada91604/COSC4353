let notifications = [];
let nextNotificationId = 1;

function resetNotifications() {
  notifications = [];
  nextNotificationId = 1;
}

function addNotification({
  userId,
  entryId,
  type,
  serviceId,
  serviceName,
  message,
}) {
  const notification = {
    id: nextNotificationId,
    userId,
    entryId,
    type,
    serviceId,
    serviceName,
    message,
    createdAt: new Date().toISOString(),
  };
  nextNotificationId += 1;
  notifications.push(notification);
  return { ...notification };
}

function listNotifications(userId) {
  return notifications
    .filter((notification) => notification.userId === userId)
    .reverse()
    .map((notification) => ({ ...notification }));
}

function hasNotification(entryId, type) {
  return notifications.some(
    (notification) =>
      notification.entryId === entryId && notification.type === type,
  );
}

module.exports = {
  resetNotifications,
  addNotification,
  listNotifications,
  hasNotification,
};
