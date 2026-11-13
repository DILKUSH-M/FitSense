const express = require('express');
const { getPrivacyPreferences, updatePrivacyPreferences, exportUserData, deleteAccount } = require('../controllers/privacyController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', getPrivacyPreferences);
router.put('/', updatePrivacyPreferences);
router.get('/export', exportUserData);
router.delete('/account', deleteAccount);

module.exports = router;
