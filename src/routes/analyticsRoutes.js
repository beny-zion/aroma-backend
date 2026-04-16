const express = require('express');
const router = express.Router();
const { analyticsAuth } = require('../middleware/analyticsAuth');
const {
  trackEvent,
  verifyPassword,
  getOverview,
  getEvents
} = require('../controllers/analyticsController');

// Public: tracking endpoint
router.post('/track', trackEvent);

// Protected: admin dashboard endpoints
router.post('/admin/verify', analyticsAuth, verifyPassword);
router.get('/admin/overview', analyticsAuth, getOverview);
router.get('/admin/events', analyticsAuth, getEvents);

module.exports = router;
