const Recommendation = require('../models/Recommendation');
const Workout = require('../models/Workout');
const { buildRecommendation } = require('../services/recommendationEngine');

async function getRecommendationPreview(req, res) {
  const [workouts, feedback] = await Promise.all([
    Workout.find({ user: req.user._id }).sort({ workoutDate: -1 }).limit(10),
    Recommendation.find({ user: req.user._id, feedback: { $ne: 'pending' } }).sort({ createdAt: -1 }).limit(20),
  ]);
  return res.status(200).json({
    success: true,
    recommendation: buildRecommendation(req.user, workouts, feedback),
  });
}

async function getRecommendations(req, res) {
  const user = req.user;
  const [workouts, feedback] = await Promise.all([
    Workout.find({ user: user._id }).sort({ workoutDate: -1 }).limit(10),
    Recommendation.find({ user: user._id, feedback: { $ne: 'pending' } }).sort({ createdAt: -1 }).limit(20),
  ]);
  const recommendation = buildRecommendation(user, workouts, feedback);

  const record = await Recommendation.create({
    user: user._id,
    title: recommendation.title,
    rationale: recommendation.rationale,
    workoutType: recommendation.workoutType,
    alternatives: recommendation.alternatives,
    reasonScore: recommendation.reasonScore,
  });

  return res.status(200).json({ success: true, recommendation, record });
}

async function listRecommendations(req, res) {
  const items = await Recommendation.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(10);
  res.status(200).json({ success: true, recommendations: items });
}

async function submitRecommendationFeedback(req, res) {
  const { feedback, selectedOption } = req.body;
  if (!['accepted', 'rejected'].includes(feedback)) {
    return res.status(400).json({ success: false, message: 'Feedback must be accepted or rejected.' });
  }

  const recommendation = await Recommendation.findOne({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!recommendation) {
    return res.status(404).json({ success: false, message: 'Recommendation not found.' });
  }

  recommendation.feedback = feedback;
  recommendation.accepted = feedback === 'accepted';
  recommendation.selectedOption = typeof selectedOption === 'string' ? selectedOption : '';
  await recommendation.save();

  return res.status(200).json({ success: true, recommendation });
}

module.exports = { getRecommendationPreview, getRecommendations, listRecommendations, submitRecommendationFeedback };
