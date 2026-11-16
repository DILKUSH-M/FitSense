const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateDashboardHistory } = require('../services/dashboardAggregation');

const activities = [
  {
    dayKey: '2024-06-03',
    steps: 1000,
    caloriesBurned: 100,
    waterIntakeMl: 1000,
    availableMetrics: ['steps', 'caloriesBurned', 'waterIntakeMl'],
    source: 'sample_generated',
    historicalBaseline: true,
  },
  {
    dayKey: '2024-06-04',
    steps: 2000,
    caloriesBurned: 200,
    waterIntakeMl: 2000,
    availableMetrics: ['steps', 'caloriesBurned', 'waterIntakeMl'],
    source: 'user_entered',
  },
  {
    dayKey: '2024-06-05',
    waterIntakeMl: 1500,
    availableMetrics: ['waterIntakeMl'],
    source: 'sample_generated',
    historicalBaseline: true,
  },
  {
    dayKey: '2024-06-03',
    steps: 500,
    availableMetrics: ['steps'],
    source: 'health_connect',
  },
];

const workouts = [
  { dayKey: '2024-06-03', durationMinutes: 30, historicalBaseline: true, source: 'sample_generated' },
  { dayKey: '2024-06-03', durationMinutes: 45, source: 'user_entered' },
  { dayKey: '2024-06-05', durationMinutes: 20, source: 'user_entered' },
];

test('weekly totals derive from daily records and preserve missing metrics', () => {
  const result = aggregateDashboardHistory({
    activities,
    stepSummaries: [{ dayKey: '2024-06-03', steps: 1500, source: 'health_connect' }],
    workouts,
    todayKey: '2024-06-09',
    historyDays: 90,
  });

  assert.equal(result.week.startDayKey, '2024-06-03');
  assert.equal(result.week.totalSteps, 3500);
  assert.equal(result.week.stepsDaysWithData, 2);
  assert.equal(result.week.totalCaloriesBurned, 300);
  assert.equal(result.week.caloriesDaysWithData, 2);
  assert.equal(result.week.totalWorkoutDurationMinutes, 65);
  assert.equal(result.week.workoutsCompleted, 2);
  assert.equal(result.week.totalWaterIntakeMl, 4500);
  assert.equal(result.week.averageWaterIntakeMl, 1500);
  assert.equal(result.week.daily[0].steps, 1500);
  assert.equal(result.week.daily[0].sources.steps, 'health_connect');
  assert.equal(result.week.daily[2].caloriesBurned, null);
  assert.equal(result.week.daily[3].waterIntakeMl, null);
  assert.equal(result.history.daily.length, 90);
});

test('new calendar week totals do not include prior-week records', () => {
  const result = aggregateDashboardHistory({
    activities,
    workouts,
    todayKey: '2024-06-10',
  });

  assert.equal(result.week.startDayKey, '2024-06-10');
  assert.equal(result.week.totalSteps, null);
  assert.equal(result.week.workoutsCompleted, 0);
  assert.equal(result.week.daily[0].dayKey, '2024-06-10');
  assert.equal(result.week.daily[0].steps, null);
  assert.equal(result.week.elapsedDays, 1);
});

test('user records take precedence over generated metrics on the same day', () => {
  const result = aggregateDashboardHistory({
    activities,
    workouts,
    todayKey: '2024-06-09',
  });
  const monday = result.history.daily.find((day) => day.dayKey === '2024-06-03');

  assert.equal(monday.steps, 500);
  assert.equal(monday.sources.steps, 'health_connect');
  assert.equal(monday.workoutDurationMinutes, 45);
  assert.equal(monday.workoutsCompleted, 1);
  assert.equal(monday.sources.workouts, 'user_entered');
});

test('mixed daily records keep source attribution per metric', () => {
  const result = aggregateDashboardHistory({
    activities: [{
      dayKey: '2024-06-03',
      steps: 4000,
      caloriesBurned: 2000,
      waterIntakeMl: 1800,
      availableMetrics: ['steps', 'caloriesBurned', 'waterIntakeMl'],
      source: 'mixed',
      sourceMetadata: {
        metricSources: {
          steps: 'public_dataset',
          caloriesBurned: 'public_dataset',
          waterIntakeMl: 'sample_generated',
        },
      },
    }],
    todayKey: '2024-06-03',
    historyDays: 1,
  });
  const [day] = result.history.daily;

  assert.equal(day.sources.steps, 'public_dataset');
  assert.equal(day.sources.waterIntakeMl, 'sample_generated');
});

test('legacy records with only default zeroes are treated as unavailable', () => {
  const result = aggregateDashboardHistory({
    activities: [{ dayKey: '2024-06-03', steps: 0, caloriesBurned: 0, waterIntakeMl: 0 }],
    todayKey: '2024-06-03',
    historyDays: 1,
  });

  assert.equal(result.today.steps, null);
  assert.equal(result.today.caloriesBurned, null);
  assert.equal(result.today.waterIntakeMl, null);
});
