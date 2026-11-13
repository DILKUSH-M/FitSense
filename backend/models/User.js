const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  age: { type: Number, min: 13, max: 120, default: 28 },
  height: { type: Number, min: 80, max: 250, default: 170 },
  weight: { type: Number, min: 25, max: 400, default: 68 },
  fitnessExperience: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
  goal: { type: String, enum: ['Weight management', 'Muscle building', 'Strength improvement', 'General fitness', 'Flexibility and mobility', 'Maintaining physical activity'], default: 'General fitness' },
  preferredWorkoutType: { type: String, trim: true, maxlength: 60, default: 'Strength training' },
  availableWorkoutDuration: { type: Number, min: 5, max: 240, default: 30 },
  weeklyWorkoutTarget: { type: Number, min: 1, max: 14, default: 4 },
  energyLevel: { type: String, default: 'Moderate' },
  privacyPreferences: {
    shareData: { type: Boolean, default: false },
    allowVideoMetrics: { type: Boolean, default: true },
    exportData: { type: Boolean, default: true },
  },
  trackingPreferences: {
    enabled: { type: Boolean, default: false },
    paused: { type: Boolean, default: false },
    dailyStepsEnabled: { type: Boolean, default: false },
    storeRoute: { type: Boolean, default: false },
    stationaryEndMinutes: { type: Number, min: 2, max: 60, default: 5 },
    timeZone: { type: String, trim: true, maxlength: 100, default: 'UTC' },
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
