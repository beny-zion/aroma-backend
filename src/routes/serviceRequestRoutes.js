const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  listServiceRequests,
  createServiceRequest,
  updateServiceRequest,
  scheduleServiceRequest,
  deleteServiceRequest
} = require('../controllers/serviceRequestController');

router.use(protect);
router.use(authorize('admin', 'manager', 'secretary'));

router.route('/')
  .get(listServiceRequests)
  .post(createServiceRequest);

router.route('/:id')
  .put(updateServiceRequest)
  .delete(deleteServiceRequest);

router.post('/:id/schedule', scheduleServiceRequest);

module.exports = router;
