const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getRevenueReport } = require('../controllers/reportsController');

router.use(protect);
router.use(authorize('admin', 'manager'));

router.get('/revenue', getRevenueReport);

module.exports = router;
