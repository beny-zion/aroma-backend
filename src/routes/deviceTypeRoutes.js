const express = require('express');
const router = express.Router();
const {
  getDeviceTypes,
  getDeviceType,
  createDeviceType,
  updateDeviceType,
  deleteDeviceType,
  addStock,
  getLowStockAlerts
} = require('../controllers/deviceTypeController');

// Special routes (must come before /:id to avoid conflicts)
router.get('/alerts/low-stock', getLowStockAlerts);

// Stock management
router.post('/:id/add-stock', addStock);

// Standard CRUD routes
router.route('/')
  .get(getDeviceTypes)
  .post(createDeviceType);

router.route('/:id')
  .get(getDeviceType)
  .put(updateDeviceType)
  .delete(deleteDeviceType);

module.exports = router;
