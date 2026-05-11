const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getPermissions } = require('../controllers/permissionsController');

router.use(protect);

// Any authenticated user can read the matrix (it's not sensitive — drives the UI)
router.get('/', getPermissions);

module.exports = router;
