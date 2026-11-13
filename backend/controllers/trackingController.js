const ActivitySession = require('../models/ActivitySession');
const DailyStepSummary = require('../models/DailyStepSummary');
const User = require('../models/User');

const allowedPreferenceFields = ['enabled', 'paused', 'dailyStepsEnabled', 'storeRoute', 'stationaryEndMinutes', 'timeZone'];

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isValidDayKey(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return false;
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dayKey;
}

async function getTrackingPreferences(req, res) {
  return res.status(200).json({
    success: true,
    preferences: req.user.trackingPreferences,
  });
}

async function updateTrackingPreferences(req, res) {
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([field]) => allowedPreferenceFields.includes(field)),
  );

  if (Object.hasOwn(updates, 'timeZone') && !validTimeZone(updates.timeZone)) {
    return res.status(400).json({ success: false, message: 'Enter a valid IANA time zone.' });
  }
  if (Object.hasOwn(updates, 'enabled') && typeof updates.enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Tracking enabled must be a boolean.' });
  }
  if (Object.hasOwn(updates, 'paused') && typeof updates.paused !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Tracking paused must be a boolean.' });
  }
  if (Object.hasOwn(updates, 'dailyStepsEnabled') && typeof updates.dailyStepsEnabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Daily step tracking must be a boolean.' });
  }
  if (Object.hasOwn(updates, 'storeRoute') && typeof updates.storeRoute !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Route storage must be a boolean.' });
  }
  if (Object.hasOwn(updates, 'stationaryEndMinutes')
    && (!Number.isInteger(updates.stationaryEndMinutes) || updates.stationaryEndMinutes < 2 || updates.stationaryEndMinutes > 60)) {
    return res.status(400).json({ success: false, message: 'Stationary end time must be between 2 and 60 minutes.' });
  }

  if (updates.enabled === false) updates.paused = false;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: Object.fromEntries(Object.entries(updates).map(([field, value]) => [`trackingPreferences.${field}`, value])) },
    { new: true, runValidators: true },
  ).select('-password');

  return res.status(200).json({ success: true, preferences: user.trackingPreferences });
}

async function syncDailySteps(req, res) {
  const { dayKey } = req.params;
  const { steps, source, timeZone, distanceMeters = 0, activeMinutes = 0, caloriesBurned = 0 } = req.body;

  if (!isValidDayKey(dayKey)) {
    return res.status(400).json({ success: false, message: 'Enter a valid calendar day in YYYY-MM-DD format.' });
  }
  if (!Number.isInteger(steps) || steps < 0 || steps > 200000) {
    return res.status(400).json({ success: false, message: 'Steps must be a whole number between 0 and 200000.' });
  }
  if (!['health_connect', 'android_sensor'].includes(source)) {
    return res.status(400).json({ success: false, message: 'A supported step source is required.' });
  }
  if (typeof timeZone !== 'string' || !validTimeZone(timeZone)) {
    return res.status(400).json({ success: false, message: 'A valid IANA time zone is required.' });
  }
  const optionalMetrics = [
    [distanceMeters, 1000000],
    [activeMinutes, 1440],
    [caloriesBurned, 20000],
  ];
  if (optionalMetrics.some(([value, max]) => !Number.isFinite(value) || value < 0 || value > max)) {
    return res.status(400).json({ success: false, message: 'Daily activity metrics must be non-negative numbers.' });
  }

  const summary = await DailyStepSummary.findOneAndUpdate(
    { user: req.user._id, dayKey },
    { $set: { timeZone, source, steps, distanceMeters, activeMinutes, caloriesBurned, synchronizedAt: new Date() } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return res.status(200).json({ success: true, summary });
}

async function syncActivitySession(req, res) {
  const { clientSessionId } = req.params;
  const {
    activityType, status, startedAt, endedAt, steps, distanceMeters,
    averagePaceSecondsPerKm, caloriesBurned, route = [],
  } = req.body;
  const start = new Date(startedAt);
  const end = endedAt == null ? null : new Date(endedAt);

  if (!clientSessionId.trim() || clientSessionId.length > 128) {
    return res.status(400).json({ success: false, message: 'A valid client session ID is required.' });
  }
  if (!['walking', 'running'].includes(activityType) || !['active', 'completed'].includes(status)) {
    return res.status(400).json({ success: false, message: 'A valid activity type and session status are required.' });
  }
  if (!startedAt || Number.isNaN(start.getTime()) || start.getTime() > Date.now() + 5 * 60 * 1000) {
    return res.status(400).json({ success: false, message: 'The session start time is invalid.' });
  }
  if (status === 'completed' && (!end || Number.isNaN(end.getTime()) || end <= start)) {
    return res.status(400).json({ success: false, message: 'A completed session must have a valid end time after it started.' });
  }
  if (status === 'active' && end) {
    return res.status(400).json({ success: false, message: 'An active session cannot have an end time.' });
  }
  if (steps !== undefined && (!Number.isInteger(steps) || steps < 0 || steps > 200000)) {
    return res.status(400).json({ success: false, message: 'Session steps must be a whole number between 0 and 200000.' });
  }
  const metrics = [
    [distanceMeters, 1000000],
    [averagePaceSecondsPerKm, 86400],
    [caloriesBurned, 20000],
  ];
  if (metrics.some(([value, max]) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > max))) {
    return res.status(400).json({ success: false, message: 'Session metrics are outside supported limits.' });
  }
  if (!Array.isArray(route) || route.length > 5000 || route.some((point) => (
    !Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
    || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180
    || Number.isNaN(new Date(point.timestamp).getTime())
    || (point.accuracyMeters !== undefined && (!Number.isFinite(point.accuracyMeters) || point.accuracyMeters < 0))
  ))) {
    return res.status(400).json({ success: false, message: 'The route contains invalid location points.' });
  }

  const trackingPreferences = req.user.trackingPreferences || {};
  const existingSession = await ActivitySession.findOne({ user: req.user._id, clientSessionId });
  if (existingSession?.status === 'completed') {
    return res.status(200).json({ success: true, session: existingSession });
  }
  if (!existingSession && (!trackingPreferences.enabled || trackingPreferences.paused)) {
    return res.status(403).json({ success: false, message: 'Enable and resume automatic tracking before starting a session.' });
  }
  const safeRoute = trackingPreferences.storeRoute ? route : [];
  const session = await ActivitySession.findOneAndUpdate(
    { user: req.user._id, clientSessionId },
    {
      $set: {
        activityType,
        status,
        startedAt: start,
        endedAt: end,
        durationSeconds: end ? Math.floor((end.getTime() - start.getTime()) / 1000) : 0,
        ...(steps === undefined ? {} : { steps }),
        distanceMeters: distanceMeters ?? 0,
        averagePaceSecondsPerKm: averagePaceSecondsPerKm ?? 0,
        caloriesBurned: caloriesBurned ?? 0,
        route: safeRoute,
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  return res.status(200).json({ success: true, session });
}

async function listActivitySessions(req, res) {
  const sessions = await ActivitySession.find({ user: req.user._id })
    .sort({ startedAt: -1 })
    .limit(50);
  return res.status(200).json({ success: true, sessions });
}

module.exports = {
  getTrackingPreferences,
  updateTrackingPreferences,
  syncDailySteps,
  syncActivitySession,
  listActivitySessions,
  isValidDayKey,
};
