const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true, default: Date.now },
  steps: { type: Number, min: 0, max: 200000, default: 0 },
  distanceKm: { type: Number, min: 0, max: 1000, default: 0 },
  caloriesBurned: { type: Number, min: 0, max: 20000, default: 0 },
  activeMinutes: { type: Number, min: 0, max: 1440, default: 0 },
  waterIntakeMl: { type: Number, min: 0, max: 20000, default: 0 },
  goal: { type: Number, min: 1, max: 200000, default: 8000 },
  source: {
    type: String,
    enum: ['manual', 'estimated', 'automatic', 'public_dataset', 'sample_generated', 'user_entered', 'mixed'],
    default: 'user_entered',
  },
  sourceMetadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
  availableMetrics: {
    type: [String],
    enum: ['steps', 'distanceKm', 'caloriesBurned', 'activeMinutes', 'waterIntakeMl'],
    default: undefined,
  },
  dayKey: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  historicalBaseline: { type: Boolean, default: false },
  notes: { type: String, default: '' },
}, { timestamps: true });

activitySchema.index({ user: 1, date: -1 });
activitySchema.index(
  { user: 1, dayKey: 1 },
  { unique: true, partialFilterExpression: { historicalBaseline: true } },
);
module.exports = mongoose.model('Activity', activitySchema);
