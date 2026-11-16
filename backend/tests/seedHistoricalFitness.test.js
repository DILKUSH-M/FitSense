const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const { getDemoUser } = require('../scripts/seedHistoricalFitness');

function preserveEnvironment(t, names) {
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test('historical seed refuses to modify an existing non-demo account', async (t) => {
  preserveEnvironment(t, ['FITNESS_HISTORY_DEMO_EMAIL', 'FITNESS_HISTORY_TIME_ZONE']);
  process.env.FITNESS_HISTORY_DEMO_EMAIL = 'history-demo@fitsense.invalid';
  process.env.FITNESS_HISTORY_TIME_ZONE = 'UTC';
  const originalFindOne = User.findOne;
  t.after(() => { User.findOne = originalFindOne; });
  let saveCalled = false;
  User.findOne = async () => ({
    email: 'history-demo@fitsense.invalid',
    isDemoProfile: false,
    save: async () => { saveCalled = true; },
  });

  await assert.rejects(getDemoUser(), /Refusing to seed non-demo account/);
  assert.equal(saveCalled, false);
});

test('rerunning the historical seed preserves the demo profile end date', async (t) => {
  preserveEnvironment(t, [
    'FITNESS_HISTORY_DEMO_EMAIL',
    'FITNESS_HISTORY_TIME_ZONE',
    'FITNESS_HISTORY_AS_OF_DAY',
  ]);
  process.env.FITNESS_HISTORY_DEMO_EMAIL = 'history-demo@fitsense.invalid';
  process.env.FITNESS_HISTORY_TIME_ZONE = 'UTC';
  process.env.FITNESS_HISTORY_AS_OF_DAY = '2024-01-01';
  const originalFindOne = User.findOne;
  t.after(() => { User.findOne = originalFindOne; });
  let saveCalled = false;
  const demo = {
    email: 'history-demo@fitsense.invalid',
    isDemoProfile: true,
    historySampleEndDay: '2023-12-31',
    save: async () => { saveCalled = true; },
  };
  User.findOne = async () => demo;

  const result = await getDemoUser();

  assert.equal(result.historySampleEndDay, '2023-12-31');
  assert.equal(saveCalled, false);
});
