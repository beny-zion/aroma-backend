const express = require('express');
const router = express.Router();
const {
  getDevices,
  getDevicesDueForRefill,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  getDashboardStats
} = require('../controllers/deviceController');

// Routes מיוחדים (חייבים להיות לפני /:id)
router.get('/due-for-refill', getDevicesDueForRefill);
router.get('/stats/dashboard', getDashboardStats);

router.route('/')
  .get(getDevices)
  .post(createDevice);

router.route('/:id')
  .get(getDevice)
  .put(updateDevice)
  .delete(deleteDevice);

module.exports = router;
