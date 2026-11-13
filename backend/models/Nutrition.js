const mongoose = require('mongoose');

const nutritionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mealType: { type: String, enum: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'], required: true },
  foodName: { type: String, required: true, trim: true, maxlength: 100 },
  quantity: { type: String, maxlength: 50, default: '1 serving' },
  calories: { type: Number, min: 0, max: 20000, default: 0 },
  protein: { type: Number, min: 0, max: 2000, default: 0 },
  carbs: { type: Number, min: 0, max: 2000, default: 0 },
  fat: { type: Number, min: 0, max: 2000, default: 0 },
  intakeDate: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

nutritionSchema.index({ user: 1, intakeDate: -1 });
module.exports = mongoose.model('Nutrition', nutritionSchema);
