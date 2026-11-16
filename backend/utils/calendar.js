function isValidDayKey(dayKey) {
  if (typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return false;
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dayKey;
}

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function dayKeyAt(value, timeZone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('A valid date is required.');
  if (!isValidTimeZone(timeZone)) throw new RangeError('A valid IANA time zone is required.');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDayKey(dayKey, days) {
  if (!isValidDayKey(dayKey) || !Number.isInteger(days)) {
    throw new TypeError('A valid day key and whole-day offset are required.');
  }
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStartDayKey(dayKey) {
  if (!isValidDayKey(dayKey)) throw new TypeError('A valid day key is required.');
  const weekday = new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
  return shiftDayKey(dayKey, -((weekday + 6) % 7));
}

function dayKeysEnding(endDayKey, count) {
  if (!isValidDayKey(endDayKey) || !Number.isInteger(count) || count < 1) {
    throw new TypeError('A valid end day and positive day count are required.');
  }
  const firstDayKey = shiftDayKey(endDayKey, -(count - 1));
  return Array.from({ length: count }, (_, index) => shiftDayKey(firstDayKey, index));
}

module.exports = {
  dayKeyAt,
  dayKeysEnding,
  isValidDayKey,
  isValidTimeZone,
  shiftDayKey,
  weekStartDayKey,
};
