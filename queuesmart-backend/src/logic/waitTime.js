const ALMOST_READY_POSITION = 2;
const MS_PER_MINUTE = 60 * 1000;

function estimateWaitMinutes(position, minutesPerPerson) {
  if (!Number.isInteger(position) || position < 1) {
    throw new RangeError("Position must be a whole number of 1 or more.");
  }
  if (!Number.isFinite(minutesPerPerson) || minutesPerPerson <= 0) {
    throw new RangeError("Minutes per person must be greater than 0.");
  }
  return position * minutesPerPerson;
}

function estimateServeAt(position, minutesPerPerson, now = new Date()) {
  const minutes = estimateWaitMinutes(position, minutesPerPerson);
  return new Date(now.getTime() + minutes * MS_PER_MINUTE);
}

function getQueueStatus(position) {
  return position <= ALMOST_READY_POSITION ? "almost-ready" : "waiting";
}

module.exports = {
  ALMOST_READY_POSITION,
  estimateWaitMinutes,
  estimateServeAt,
  getQueueStatus,
};
