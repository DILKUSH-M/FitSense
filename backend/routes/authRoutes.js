const express = require('express');
const {
  registerUser,
  loginUser,
  mobileRegisterUser,
  mobileLoginUser,
  getCurrentUser,
  updateProfile,
  logoutUser,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/mobile/register', mobileRegisterUser);
router.post('/mobile/login', mobileLoginUser);
router.post('/logout', protect, logoutUser);
router.get('/me', protect, getCurrentUser);
router.put('/profile', protect, updateProfile);

module.exports = router;
