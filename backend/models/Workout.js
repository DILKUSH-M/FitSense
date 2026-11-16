const mongoose = require('mongoose');

const workoutSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  exerciseName: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, enum: ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body', 'Cardio', 'Flexibility'], default: 'Full body' },
  targetMuscleGroup: { type: String, default: 'General' },
  sets: { type: Number, min: 1, max: 100, default: 3 },
  reps: { type: Number, min: 1, max: 1000, default: 10 },
  weight: { type: Number, min: 0, max: 10000, default: 0 },
  durationMinutes: { type: Number, min: 1, max: 1440, default: 30 },
  workoutDate: { type: Date, required: true, default: Date.now },
  dayKey: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  source: { type: String, enum: ['sample_generated', 'user_entered'], default: 'user_entered' },
  sourceMetadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
  historicalBaseline: { type: Boolean, default: false },
  historyRecordId: { type: String, trim: true },
  notes: { type: String, maxlength: 1000, default: '' },
}, { timestamps: true });

workoutSchema.index({ user: 1, workoutDate: -1 });
workoutSchema.index(
  { user: 1, historyRecordId: 1 },
  { unique: true, partialFilterExpression: { historyRecordId: { $exists: true } } },
);

module.exports = mongoose.model('Workout', workoutSchema);
