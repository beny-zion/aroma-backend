const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  entityLinks: [{
    type: { type: String, enum: ['customer', 'branch', 'device', 'work-order', 'scent'] },
    entityId: String,
    displayName: String
  }],
  toolCalls: [{
    name: String,
    args: mongoose.Schema.Types.Mixed,
    resultSummary: String
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const chatConversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    default: 'שיחה חדשה',
    trim: true,
    maxlength: 100
  },
  messages: [chatMessageSchema],
  contextSummary: {
    type: String,
    maxlength: 2000
  },
  messageCount: {
    type: Number,
    default: 0
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

chatConversationSchema.index({ userId: 1, lastMessageAt: -1 });
chatConversationSchema.index({ userId: 1, isArchived: 1 });
chatConversationSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { isArchived: true } }
);

module.exports = mongoose.model('ChatConversation', chatConversationSchema);
