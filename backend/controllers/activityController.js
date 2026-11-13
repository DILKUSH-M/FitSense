const Activity = require('../models/Activity');

async function listActivities(req, res) {
  const activities = await Activity.find({ user: req.user._id }).sort({ date: -1 });
  res.status(200).json({ success: true, activities });
}

async function createActivity(req, res) {
  const activity = await Activity.create({ ...req.body, user: req.user._id });
  res.status(201).json({ success: true, activity });
}

async function updateActivity(req, res) {
  const activity = await Activity.findOne({ _id: req.params.id, user: req.user._id });
  if (!activity) {
    return res.status(404).json({ success: false, message: 'Activity not found.' });
  }

  const allowedFields = ['date', 'steps', 'distanceKm', 'caloriesBurned', 'activeMinutes', 'waterIntakeMl', 'goal', 'source', 'notes'];
  for (const field of allowedFields) {
    if (Object.hasOwn(req.body, field)) activity[field] = req.body[field];
  }
  await activity.save();
  res.status(200).json({ success: true, activity });
}

async function deleteActivity(req, res) {
  const result = await Activity.deleteOne({ _id: req.params.id, user: req.user._id });
  if (result.deletedCount === 0) return res.status(404).json({ success: false, message: 'Activity not found.' });

  res.status(200).json({ success: true, message: 'Activity deleted.' });
}

module.exports = { listActivities, createActivity, updateActivity, deleteActivity };
