function buildRecommendation(user, workouts = [], feedback = []) {
  const today = new Date();
  const recentWorkouts = [...workouts].sort((a, b) => new Date(b.workoutDate) - new Date(a.workoutDate));
  const lastWorkout = recentWorkouts[0];
  const recentCategories = recentWorkouts.slice(0, 3).map((item) => item.category);
  const categoryFrequency = recentCategories.reduce((acc, category) => {
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const energy = user.energyLevel || 'Moderate';
  const availableMinutes = user.availableWorkoutDuration || 30;
  const goal = user.goal || 'General fitness';
  const isLowerBodyRecovery = recentCategories.includes('Legs');

  let recommendation = 'Upper-body strength circuit';
  let rationale = [
    'Your recent history suggests lower-body work is already covered.',
    `You have ${availableMinutes} minutes available today.`,
    `Your current goal is ${goal}.`,
    `Your reported energy level is ${energy.toLowerCase()}.`,
  ];
  let alternatives = ['Short mobility reset', 'Core and conditioning circuit', 'Restorative recovery flow'];

  if (energy === 'Low') {
    recommendation = 'Low-impact mobility and core session';
    rationale = [
      'Low energy usually benefits from a lower-load session.',
      'Your recent training load suggests recovery is useful right now.',
      `You have ${availableMinutes} minutes available, which fits a short session.`,
    ];
    alternatives = ['20-minute full-body circuit', 'Light cardio block', 'Stretching and posture reset'];
  } else if (isLowerBodyRecovery) {
    recommendation = 'Upper-body hypertrophy circuit';
    rationale = [
      'You trained your lower body in your previous session.',
      'Your activity history shows fewer recent upper-body focus sessions.',
      `The workout duration is aligned with your ${availableMinutes}-minute window.`,
      'This recommendation supports your muscle-building goal without overloading the same muscle group.',
    ];
    alternatives = ['Push and pull ladder', 'Shoulder stability block', 'Short interval conditioning'];
  } else if (goal === 'Strength improvement') {
    recommendation = 'Compound strength session';
    rationale = [
      'Your profile prioritizes strength improvement.',
      'The suggestion includes compound patterns that match your long-term progression plan.',
      `You have ${availableMinutes} minutes, so the routine is compact but high quality.`,
    ];
    alternatives = ['Power-focused interval set', 'Lower-body strength emphasis', 'Endurance-assisted strength circuit'];
  } else if (goal === 'Weight management') {
    recommendation = 'Conditioning and calorie burn circuit';
    rationale = [
      'Your goal is weight management, so the plan prioritizes calorie expenditure and consistency.',
      'The session is time-efficient and structured for a busy schedule.',
      'The workout avoids repeating the same pattern unnecessarily.',
    ];
    alternatives = ['30-minute cardio interval block', 'Full-body circuit', 'Low-impact cardio recovery'];
  }

  const rejectedOptions = new Set(
    feedback
      .filter((item) => item.feedback === 'rejected')
      .map((item) => item.selectedOption || item.title),
  );
  if (rejectedOptions.has(recommendation)) {
    const previousRecommendation = recommendation;
    const nextRecommendation = alternatives.find((option) => !rejectedOptions.has(option));
    if (nextRecommendation) {
      recommendation = nextRecommendation;
      alternatives = alternatives.filter((option) => option !== nextRecommendation);
      if (!rejectedOptions.has(previousRecommendation)) alternatives.unshift(previousRecommendation);
      rationale.push(`Your previous feedback did not favor ${previousRecommendation}, so this suggestion uses another option.`);
    }
  }
  alternatives = alternatives.filter((option) => !rejectedOptions.has(option));

  const reasonScore = Math.max(70, (availableMinutes * 1.4) + (Object.keys(categoryFrequency).length * 8) + 15);

  return {
    title: recommendation,
    rationale,
    alternatives,
    workoutType: goal,
    reasonScore: Math.min(98, Math.round(reasonScore)),
    generatedAt: today.toISOString(),
  };
}

module.exports = { buildRecommendation };
