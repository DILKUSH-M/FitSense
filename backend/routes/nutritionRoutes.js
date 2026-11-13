const express = require('express');
const { listNutrition, createNutritionEntry, updateNutritionEntry, deleteNutritionEntry } = require('../controllers/nutritionController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/').get(listNutrition).post(createNutritionEntry);
router.route('/:id').put(updateNutritionEntry).delete(deleteNutritionEntry);

module.exports = router;
