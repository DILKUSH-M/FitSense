const express = require('express');
const { listWorkouts, createWorkout, updateWorkout, deleteWorkout } = require('../controllers/workoutController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/').get(listWorkouts).post(createWorkout);
router.route('/:id').put(updateWorkout).delete(deleteWorkout);

module.exports = router;
