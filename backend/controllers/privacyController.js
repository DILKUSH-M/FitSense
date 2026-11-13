const User = require('../models/User');
const Workout = require('../models/Workout');
const Activity = require('../models/Activity');
const Nutrition = require('../models/Nutrition');
const Recommendation = require('../models/Recommendation');
const ActivitySession = require('../models/ActivitySession');
const DailyStepSummary = require('../models/DailyStepSummary');

async function getPrivacyPreferences(req, res) {
  const user = await User.findById(req.user._id).select('privacyPreferences email name');
  return res.status(200).json({ success: true, privacyPreferences: user.privacyPreferences });
}

async function updatePrivacyPreferences(req, res) {
  const user = await User.findById(req.user._id);
  const allowedFields = ['shareData', 'allowVideoMetrics', 'exportData'];
  for (const field of allowedFields) {
    if (typeof req.body[field] === 'boolean') {
      user.privacyPreferences[field] = req.body[field];
    }
  }
  await user.save();

  return res.status(200).json({ success: true, privacyPreferences: user.privacyPreferences });
}

async function exportUserData(req, res) {
  const userId = req.user._id;
  const [user, workouts, activities, nutrition, recommendations, activitySessions, dailyStepSummaries] = await Promise.all([
    User.findById(userId).select('-password'),
    Workout.find({ user: userId }).lean(),
    Activity.find({ user: userId }).lean(),
    Nutrition.find({ user: userId }).lean(),
    Recommendation.find({ user: userId }).lean(),
    ActivitySession.find({ user: userId }).lean(),
    DailyStepSummary.find({ user: userId }).lean(),
  ]);
  return res.status(200).json({
    success: true,
    export: {
      exportedAt: new Date().toISOString(),
      user,
      workouts,
      activities,
      nutrition,
      recommendations,
      activitySessions,
      dailyStepSummaries,
    },
  });
}

async function deleteAccount(req, res) {
  const userId = req.user._id;
  await Promise.all([
    Workout.deleteMany({ user: userId }),
    Activity.deleteMany({ user: userId }),
    Nutrition.deleteMany({ user: userId }),
    Recommendation.deleteMany({ user: userId }),
    ActivitySession.deleteMany({ user: userId }),
    DailyStepSummary.deleteMany({ user: userId }),
    User.findByIdAndDelete(userId),
  ]);
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res.status(200).json({ success: true, message: 'Account deleted.' });
}

module.exports = { getPrivacyPreferences, updatePrivacyPreferences, exportUserData, deleteAccount };
