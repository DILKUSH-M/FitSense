require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Workout = require('../models/Workout');
const Activity = require('../models/Activity');
const Nutrition = require('../models/Nutrition');
const Exercise = require('../models/Exercise');

const exerciseLibrary = [
  { name: 'Barbell Squat', category: 'Legs', description: 'Compound lower-body strength move.', muscleGroup: 'Quadriceps, glutes', instructions: ['Brace core.', 'Lower hips back and down.', 'Drive through feet to stand.'] },
  { name: 'Push-Up', category: 'Chest', description: 'Upper-body bodyweight movement.', muscleGroup: 'Chest, shoulders', instructions: ['Keep body straight.', 'Lower elbows to about 90°.', 'Press away without sagging.'] },
  { name: 'Biceps Curl', category: 'Arms', description: 'Arm isolation movement.', muscleGroup: 'Biceps', instructions: ['Keep elbows still.', 'Curl without swinging.', 'Lower with control.'] },
  { name: 'Deadlift', category: 'Back', description: 'Posterior chain strength exercise.', muscleGroup: 'Hamstrings, glutes, back', instructions: ['Hinge from hips.', 'Brace core.', 'Stand tall.'] },
];

async function seed() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fitsense';
  await mongoose.connect(mongoUri);

  await User.deleteMany({});
  await Workout.deleteMany({});
  await Activity.deleteMany({});
  await Nutrition.deleteMany({});
  await Exercise.deleteMany({});

  const user = await User.create({
    name: 'Aisha Patel',
    email: 'aisha@fitsense.app',
    password: '$2a$10$6y0gD7l0/5f3ohmEswVv1uK3M5W0DRN.o0w1c4AqvZ3xU1rVKm5vC',
    age: 22,
    height: 165,
    weight: 58,
    goal: 'Muscle building',
    fitnessExperience: 'Intermediate',
    preferredWorkoutType: 'Strength training',
    availableWorkoutDuration: 30,
    weeklyWorkoutTarget: 4,
    energyLevel: 'Moderate',
  });

  await Exercise.insertMany(exerciseLibrary);

  await Workout.insertMany([
    { user: user._id, exerciseName: 'Barbell Squat', category: 'Legs', sets: 4, reps: 8, weight: 60, durationMinutes: 40, workoutDate: new Date(Date.now() - 86400000 * 2), notes: 'Good depth and control.' },
    { user: user._id, exerciseName: 'Push-Up', category: 'Chest', sets: 3, reps: 12, weight: 0, durationMinutes: 20, workoutDate: new Date(Date.now() - 86400000 * 1), notes: 'Stable posture.' },
  ]);

  await Activity.insertMany([
    { user: user._id, date: new Date(Date.now() - 86400000 * 3), steps: 8600, distanceKm: 6.4, caloriesBurned: 420, activeMinutes: 50, goal: 8000, source: 'manual' },
    { user: user._id, date: new Date(Date.now() - 86400000 * 2), steps: 9100, distanceKm: 6.8, caloriesBurned: 500, activeMinutes: 55, goal: 8000, source: 'estimated' },
  ]);

  await Nutrition.insertMany([
    { user: user._id, mealType: 'Breakfast', foodName: 'Greek Yogurt Bowl', quantity: '1 bowl', calories: 320, protein: 25, carbs: 28, fat: 12, intakeDate: new Date(Date.now() - 86400000 * 1) },
    { user: user._id, mealType: 'Lunch', foodName: 'Chicken Rice Bowl', quantity: '1 serving', calories: 520, protein: 38, carbs: 52, fat: 14, intakeDate: new Date(Date.now() - 86400000 * 1) },
  ]);

  console.log('Seed complete');
  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
