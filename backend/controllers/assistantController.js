const Workout = require('../models/Workout');
const Recommendation = require('../models/Recommendation');
const { buildRecommendation } = require('../services/recommendationEngine');

async function replyToAssistant(req, res) {
  const prompt = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!prompt || prompt.length > 1000) {
    return res.status(400).json({ success: false, message: 'Enter a message between 1 and 1000 characters.' });
  }

  const userId = req.user._id;
  const [workouts, feedback] = await Promise.all([
    Workout.find({ user: userId }).sort({ workoutDate: -1 }).limit(100).lean(),
    Recommendation.find({ user: userId, feedback: { $ne: 'pending' } }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const normalizedPrompt = prompt.toLowerCase();
  let reply;
  let recommendation;

  if (normalizedPrompt.includes('least') || normalizedPrompt.includes('muscle group') || normalizedPrompt.includes('trained')) {
    const categories = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body', 'Cardio', 'Flexibility'];
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);
    const counts = workouts
      .filter((workout) => new Date(workout.workoutDate) >= lastMonth)
      .reduce((result, workout) => {
        result[workout.category] = (result[workout.category] || 0) + 1;
        return result;
      }, {});
    const leastTrained = categories
      .map((category) => ({ category, count: counts[category] || 0 }))
      .sort((a, b) => a.count - b.count)
      .slice(0, 3);
    reply = workouts.length
      ? `From the workout records available for the last 30 days, your least logged categories are ${leastTrained.map(({ category, count }) => `${category} (${count})`).join(', ')}. This only reflects sessions you logged.`
      : 'I do not have workout records yet, so I cannot identify your least-trained muscle groups. Log a session and ask me again.';
  } else if (normalizedPrompt.includes('consisten') || normalizedPrompt.includes('this month')) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = workouts.filter((workout) => new Date(workout.workoutDate) >= monthStart).length;
    const previousMonth = workouts.filter((workout) => {
      const date = new Date(workout.workoutDate);
      return date >= previousMonthStart && date < monthStart;
    }).length;
    const difference = thisMonth - previousMonth;
    reply = `You logged ${thisMonth} workout${thisMonth === 1 ? '' : 's'} this month and ${previousMonth} last month. That is ${difference > 0 ? `${difference} more` : difference < 0 ? `${Math.abs(difference)} fewer` : 'the same number of'} logged sessions.`;
  } else {
    const durationMatch = normalizedPrompt.match(/(\d{1,3})\s*(?:minutes?|mins?)/);
    const availableWorkoutDuration = durationMatch
      ? Math.min(Number(durationMatch[1]), 180)
      : req.user.availableWorkoutDuration;
    const energyLevel = /\b(low|tired|exhausted)\b/.test(normalizedPrompt)
      ? 'Low'
      : req.user.energyLevel;
    recommendation = buildRecommendation(
      { ...req.user.toObject(), availableWorkoutDuration, energyLevel },
      workouts.slice(0, 10),
      feedback,
    );
    reply = `I suggest ${recommendation.title}. ${recommendation.rationale.join(' ')}`;
  }

  return res.status(200).json({ success: true, reply, recommendation });
}

module.exports = { replyToAssistant };
