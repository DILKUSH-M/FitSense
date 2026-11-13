const express = require('express');
const { getRecommendationPreview, getRecommendations, listRecommendations, submitRecommendationFeedback } = require('../controllers/recommendationController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/preview', getRecommendationPreview);
router.get('/', getRecommendations);
router.get('/history', listRecommendations);
router.patch('/:id/feedback', submitRecommendationFeedback);

module.exports = router;
