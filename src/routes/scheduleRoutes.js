const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { suggestSchedule, saveSchedule } = require('../controllers/scheduleController');

router.use(protect);
router.use(authorize('admin', 'manager', 'secretary'));

router.post('/suggest', suggestSchedule);
router.post('/save', saveSchedule);

module.exports = router;
