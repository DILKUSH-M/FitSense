const Workout = require('../models/Workout');
const Activity = require('../models/Activity');
const Nutrition = require('../models/Nutrition');
const ActivitySession = require('../models/ActivitySession');
const DailyStepSummary = require('../models/DailyStepSummary');
const { aggregateDashboardHistory } = require('../services/dashboardAggregation');
const {
  dayKeyAt,
  shiftDayKey,
  weekStartDayKey,
  isValidTimeZone,
} = require('../utils/calendar');

async function getDashboardSummary(req, res) {
  const userId = req.user._id;
  const now = new Date();
  const requestedTimeZone = req.get?.('X-Time-Zone');
  const storedTimeZone = req.user.trackingPreferences?.timeZone || 'UTC';
  const timeZone = requestedTimeZone && isValidTimeZone(requestedTimeZone)
    ? requestedTimeZone
    : storedTimeZone;
  const todayKey = dayKeyAt(now, timeZone);
  const firstDayKey = shiftDayKey(todayKey, -89);
  const weekStartKey = weekStartDayKey(todayKey);
  const rangeStart = new Date(`${shiftDayKey(firstDayKey, -1)}T00:00:00.000Z`);
  const rangeEnd = new Date(`${shiftDayKey(todayKey, 2)}T00:00:00.000Z`);
  const historyActivityFilter = {
    user: userId,
    $or: [
      { dayKey: { $gte: firstDayKey, $lte: todayKey } },
      { dayKey: { $exists: false }, date: { $gte: rangeStart, $lt: rangeEnd } },
    ],
  };
  const historyWorkoutFilter = {
    user: userId,
    $or: [
      { dayKey: { $gte: firstDayKey, $lte: todayKey } },
      { dayKey: { $exists: false }, workoutDate: { $gte: rangeStart, $lt: rangeEnd } },
    ],
  };
  const [workouts, activities, nutrition, dailyStepSummaries, sessions] = await Promise.all([
    Workout.find(historyWorkoutFilter).sort({ workoutDate: -1 }),
    Activity.find(historyActivityFilter).sort({ date: -1 }),
    Nutrition.find({ user: userId, intakeDate: { $gte: rangeStart, $lt: rangeEnd } }).sort({ intakeDate: -1 }),
    DailyStepSummary.find({ user: userId, dayKey: { $gte: firstDayKey, $lte: todayKey } }).sort({ dayKey: 1 }),
    ActivitySession.find({ user: userId, startedAt: { $gte: rangeStart, $lt: rangeEnd } }).sort({ startedAt: -1 }).limit(200),
  ]);
  const history = aggregateDashboardHistory({
    activities,
    stepSummaries: dailyStepSummaries,
    workouts,
    todayKey,
    timeZone,
  });
  const currentWeekWorkouts = workouts.filter((item) => {
    const dayKey = item.dayKey || dayKeyAt(item.workoutDate, timeZone);
    return dayKey >= weekStartKey && dayKey <= todayKey;
  });
  const currentWeekActivities = activities.filter((item) => {
    const dayKey = item.dayKey || dayKeyAt(item.date, timeZone);
    return dayKey >= weekStartKey && dayKey <= todayKey;
  });
  const today = history.today;
  const todayCaloriesConsumed = nutrition
    .filter((item) => dayKeyAt(item.intakeDate, timeZone) === todayKey)
    .reduce((sum, item) => sum + (item.calories || 0), 0);
  const todaySessions = sessions.filter((session) => dayKeyAt(session.startedAt, timeZone) === todayKey);
  const todaySessionDurationMinutes = todaySessions.reduce((sum, session) => {
    const end = session.endedAt || now;
    return sum + Math.max(0, (end.getTime() - session.startedAt.getTime()) / 60000);
  }, 0);
  const todaySessionDistanceKm = todaySessions.reduce((sum, session) => sum + session.distanceMeters / 1000, 0);
  const todaySessionCalories = todaySessions.reduce((sum, session) => sum + session.caloriesBurned, 0);
  const currentWeekSessions = sessions.filter((session) => {
    const dayKey = dayKeyAt(session.startedAt, timeZone);
    return dayKey >= weekStartKey && dayKey <= todayKey;
  });
  const sessionDistanceKm = currentWeekSessions.reduce((sum, session) => sum + session.distanceMeters / 1000, 0);
  const sessionDurationMinutes = currentWeekSessions.reduce((sum, session) => {
    const end = session.endedAt || now;
    return sum + Math.max(0, (end.getTime() - session.startedAt.getTime()) / 60000);
  }, 0);
  const workoutTarget = Math.max(1, req.user.weeklyWorkoutTarget || 1);
  const goalCompletion = Math.min(100, Math.round((history.week.workoutsCompleted / workoutTarget) * 100));

  return res.status(200).json({
    success: true,
    summary: {
      totalSteps: history.week.totalSteps ?? 0,
      totalCalories: history.week.totalCaloriesBurned ?? 0,
      totalDuration: history.week.totalWorkoutDurationMinutes,
      workoutsCompleted: history.week.workoutsCompleted,
      waterIntakeMl: today.waterIntakeMl ?? 0,
      goalCompletion,
      todaySteps: today.steps ?? 0,
      todayCalories: today.caloriesBurned ?? 0,
      todayCaloriesConsumed,
      todayActiveMinutes: today.activeMinutes ?? 0,
      todayWalkingDistanceKm: todaySessions.length
        ? todaySessionDistanceKm
        : today.distanceKm ?? 0,
      todaySessionActiveMinutes: Math.round(todaySessionDurationMinutes),
      todaySessionCalories,
      goal: req.user.goal,
    },
    weeklyOverview: history.week,
    historicalData: history.history,
    recentWorkouts: currentWeekWorkouts.slice(0, 5),
    recentActivities: currentWeekActivities,
    recentSessions: sessions.slice(0, 10),
    weeklyProgress: {
      dailySteps: history.week.daily.map(({ dayKey, steps }) => ({ dayKey, steps: steps ?? 0 })),
      walkingDistanceKm: Number(sessionDistanceKm.toFixed(2)),
      activeMinutes: Math.round(sessionDurationMinutes),
      sessions: currentWeekSessions.filter((session) => session.status === 'completed').length,
    },
    recentMeals: nutrition,
    totals: { meals: nutrition.length },
  });
}

