const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getWorkOrders,
  getMyWorkOrders,
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
router.post('/auto-generate', authorize('admin', 'manager'), autoGenerateWorkOrders);

router.route('/')
  .get(authorize('admin', 'manager'), getWorkOrders)
  .post(authorize('admin', 'manager'), createWorkOrder);

router.route('/:id')
  .get(getWorkOrder)
  .put(updateWorkOrder);

router.patch('/:id/status', updateWorkOrderStatus);

module.exports = router;
