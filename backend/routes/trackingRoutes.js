const express = require('express');
const {
  getTrackingPreferences,
  updateTrackingPreferences,
  syncDailySteps,
  syncActivitySession,
  listActivitySessions,
} = require('../controllers/trackingController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/preferences').get(getTrackingPreferences).put(updateTrackingPreferences);
router.put('/daily-steps/:dayKey', syncDailySteps);
router.route('/sessions').get(listActivitySessions);
router.put('/sessions/:clientSessionId', syncActivitySession);

module.exports = router;
