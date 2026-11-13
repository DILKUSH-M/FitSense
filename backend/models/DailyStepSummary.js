const mongoose = require('mongoose');

const dailyStepSummarySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dayKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  timeZone: { type: String, required: true, maxlength: 100 },
  source: { type: String, enum: ['health_connect', 'android_sensor'], required: true },
  steps: { type: Number, required: true, min: 0, max: 200000 },
  distanceMeters: { type: Number, min: 0, max: 1000000, default: 0 },
  activeMinutes: { type: Number, min: 0, max: 1440, default: 0 },
  caloriesBurned: { type: Number, min: 0, max: 20000, default: 0 },
  synchronizedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

dailyStepSummarySchema.index({ user: 1, dayKey: 1 }, { unique: true });
dailyStepSummarySchema.index({ user: 1, dayKey: -1 });

module.exports = mongoose.model('DailyStepSummary', dailyStepSummarySchema);
