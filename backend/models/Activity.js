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
  source: { type: String, enum: ['manual', 'estimated', 'automatic'], default: 'manual' },
  notes: { type: String, default: '' },
}, { timestamps: true });

activitySchema.index({ user: 1, date: -1 });
module.exports = mongoose.model('Activity', activitySchema);
