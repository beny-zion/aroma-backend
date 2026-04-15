const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  sendMessage,
  getConversations,
  getConversation,
  archiveConversation
} = require('../controllers/chatController');

// All routes require auth + admin/manager role
router.use(protect, authorize('admin', 'manager'));

router.post('/message', sendMessage);
router.get('/conversations', getConversations);
router.route('/conversations/:id')
  .get(getConversation)
  .delete(archiveConversation);

module.exports = router;
