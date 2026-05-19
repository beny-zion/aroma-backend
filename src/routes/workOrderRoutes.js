const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getWorkOrders,
  getMyWorkOrders,
  getQueueByTechnician,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  updateWorkOrderStatus,
  autoGenerateWorkOrders
} = require('../controllers/workOrderController');

// All routes require authentication
router.use(protect);

// Special routes (before /:id)
router.get('/my', getMyWorkOrders);
router.get('/queue-by-technician', authorize('admin', 'manager', 'secretary'), getQueueByTechnician);
router.post('/auto-generate', authorize('admin', 'manager', 'secretary'), autoGenerateWorkOrders);

router.route('/')
  .get(authorize('admin', 'manager', 'secretary'), getWorkOrders)
  .post(authorize('admin', 'manager', 'secretary'), createWorkOrder);

router.route('/:id')
  .get(getWorkOrder)
  .put(updateWorkOrder);

router.patch('/:id/status', updateWorkOrderStatus);

module.exports = router;
