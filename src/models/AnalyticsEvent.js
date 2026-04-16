const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['page_view', 'action'],
    required: true,
    index: true
  },
  page: {
    type: String,
    trim: true,
    index: true
  },
  action: {
    type: String,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  userName: {
    type: String,
    trim: true
  },
  userRole: {
    type: String,
    enum: ['admin', 'manager', 'technician', 'anonymous'],
    default: 'anonymous'
  },
  deviceType: {
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown',
    index: true
  },
  browser: {
    type: String,
    trim: true
  },
  os: {
    type: String,
    trim: true
  },
  sessionId: {
    type: String,
    index: true
  },
  ipAddress: {
    type: String,
    trim: true,
    index: true
  },
  screenResolution: {
    type: String,
    trim: true
  },
  deviceFingerprint: {
    type: String,
    trim: true,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for aggregation queries
analyticsEventSchema.index({ timestamp: -1, type: 1 });
analyticsEventSchema.index({ page: 1, timestamp: -1 });
analyticsEventSchema.index({ userId: 1, timestamp: -1 });

// TTL: auto-delete after 90 days
analyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
