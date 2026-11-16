const test = require('node:test');
const assert = require('node:assert/strict');
const Activity = require('../models/Activity');
const Workout = require('../models/Workout');
const {
  generateSampleHistory,
  parseFitbitDailyActivityCsv,
  upsertHistoricalActivity,
  upsertHistoricalWorkout,
} = require('../services/historicalFitness');

const csv = [
  'Id,ActivityDate,TotalSteps,Calories,TotalDistance,VeryActiveMinutes,FairlyActiveMinutes,LightlyActiveMinutes,SedentaryMinutes',
  '101,4/12/2016,5000,1800,3.2,10,15,20,600',
  '101,4/13/2016,6200,1900,4.1,12,16,24,570',
  '202,4/12/2016,3000,1600,2.1,4,8,12,700',
].join('\r\n');

test('Fitbit CSV parser selects the most-covered participant and retains exact dataset dates', () => {
  const result = parseFitbitDailyActivityCsv(csv);

  assert.equal(result.participantId, '101');
  assert.equal(result.coverage.firstDayKey, '2016-04-12');
  assert.equal(result.coverage.lastDayKey, '2016-04-13');
  assert.equal(result.coverage.days, 2);
  assert.equal(result.records[0].steps, 5000);
  assert.equal(result.records[0].activeMinutes, 45);
  assert.equal(result.records[0].availableMetrics.includes('waterIntakeMl'), false);
  assert.equal(result.records[0].source, 'public_dataset');
  assert.equal(result.records[0].sourceMetadata.participantId, '101');
});

test('Fitbit CSV parser accepts an explicit participant and rejects invalid imports', () => {
  const result = parseFitbitDailyActivityCsv(csv, '202');
  assert.equal(result.participantId, '202');
  assert.equal(result.coverage.days, 1);
  assert.throws(() => parseFitbitDailyActivityCsv(csv, 'missing'), /was not found/);
  assert.throws(() => parseFitbitDailyActivityCsv('Id,ActivityDate\n'), /no data rows/);
  assert.throws(
    () => parseFitbitDailyActivityCsv(csv.replace('4/12/2016,5000', '2/30/2016,5000')),
    /Invalid Fitbit ActivityDate/,
  );
});

test('generated sample history is deterministic and includes persisted dates and provenance', () => {
  const first = generateSampleHistory('2024-06-09', 90);
  const second = generateSampleHistory('2024-06-09', 90);

  assert.equal(first.activityRecords.length, 90);
  assert.equal(first.workoutRecords.length, 38);
  assert.deepEqual(
    first.activityRecords.map(({ dayKey, steps, waterIntakeMl }) => [dayKey, steps, waterIntakeMl]),
    second.activityRecords.map(({ dayKey, steps, waterIntakeMl }) => [dayKey, steps, waterIntakeMl]),
  );
  assert.equal(first.activityRecords[0].date instanceof Date, true);
  assert.equal(first.activityRecords[0].source, 'sample_generated');
  assert.equal(first.activityRecords[0].sourceMetadata.isSynthetic, true);
  assert.equal(first.workoutRecords.every((record) => record.source === 'sample_generated'), true);
});

class FakeModel {
  static records = [];

  static findOne(filter) {
    const record = this.records.find((item) => Object.entries(filter).every(([key, value]) => (
      String(item[key]) === String(value)
    )));
    return { lean: async () => (record ? { ...record } : null) };
  }

  static async updateOne(filter, update) {
    const record = this.records.find((item) => Object.entries(filter).every(([key, value]) => (
      String(item[key]) === String(value)
    )));
    if (record) Object.assign(record, update.$set);
  }

  static async create(record) {
    const duplicate = this.records.some((item) => (
      item.historicalBaseline
      && String(item.user) === String(record.user)
      && item.dayKey === record.dayKey
    ));
    if (duplicate) {
      const error = new Error('duplicate');
      error.code = 11000;
      throw error;
    }
    this.records.push({ ...record });
  }
}

class FakeWorkoutModel extends FakeModel {
  static records = [];

  static async create(record) {
    const duplicate = this.records.some((item) => item.historyRecordId === record.historyRecordId);
    if (duplicate) {
      const error = new Error('duplicate');
      error.code = 11000;
      throw error;
    }
    this.records.push({ ...record });
  }
}

test('historical upserts are idempotent, update public fields, and preserve generated-only metrics', async () => {
  FakeModel.records = [];
  const userId = 'demo-user';
  const sample = generateSampleHistory('2024-06-09', 7);
  const sampleRecord = sample.activityRecords.find((record) => record.dayKey === '2024-06-03');
  assert.equal(await upsertHistoricalActivity(FakeModel, userId, sampleRecord), 'created');
  assert.equal(await upsertHistoricalActivity(FakeModel, userId, sampleRecord), 'preserved');

  const publicRecord = parseFitbitDailyActivityCsv(
    'Id,ActivityDate,TotalSteps,Calories\n101,6/3/2024,9000,2300',
  ).records[0];
  assert.equal(await upsertHistoricalActivity(FakeModel, userId, publicRecord), 'upgraded');
  let merged = FakeModel.records[0];
  assert.equal(merged.steps, 9000);
  assert.equal(merged.waterIntakeMl, sampleRecord.waterIntakeMl);
  assert.equal(merged.source, 'mixed');
  assert.equal(merged.sourceMetadata.metricSources.steps, 'public_dataset');
  assert.equal(merged.sourceMetadata.metricSources.waterIntakeMl, 'sample_generated');

  const updatedPublicRecord = { ...publicRecord, caloriesBurned: 2400 };
  assert.equal(await upsertHistoricalActivity(FakeModel, userId, updatedPublicRecord), 'updated');
  merged = FakeModel.records[0];
  assert.equal(merged.caloriesBurned, 2400);
  assert.equal(merged.waterIntakeMl, sampleRecord.waterIntakeMl);
  assert.equal(FakeModel.records.length, 1);
});

test('historical upserts do not mutate user entries and workout baselines are repeatable', async () => {
  FakeModel.records = [{
    user: 'demo-user',
    dayKey: '2024-06-03',
    historicalBaseline: false,
    steps: 123,
    source: 'user_entered',
  }];
  const sampleRecord = generateSampleHistory('2024-06-09', 7)
    .activityRecords.find((record) => record.dayKey === '2024-06-03');
  assert.equal(await upsertHistoricalActivity(FakeModel, 'demo-user', sampleRecord), 'created');
  assert.equal(FakeModel.records[0].steps, 123);
  assert.equal(FakeModel.records.length, 2);

  FakeWorkoutModel.records = [];
  const workout = generateSampleHistory('2024-06-09', 7).workoutRecords[0];
  assert.equal(await upsertHistoricalWorkout(FakeWorkoutModel, 'demo-user', workout), 'created');
  assert.equal(await upsertHistoricalWorkout(FakeWorkoutModel, 'demo-user', workout), 'preserved');
});

test('historical daily uniqueness is partial and does not constrain user-entered records', () => {
  const activityIndex = Activity.schema.indexes().find(([, options]) => (
    options.unique && options.partialFilterExpression?.historicalBaseline === true
  ));
  const workoutIndex = Workout.schema.indexes().find(([, options]) => (
    options.unique && options.partialFilterExpression?.historyRecordId?.$exists === true
  ));

  assert.ok(activityIndex);
  assert.ok(workoutIndex);
});