async function getAnalytics(req, res) {
  const userId = req.user._id;
  const from = new Date();
  from.setMonth(from.getMonth() - 5, 1);
  from.setHours(0, 0, 0, 0);

  const [monthlyWorkouts, monthlyActivity] = await Promise.all([
    Workout.aggregate([
      { $match: { user: userId, workoutDate: { $gte: from } } },
      {
        $group: {
          _id: { year: { $year: '$workoutDate' }, month: { $month: '$workoutDate' } },
          workouts: { $sum: 1 },
          durationMinutes: { $sum: '$durationMinutes' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Activity.aggregate([
      { $match: { user: userId, date: { $gte: from } } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          steps: { $sum: '$steps' },
          calories: { $sum: '$caloriesBurned' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  const workouts = monthlyWorkouts.map((item) => ({
    ...item,
    label: new Date(item._id.year, item._id.month - 1).toLocaleString('en', { month: 'short' }),
  }));
  const activity = monthlyActivity.map((item) => ({
    ...item,
    label: new Date(item._id.year, item._id.month - 1).toLocaleString('en', { month: 'short' }),
  }));
  const workoutCount = monthlyWorkouts.reduce((sum, item) => sum + item.workouts, 0);
  const possibleWorkouts = Math.max(1, (req.user.weeklyWorkoutTarget || 1) * 26);

  return res.status(200).json({
    success: true,
    analytics: {
      workouts,
      activity,
      workoutCount,
      totalDuration: monthlyWorkouts.reduce((sum, item) => sum + item.durationMinutes, 0),
      consistencyPercent: Math.min(100, Math.round((workoutCount / possibleWorkouts) * 100)),
      currentWeight: req.user.weight,
      weightHistoryAvailable: false,
    },
  });
}

module.exports = { getDashboardSummary, getAnalytics };
