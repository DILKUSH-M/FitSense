const mongoose = require('mongoose');

const routePointSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  timestamp: { type: Date, required: true },
  accuracyMeters: { type: Number, min: 0, max: 1000 },
}, { _id: false });

const activitySessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientSessionId: { type: String, required: true, trim: true, maxlength: 128 },
  activityType: { type: String, enum: ['walking', 'running'], required: true },
  status: { type: String, enum: ['active', 'completed'], required: true, default: 'active' },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date },
  durationSeconds: { type: Number, min: 0, max: 604800, default: 0 },
  steps: { type: Number, min: 0, max: 200000 },
  distanceMeters: { type: Number, min: 0, max: 1000000, default: 0 },
  averagePaceSecondsPerKm: { type: Number, min: 0, max: 86400, default: 0 },
  caloriesBurned: { type: Number, min: 0, max: 20000, default: 0 },
  route: { type: [routePointSchema], default: [] },
}, { timestamps: true });

activitySessionSchema.index({ user: 1, clientSessionId: 1 }, { unique: true });
activitySessionSchema.index({ user: 1, startedAt: -1 });
activitySessionSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('ActivitySession', activitySessionSchema);
