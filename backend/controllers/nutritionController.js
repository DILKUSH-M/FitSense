const Nutrition = require('../models/Nutrition');

async function listNutrition(req, res) {
  const items = await Nutrition.find({ user: req.user._id }).sort({ intakeDate: -1 });
  res.status(200).json({ success: true, items });
}

async function createNutritionEntry(req, res) {
  const item = await Nutrition.create({ ...req.body, user: req.user._id });
  res.status(201).json({ success: true, item });
}

async function updateNutritionEntry(req, res) {
  const item = await Nutrition.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: 'Meal not found.' });

  const allowedFields = ['mealType', 'foodName', 'quantity', 'calories', 'protein', 'carbs', 'fat', 'intakeDate'];
  for (const field of allowedFields) {
    if (Object.hasOwn(req.body, field)) item[field] = req.body[field];
  }
  await item.save();
  res.status(200).json({ success: true, item });
}

async function deleteNutritionEntry(req, res) {
  const result = await Nutrition.deleteOne({ _id: req.params.id, user: req.user._id });
  if (result.deletedCount === 0) return res.status(404).json({ success: false, message: 'Meal not found.' });

  res.status(200).json({ success: true, message: 'Meal deleted.' });
}

module.exports = { listNutrition, createNutritionEntry, updateNutritionEntry, deleteNutritionEntry };
