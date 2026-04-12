const express = require('express');
const router = express.Router();
const {
  getScents,
  getScent,
  createScent,
  updateScent,
  deleteScent,
  addStock,
  getLowStockAlerts
} = require('../controllers/scentController');

// Routes מיוחדים
router.get('/alerts/low-stock', getLowStockAlerts);
router.post('/:id/add-stock', addStock);

router.route('/')
  .get(getScents)
  .post(createScent);

router.route('/:id')
  .get(getScent)
  .put(updateScent)
  .delete(deleteScent);

module.exports = router;
