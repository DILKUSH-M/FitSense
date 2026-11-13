const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidDayKey, syncDailySteps } = require('../controllers/trackingController');

test('daily step sync accepts real calendar dates only', () => {
  assert.equal(isValidDayKey('2024-02-29'), true);
  assert.equal(isValidDayKey('2025-02-29'), false);
  assert.equal(isValidDayKey('2025-13-01'), false);
  assert.equal(isValidDayKey('2025-1-01'), false);
});

test('daily step sync rejects an invalid day before touching storage', async () => {
  let statusCode;
  let responseBody;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  await syncDailySteps({ params: { dayKey: '2025-02-29' }, body: {} }, response);
  assert.equal(statusCode, 400);
  assert.equal(responseBody.success, false);
});
