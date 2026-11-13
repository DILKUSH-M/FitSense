const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  muscleGroup: { type: String, default: 'General' },
  instructions: [{ type: String }],
  difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
}, { timestamps: true });

exerciseSchema.index({ category: 1, name: 1 });

module.exports = mongoose.model('Exercise', exerciseSchema);
