const {
  dayKeysEnding,
  dayKeyAt,
  shiftDayKey,
  weekStartDayKey,
} = require('../utils/calendar');

const ACTIVITY_METRICS = ['steps', 'caloriesBurned', 'waterIntakeMl', 'activeMinutes', 'distanceKm'];

function recordDayKey(record, dateField, timeZone) {
  if (record.dayKey) return record.dayKey;
  return dayKeyAt(record[dateField], timeZone);
}

function metricIsAvailable(record, field) {
  if (Array.isArray(record.availableMetrics)) return record.availableMetrics.includes(field);
  return record[field] !== null
    && record[field] !== undefined
    && Number.isFinite(Number(record[field]))
    && Number(record[field]) !== 0;
}

function normalizeSource(source) {
  if (!source || source === 'manual') return 'user_entered';
  return source;
}

function sourceOf(records, field) {
  const sources = [...new Set(records.map((record) => normalizeSource(
    record.sourceMetadata?.metricSources?.[field] || record.source,
  )))];
  if (sources.length === 0) return null;
  return sources.length === 1 ? sources[0] : 'mixed';
}

function sumMetric(records, field) {
  if (records.length === 0) return null;
  return records.reduce((sum, record) => sum + (Number(record[field]) || 0), 0);
}

function selectActivityRecords(records, field) {
  const available = records.filter((record) => metricIsAvailable(record, field));
  const userRecords = available.filter((record) => !record.historicalBaseline);
  return userRecords.length > 0 ? userRecords : available;
}

function sumKnownDays(days, field) {
  const known = days.filter((day) => day[field] !== null);
  return {
    total: known.length ? known.reduce((sum, day) => sum + day[field], 0) : null,
    daysWithData: known.length,
  };
}

function emptyDay(dayKey, isFuture = false) {
  return {
    dayKey,
    steps: null,
    caloriesBurned: null,
    waterIntakeMl: null,
    activeMinutes: null,
    distanceKm: null,
    workoutDurationMinutes: isFuture ? null : 0,
    workoutsCompleted: isFuture ? null : 0,
    sources: {
      steps: null,
      caloriesBurned: null,
      waterIntakeMl: null,
      activeMinutes: null,
      distanceKm: null,
      workouts: null,
    },
  };
}

