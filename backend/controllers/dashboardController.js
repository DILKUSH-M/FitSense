const Workout = require('../models/Workout');
const Activity = require('../models/Activity');
const Nutrition = require('../models/Nutrition');
const ActivitySession = require('../models/ActivitySession');
const DailyStepSummary = require('../models/DailyStepSummary');

function dayKeyAt(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDayKey(dayKey, days) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function getDashboardSummary(req, res) {
  const userId = req.user._id;
  const now = new Date();
  const timeZone = req.user.trackingPreferences?.timeZone || 'UTC';
  const todayKey = dayKeyAt(now, timeZone);
  const daysSinceMonday = (new Date(`${todayKey}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const weekStartKey = previousDayKey(todayKey, daysSinceMonday);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));

  const [workouts, activities, nutrition, dailyStepSummaries, sessions] = await Promise.all([
    Workout.find({ user: userId, workoutDate: { $gte: startOfWeek } }).sort({ workoutDate: -1 }),
    Activity.find({ user: userId, date: { $gte: startOfWeek } }).sort({ date: -1 }),
    Nutrition.find({ user: userId, intakeDate: { $gte: startOfDay } }).sort({ intakeDate: -1 }),
    DailyStepSummary.find({ user: userId, dayKey: { $gte: weekStartKey, $lte: todayKey } }).sort({ dayKey: 1 }),
    ActivitySession.find({ user: userId, startedAt: { $gte: new Date(`${weekStartKey}T00:00:00.000Z`) } }).sort({ startedAt: -1 }).limit(50),
  ]);

  const totalCalories = activities.reduce((sum, item) => sum + (item.caloriesBurned || 0), 0);
  const totalDuration = workouts.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  const todayActivities = activities.filter((item) => dayKeyAt(item.date, timeZone) === todayKey);
  const activitiesByDay = new Map();
  for (const item of activities) {
    const key = dayKeyAt(item.date, timeZone);
    const totals = activitiesByDay.get(key) || { steps: 0 };
    totals.steps += item.steps || 0;
    activitiesByDay.set(key, totals);
  }
  const summariesByDay = new Map(dailyStepSummaries.map((item) => [item.dayKey, item]));
  const dailySteps = [];
  for (let daysAgo = daysSinceMonday; daysAgo >= 0; daysAgo -= 1) {
    const dayKey = previousDayKey(todayKey, daysAgo);
    dailySteps.push({
      dayKey,
      steps: summariesByDay.get(dayKey)?.steps ?? activitiesByDay.get(dayKey)?.steps ?? 0,
    });
  }
  const totalSteps = dailySteps.reduce((sum, item) => sum + item.steps, 0);
  const todaySteps = summariesByDay.get(todayKey)?.steps ?? activitiesByDay.get(todayKey)?.steps ?? 0;
  const todayCalories = todayActivities.reduce((sum, item) => sum + (item.caloriesBurned || 0), 0);
  const todayCaloriesConsumed = nutrition.reduce((sum, item) => sum + (item.calories || 0), 0);
  const todayActiveMinutes = todayActivities.reduce((sum, item) => sum + (item.activeMinutes || 0), 0);
  const waterIntakeMl = todayActivities.reduce((sum, item) => sum + (item.waterIntakeMl || 0), 0);
  const todaySessions = sessions.filter((session) => dayKeyAt(session.startedAt, timeZone) === todayKey);
  const todaySessionDurationMinutes = todaySessions.reduce((sum, session) => {
    const end = session.endedAt || now;
    return sum + Math.max(0, (end.getTime() - session.startedAt.getTime()) / 60000);
  }, 0);
  const todaySessionDistanceKm = todaySessions.reduce((sum, session) => sum + session.distanceMeters / 1000, 0);
  const todaySessionCalories = todaySessions.reduce((sum, session) => sum + session.caloriesBurned, 0);
  const sessionDistanceKm = sessions.reduce((sum, session) => sum + session.distanceMeters / 1000, 0);
  const sessionDurationMinutes = sessions.reduce((sum, session) => {
    const end = session.endedAt || now;
    return sum + Math.max(0, (end.getTime() - session.startedAt.getTime()) / 60000);
  }, 0);
  const workoutTarget = Math.max(1, req.user.weeklyWorkoutTarget || 1);
  const goalCompletion = Math.min(100, Math.round((workouts.length / workoutTarget) * 100));

  return res.status(200).json({
    success: true,
    summary: {
      totalSteps,
      totalCalories,
      totalDuration,
      workoutsCompleted: workouts.length,
      waterIntakeMl,
      goalCompletion,
      todaySteps,
      todayCalories,
      todayCaloriesConsumed,
      todayActiveMinutes,
      todayWalkingDistanceKm: todaySessions.length
        ? todaySessionDistanceKm
        : todayActivities.reduce((sum, activity) => sum + (activity.distanceKm || 0), 0),
      todaySessionActiveMinutes: Math.round(todaySessionDurationMinutes),
      todaySessionCalories,
      goal: req.user.goal,
    },
    recentWorkouts: workouts.slice(0, 5),
    recentActivities: activities,
    recentSessions: sessions.slice(0, 10),
    weeklyProgress: {
      dailySteps,
      walkingDistanceKm: Number(sessionDistanceKm.toFixed(2)),
      activeMinutes: Math.round(sessionDurationMinutes),
      sessions: sessions.filter((session) => session.status === 'completed').length,
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
