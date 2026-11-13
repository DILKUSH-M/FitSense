const Workout = require('../models/Workout');

async function listWorkouts(req, res) {
  const { page = 1, limit = 10, exercise } = req.query;
  const query = { user: req.user._id };

  if (exercise) {
    const escapedExercise = String(exercise).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.exerciseName = { $regex: escapedExercise, $options: 'i' };
  }

  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
  const workouts = await Workout.find(query)
    .sort({ workoutDate: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  const total = await Workout.countDocuments(query);
  res.status(200).json({ success: true, workouts, total, page: pageNumber, limit: pageSize });
}

async function createWorkout(req, res) {
  const payload = { ...req.body, user: req.user._id };
  const workout = await Workout.create(payload);
  res.status(201).json({ success: true, workout });
}

async function updateWorkout(req, res) {
  const workout = await Workout.findOne({ _id: req.params.id, user: req.user._id });
  if (!workout) return res.status(404).json({ success: false, message: 'Workout not found.' });

  const allowedFields = ['exerciseName', 'category', 'targetMuscleGroup', 'sets', 'reps', 'weight', 'durationMinutes', 'workoutDate', 'notes'];
  for (const field of allowedFields) {
    if (Object.hasOwn(req.body, field)) workout[field] = req.body[field];
  }
  await workout.save();
  res.status(200).json({ success: true, workout });
}

async function deleteWorkout(req, res) {
  const result = await Workout.deleteOne({ _id: req.params.id, user: req.user._id });
  if (result.deletedCount === 0) return res.status(404).json({ success: false, message: 'Workout not found.' });

  res.status(200).json({ success: true, message: 'Workout deleted.' });
}

module.exports = { listWorkouts, createWorkout, updateWorkout, deleteWorkout };