function aggregateDashboardHistory({
  activities = [],
  stepSummaries = [],
  workouts = [],
  todayKey,
  timeZone = 'UTC',
  historyDays = 90,
}) {
  const historyDayKeys = dayKeysEnding(todayKey, historyDays);
  const firstDayKey = historyDayKeys[0];
  const days = new Map(historyDayKeys.map((dayKey) => [dayKey, emptyDay(dayKey)]));
  const activitiesByDay = new Map();
  const workoutsByDay = new Map();
  const stepSummariesByDay = new Map();

  for (const activity of activities) {
    const dayKey = recordDayKey(activity, 'date', timeZone);
    if (!days.has(dayKey)) continue;
    const records = activitiesByDay.get(dayKey) || [];
    records.push(activity);
    activitiesByDay.set(dayKey, records);
  }

  for (const workout of workouts) {
    const dayKey = recordDayKey(workout, 'workoutDate', timeZone);
    if (!days.has(dayKey)) continue;
    const records = workoutsByDay.get(dayKey) || [];
    records.push(workout);
    workoutsByDay.set(dayKey, records);
  }

  for (const summary of stepSummaries) {
    if (days.has(summary.dayKey)) stepSummariesByDay.set(summary.dayKey, summary);
  }

  for (const dayKey of historyDayKeys) {
    const day = days.get(dayKey);
    const dayActivities = activitiesByDay.get(dayKey) || [];
    const stepSummary = stepSummariesByDay.get(dayKey);

    for (const field of ACTIVITY_METRICS) {
      if (field === 'steps' && stepSummary) {
        day.steps = stepSummary.steps;
        day.sources.steps = normalizeSource(stepSummary.source);
        continue;
      }
      const selected = selectActivityRecords(dayActivities, field);
      day[field] = sumMetric(selected, field);
      day.sources[field] = sourceOf(selected, field);
    }

    const dayWorkouts = workoutsByDay.get(dayKey) || [];
    const userWorkouts = dayWorkouts.filter((workout) => !workout.historicalBaseline);
    const selectedWorkouts = userWorkouts.length ? userWorkouts : dayWorkouts;
    day.workoutDurationMinutes = selectedWorkouts.reduce(
      (sum, workout) => sum + (Number(workout.durationMinutes) || 0),
      0,
    );
    day.workoutsCompleted = selectedWorkouts.length;
    day.sources.workouts = sourceOf(selectedWorkouts);
  }

  const today = days.get(todayKey);
  const weekStartKey = weekStartDayKey(todayKey);
  const weekDayKeys = Array.from({ length: 7 }, (_, index) => shiftDayKey(weekStartKey, index));
  const elapsedWeekDays = weekDayKeys
    .filter((dayKey) => dayKey <= todayKey)
    .map((dayKey) => days.get(dayKey) || emptyDay(dayKey));
  const weeklySteps = sumKnownDays(elapsedWeekDays, 'steps');
  const weeklyCalories = sumKnownDays(elapsedWeekDays, 'caloriesBurned');
  const weeklyWater = sumKnownDays(elapsedWeekDays, 'waterIntakeMl');
  const workoutDuration = elapsedWeekDays.reduce(
    (sum, day) => sum + (day.workoutDurationMinutes || 0),
    0,
  );
  const workoutsCompleted = elapsedWeekDays.reduce(
    (sum, day) => sum + (day.workoutsCompleted || 0),
    0,
  );

  const weeklyWorkoutByStart = new Map();
  for (const day of days.values()) {
    const weekStart = weekStartDayKey(day.dayKey);
    const current = weeklyWorkoutByStart.get(weekStart) || {
      weekStartDayKey: weekStart,
      durationMinutes: 0,
      workoutsCompleted: 0,
      sources: [],
    };
    current.durationMinutes += day.workoutDurationMinutes || 0;
    current.workoutsCompleted += day.workoutsCompleted || 0;
    if (day.sources.workouts) current.sources.push(day.sources.workouts);
    weeklyWorkoutByStart.set(weekStart, current);
  }

  const sourceCounts = {};
  for (const day of days.values()) {
    for (const source of Object.values(day.sources)) {
      if (source) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }
  }

  return {
    today,
    week: {
      startDayKey: weekStartKey,
      endDayKey: todayKey,
      elapsedDays: elapsedWeekDays.length,
      totalSteps: weeklySteps.total,
      stepsDaysWithData: weeklySteps.daysWithData,
      totalCaloriesBurned: weeklyCalories.total,
      caloriesDaysWithData: weeklyCalories.daysWithData,
      totalWorkoutDurationMinutes: workoutDuration,
      workoutsCompleted,
      totalWaterIntakeMl: weeklyWater.total,
      waterDaysWithData: weeklyWater.daysWithData,
      averageWaterIntakeMl: weeklyWater.daysWithData
        ? weeklyWater.total / weeklyWater.daysWithData
        : null,
      daily: weekDayKeys.map((dayKey) => days.get(dayKey) || emptyDay(dayKey, dayKey > todayKey)),
    },
    history: {
      fromDayKey: firstDayKey,
      toDayKey: todayKey,
      daily: [...days.values()],
      weeklyWorkoutDuration: [...weeklyWorkoutByStart.values()].sort(
        (a, b) => a.weekStartDayKey.localeCompare(b.weekStartDayKey),
      ),
      sourceCounts,
      hasHistoricalSampleData: (sourceCounts.sample_generated || 0) > 0
        || (sourceCounts.public_dataset || 0) > 0,
    },
  };
}

module.exports = { aggregateDashboardHistory };
