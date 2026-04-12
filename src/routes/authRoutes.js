const express = require('express');
const router = express.Router();
const { login, register, getMe, refresh, logout } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.post('/register', protect, authorize('admin'), register);

module.exports = router;
