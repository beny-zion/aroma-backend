const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { suggestSchedule, saveSchedule, getCalendarView } = require('../controllers/scheduleController');

router.use(protect);
router.use(authorize('admin', 'manager', 'secretary'));

router.get('/calendar', getCalendarView);
router.post('/suggest', suggestSchedule);
router.post('/save', saveSchedule);

module.exports = router;
