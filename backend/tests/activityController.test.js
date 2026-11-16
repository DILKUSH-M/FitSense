const test = require('node:test');
const assert = require('node:assert/strict');
const Activity = require('../models/Activity');
const {
  createActivity,
  deleteActivity,
  updateActivity,
} = require('../controllers/activityController');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('activity creation stores explicit metric availability and the submitted local day', async (t) => {
  const originalCreate = Activity.create;
  t.after(() => { Activity.create = originalCreate; });
  let created;
  Activity.create = async (record) => {
    created = record;
    return record;
  };

  const response = responseRecorder();
  await createActivity({
    user: { _id: 'user-id', trackingPreferences: { timeZone: 'America/Los_Angeles' } },
    body: {
      date: '2024-06-04T19:00:00.000Z',
      dayKey: '2024-06-04',
      waterIntakeMl: 1500,
      source: 'manual',
      historicalBaseline: true,
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(created.availableMetrics, ['waterIntakeMl']);
  assert.equal(created.dayKey, '2024-06-04');
  assert.equal(created.source, 'user_entered');
  assert.equal(created.historicalBaseline, undefined);
  assert.equal(created.sourceMetadata.enteredBy, 'user');
});

test('invalid activity measurements are rejected before creating a record', async (t) => {
  const originalCreate = Activity.create;
  t.after(() => { Activity.create = originalCreate; });
  let createCalled = false;
  Activity.create = async () => { createCalled = true; };
  const response = responseRecorder();

  await createActivity({
    user: { _id: 'user-id', trackingPreferences: { timeZone: 'UTC' } },
    body: { steps: 1.5, source: 'manual' },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(createCalled, false);
});

test('historical activity baselines cannot be edited or deleted', async (t) => {
  const originalFindOne = Activity.findOne;
  const originalDeleteOne = Activity.deleteOne;
  t.after(() => {
    Activity.findOne = originalFindOne;
    Activity.deleteOne = originalDeleteOne;
  });
  let deleteCalled = false;
  Activity.findOne = async () => ({ historicalBaseline: true });
  Activity.deleteOne = async () => { deleteCalled = true; };

  const req = {
    params: { id: 'baseline-id' },
    user: { _id: 'user-id', trackingPreferences: { timeZone: 'UTC' } },
    body: { waterIntakeMl: 500 },
  };
  const updateResponse = responseRecorder();
  await updateActivity(req, updateResponse);
  const deleteResponse = responseRecorder();
  await deleteActivity(req, deleteResponse);

  assert.equal(updateResponse.statusCode, 409);
  assert.equal(deleteResponse.statusCode, 409);
  assert.equal(deleteCalled, false);
});
