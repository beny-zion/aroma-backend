const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { listAudit } = require('../controllers/auditController');

router.use(protect);
router.use(authorize('admin', 'manager', 'secretary'));

router.get('/', listAudit);

module.exports = router;
