const mongoose = require('mongoose');

/**
 * A service request — created when a customer (branch) reports a fault
 * (broken device, leak, smell complaint, etc.). Each request has an
 * urgency level that drives the SLA target date, and may be turned into
 * a WorkOrder when a manager schedules it.
 */
const serviceRequestSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'חובה לשייך סניף']
  },
  customerId: {
    // denormalized from branch for fast list/filter queries
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },

  // What's the issue
  issueType: {
    type: String,
    enum: ['device_broken', 'scent_issue', 'refill_request', 'leak', 'noise', 'other'],
    default: 'other'
  },
  description: {
    type: String,
    trim: true,
    required: [true, 'יש להזין תיאור']
  },
  reportedBy: {
    // free-text name of whoever from the customer side reported it (so we can call back)
    type: String,
    trim: true
  },

  // Urgency drives the SLA target date
  urgency: {
    type: String,
    enum: ['urgent', 'medium', 'low'],
    default: 'medium',
    required: true
  },
  targetByDate: {
    // computed at create time: urgent=+3d, medium=+10d, low=+14d
    type: Date,
    required: true
  },

  // Lifecycle
  status: {
    type: String,
    enum: ['open', 'scheduled', 'completed', 'cancelled'],
    default: 'open',
    index: true
  },
  workOrderId: {
    // set when a WO is created from this request
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkOrder'
  },
  resolvedAt: Date,

  // Who handled it
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: { type: String, trim: true }
}, {
  timestamps: true
});

// Common queries: open requests sorted by urgency then target date
serviceRequestSchema.index({ status: 1, urgency: 1, targetByDate: 1 });
serviceRequestSchema.index({ branchId: 1 });

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
