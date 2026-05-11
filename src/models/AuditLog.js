const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // What was touched
  entityType: {
    type: String,
    required: true,
    enum: ['customer', 'branch', 'device', 'work_order'],
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  entityName: {
    // snapshot of the entity's display name at time of action — survives renames/deletes
    type: String,
    trim: true
  },

  // What happened
  action: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete', 'status_change', 'assign', 'complete', 'cancel']
  },
  changes: {
    // [{ field: 'name', from: 'X', to: 'Y' }]
    type: [{
      field: String,
      from: mongoose.Schema.Types.Mixed,
      to: mongoose.Schema.Types.Mixed,
      _id: false
    }],
    default: []
  },

  // Who did it
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  userName: { type: String, trim: true }, // snapshot
  userRole: { type: String, trim: true }, // snapshot — admin / manager / technician

  // Free-text context (optional — e.g. cancellation reason)
  notes: { type: String, trim: true }
}, {
  timestamps: true // createdAt acts as the timestamp of the action
});

// Compound index for entity-scoped queries (most common access pattern)
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
// For global activity feed
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
