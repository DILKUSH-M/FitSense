const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dayKeyAt,
  dayKeysEnding,
  isValidDayKey,
  shiftDayKey,
  weekStartDayKey,
} = require('../utils/calendar');

test('calendar helpers validate and shift local day keys without UTC date drift', () => {
  assert.equal(isValidDayKey('2024-02-29'), true);
  assert.equal(isValidDayKey('2025-02-29'), false);
  assert.equal(shiftDayKey('2024-01-01', -1), '2023-12-31');
  assert.deepEqual(dayKeysEnding('2024-01-01', 2), ['2023-12-31', '2024-01-01']);
  assert.equal(dayKeyAt(new Date('2024-01-01T04:30:00.000Z'), 'America/New_York'), '2023-12-31');
});

test('week boundaries transition on Monday', () => {
  assert.equal(weekStartDayKey('2024-06-09'), '2024-06-03');
  assert.equal(weekStartDayKey('2024-06-10'), '2024-06-10');
});
