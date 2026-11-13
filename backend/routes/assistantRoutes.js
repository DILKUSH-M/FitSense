const express = require('express');
const { replyToAssistant } = require('../controllers/assistantController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.post('/message', replyToAssistant);

module.exports = router;
