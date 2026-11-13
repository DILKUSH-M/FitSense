const express = require('express');
const { getDashboardSummary, getAnalytics } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/summary', getDashboardSummary);
router.get('/analytics', getAnalytics);

module.exports = router;
