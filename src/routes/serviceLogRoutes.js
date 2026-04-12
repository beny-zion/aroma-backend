const express = require('express');
const router = express.Router();
const {
  getServiceLogs,
  getServiceLog,
  createServiceLog,
  updateServiceLog,
  deleteServiceLog,
  getDeviceHistory
} = require('../controllers/serviceLogController');

// Route מיוחד להיסטוריית מכשיר
router.get('/device/:deviceId/history', getDeviceHistory);

router.route('/')
  .get(getServiceLogs)
  .post(createServiceLog);

router.route('/:id')
  .get(getServiceLog)
  .put(updateServiceLog)
  .delete(deleteServiceLog);

module.exports = router;
