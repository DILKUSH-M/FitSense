const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRecommendation } = require('../services/recommendationEngine');

test('buildRecommendation prefers upper-body when legs were recently trained', () => {
  const user = {
    goal: 'Muscle building',
    availableWorkoutDuration: 20,
    energyLevel: 'Moderate',
  };

  const workouts = [
    { category: 'Legs', workoutDate: new Date().toISOString() },
    { category: 'Legs', workoutDate: new Date(Date.now() - 86400000).toISOString() },
  ];

  const recommendation = buildRecommendation(user, workouts);
  assert.match(recommendation.title, /Upper-body|upper-body/i);
  assert.ok(recommendation.rationale.length >= 2);
});

test('buildRecommendation produces a low-impact option when energy is low', () => {
  const user = {
    goal: 'General fitness',
    availableWorkoutDuration: 15,
    energyLevel: 'Low',
  };

  const recommendation = buildRecommendation(user, []);
  assert.match(recommendation.title, /Low-impact|low-impact/i);
  assert.ok(recommendation.reasonScore > 0);
});

test('buildRecommendation avoids a recently rejected suggestion when an alternative exists', () => {
  const user = {
    goal: 'Muscle building',
    availableWorkoutDuration: 30,
    energyLevel: 'Moderate',
  };

  const suggestion = buildRecommendation(user, [], [
    { title: 'Upper-body strength circuit', selectedOption: 'Upper-body strength circuit', feedback: 'rejected' },
  ]);

  assert.notEqual(suggestion.title, 'Upper-body strength circuit');
  assert.ok(suggestion.rationale.some((item) => item.includes('previous feedback')));
});
