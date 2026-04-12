const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/adminController');

// GET /api/admin/stats - Get comprehensive dashboard statistics
router.get('/stats', getDashboardStats);

module.exports = router;
