const express = require('express');
const { listActivities, createActivity, updateActivity, deleteActivity } = require('../controllers/activityController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/').get(listActivities).post(createActivity);
router.route('/:id').put(updateActivity).delete(deleteActivity);

module.exports = router;
