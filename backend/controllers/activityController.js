const Activity = require('../models/Activity');
const { dayKeyAt, isValidDayKey } = require('../utils/calendar');

const metricFields = ['steps', 'distanceKm', 'caloriesBurned', 'activeMinutes', 'waterIntakeMl'];
const metricLimits = {
  steps: 200000,
  distanceKm: 1000,
  caloriesBurned: 20000,
  activeMinutes: 1440,
  waterIntakeMl: 20000,
};

function hasInvalidMetric(body) {
  return metricFields.find((field) => (
    Object.hasOwn(body, field)
    && (
      typeof body[field] !== 'number'
      || !Number.isFinite(body[field])
      || body[field] < 0
      || body[field] > metricLimits[field]
      || (field === 'steps' && !Number.isInteger(body[field]))
    )
  ));
}

function sourceForUser(value) {
  if (value === undefined || value === 'manual' || value === 'user_entered') return 'user_entered';
  if (value === 'estimated') return 'estimated';
  return null;
}

function getDayKey(date, requestedDayKey, timeZone) {
  if (requestedDayKey !== undefined) {
    if (!isValidDayKey(requestedDayKey)) throw new TypeError('Enter a real activity date in YYYY-MM-DD format.');
    return requestedDayKey;
  }
  return dayKeyAt(date, timeZone);
}

async function listActivities(req, res) {
  const activities = await Activity.find({ user: req.user._id }).sort({ date: -1 });
  res.status(200).json({ success: true, activities });
}

async function createActivity(req, res) {
  const source = sourceForUser(req.body.source);
  if (!source) {
    return res.status(400).json({ success: false, message: 'Activity source must be a user entry or a user estimate.' });
  }
  const availableMetrics = metricFields.filter((field) => Object.hasOwn(req.body, field));
  if (availableMetrics.length === 0) {
    return res.status(400).json({ success: false, message: 'Enter at least one activity measurement.' });
  }
  const invalidMetric = hasInvalidMetric(req.body);
  if (invalidMetric) {
    return res.status(400).json({ success: false, message: `${invalidMetric} must be a valid non-negative measurement.` });
  }
  const date = req.body.date === undefined ? new Date() : new Date(req.body.date);
  if (Number.isNaN(date.getTime())) {
    return res.status(400).json({ success: false, message: 'Enter a valid activity date.' });
  }

  let dayKey;
  try {
    dayKey = getDayKey(date, req.body.dayKey, req.user.trackingPreferences?.timeZone || 'UTC');
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  const activity = await Activity.create({
    user: req.user._id,
    date,
    dayKey,
    steps: req.body.steps,
    distanceKm: req.body.distanceKm,
    caloriesBurned: req.body.caloriesBurned,
    activeMinutes: req.body.activeMinutes,
    waterIntakeMl: req.body.waterIntakeMl,
    goal: req.body.goal,
    notes: req.body.notes,
    source,
    sourceMetadata: { enteredBy: 'user' },
    availableMetrics,
  });
  res.status(201).json({ success: true, activity });
}

async function updateActivity(req, res) {
  const activity = await Activity.findOne({ _id: req.params.id, user: req.user._id });
  if (!activity) {
    return res.status(404).json({ success: false, message: 'Activity not found.' });
  }
  if (activity.historicalBaseline) {
    return res.status(409).json({ success: false, message: 'Historical sample records are read-only. Add a new activity to record your own data.' });
  }

  if (Object.hasOwn(req.body, 'source')) {
    const source = sourceForUser(req.body.source);
    if (!source) {
      return res.status(400).json({ success: false, message: 'Activity source must be a user entry or a user estimate.' });
    }
    const invalidMetric = hasInvalidMetric(req.body);
    if (invalidMetric) {
      return res.status(400).json({ success: false, message: `${invalidMetric} must be a valid non-negative measurement.` });
    }
    activity.source = source;
  }
  if (Object.hasOwn(req.body, 'date')) {
    const date = new Date(req.body.date);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ success: false, message: 'Enter a valid activity date.' });
    }
    activity.date = date;
    try {
      activity.dayKey = getDayKey(date, req.body.dayKey, req.user.trackingPreferences?.timeZone || 'UTC');
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  } else if (Object.hasOwn(req.body, 'dayKey')) {
    if (!isValidDayKey(req.body.dayKey)) {
      return res.status(400).json({ success: false, message: 'Enter a real activity date in YYYY-MM-DD format.' });
    }
    activity.dayKey = req.body.dayKey;
  }
  for (const field of metricFields) {
    if (Object.hasOwn(req.body, field)) activity[field] = req.body[field];
  }
  const changedMetrics = metricFields.filter((field) => Object.hasOwn(req.body, field));
  if (changedMetrics.length) {
    const knownMetrics = new Set(Array.isArray(activity.availableMetrics)
      ? activity.availableMetrics
      : metricFields.filter((field) => Number(activity[field]) !== 0));
    changedMetrics.forEach((field) => knownMetrics.add(field));
    activity.availableMetrics = [...knownMetrics];
  }
  if (Object.hasOwn(req.body, 'goal')) activity.goal = req.body.goal;
  if (Object.hasOwn(req.body, 'notes')) activity.notes = req.body.notes;
  activity.sourceMetadata = { ...(activity.sourceMetadata || {}), enteredBy: 'user' };
  await activity.save();
  res.status(200).json({ success: true, activity });
}

async function deleteActivity(req, res) {
  const activity = await Activity.findOne({ _id: req.params.id, user: req.user._id });
  if (!activity) return res.status(404).json({ success: false, message: 'Activity not found.' });
  if (activity.historicalBaseline) {
    return res.status(409).json({ success: false, message: 'Historical sample records are read-only.' });
  }
  const result = await Activity.deleteOne({ _id: req.params.id, user: req.user._id });

  res.status(200).json({ success: true, message: 'Activity deleted.' });
}

module.exports = { listActivities, createActivity, updateActivity, deleteActivity };
