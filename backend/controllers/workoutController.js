const Workout = require('../models/Workout');
const { dayKeyAt, isValidDayKey } = require('../utils/calendar');

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
  const workoutDate = req.body.workoutDate === undefined ? new Date() : new Date(req.body.workoutDate);
  if (Number.isNaN(workoutDate.getTime())) {
    return res.status(400).json({ success: false, message: 'Enter a valid workout date.' });
  }
  let dayKey;
  try {
    dayKey = req.body.dayKey === undefined
      ? dayKeyAt(workoutDate, req.user.trackingPreferences?.timeZone || 'UTC')
      : req.body.dayKey;
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (!isValidDayKey(dayKey)) {
    return res.status(400).json({ success: false, message: 'Enter a real workout date in YYYY-MM-DD format.' });
  }
  const allowedFields = ['exerciseName', 'category', 'targetMuscleGroup', 'sets', 'reps', 'weight', 'durationMinutes', 'notes'];
  const payload = Object.fromEntries(
    allowedFields.filter((field) => Object.hasOwn(req.body, field)).map((field) => [field, req.body[field]]),
  );
  payload.user = req.user._id;
  payload.workoutDate = workoutDate;
  payload.dayKey = dayKey;
  payload.source = 'user_entered';
  payload.sourceMetadata = { enteredBy: 'user' };
  const workout = await Workout.create(payload);
  res.status(201).json({ success: true, workout });
}

async function updateWorkout(req, res) {
  const workout = await Workout.findOne({ _id: req.params.id, user: req.user._id });
  if (!workout) return res.status(404).json({ success: false, message: 'Workout not found.' });
  if (workout.historicalBaseline) {
    return res.status(409).json({ success: false, message: 'Historical sample workouts are read-only. Add a new workout to record your own training.' });
  }

  const allowedFields = ['exerciseName', 'category', 'targetMuscleGroup', 'sets', 'reps', 'weight', 'durationMinutes', 'workoutDate', 'notes'];
  for (const field of allowedFields) {
    if (Object.hasOwn(req.body, field)) workout[field] = req.body[field];
  }
  if (Object.hasOwn(req.body, 'workoutDate')) {
    const workoutDate = new Date(req.body.workoutDate);
    if (Number.isNaN(workoutDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Enter a valid workout date.' });
    }
    workout.workoutDate = workoutDate;
    workout.dayKey = req.body.dayKey === undefined
      ? dayKeyAt(workoutDate, req.user.trackingPreferences?.timeZone || 'UTC')
      : req.body.dayKey;
  } else if (Object.hasOwn(req.body, 'dayKey')) {
    workout.dayKey = req.body.dayKey;
  }
  if (!isValidDayKey(workout.dayKey)) {
    return res.status(400).json({ success: false, message: 'Enter a real workout date in YYYY-MM-DD format.' });
  }
  workout.source = 'user_entered';
  workout.sourceMetadata = { ...(workout.sourceMetadata || {}), enteredBy: 'user' };
  await workout.save();
  res.status(200).json({ success: true, workout });
}

async function deleteWorkout(req, res) {
  const workout = await Workout.findOne({ _id: req.params.id, user: req.user._id });
  if (!workout) return res.status(404).json({ success: false, message: 'Workout not found.' });
  if (workout.historicalBaseline) {
    return res.status(409).json({ success: false, message: 'Historical sample workouts are read-only.' });
  }
  const result = await Workout.deleteOne({ _id: req.params.id, user: req.user._id });

  res.status(200).json({ success: true, message: 'Workout deleted.' });
}

module.exports = { listWorkouts, createWorkout, updateWorkout, deleteWorkout };
