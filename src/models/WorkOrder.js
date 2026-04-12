const mongoose = require('mongoose');

const workOrderSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'חובה לשייך הזמנת עבודה לסניף']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'חובה לציין מי יצר את ההזמנה']
  },
  scheduledDate: {
    type: Date,
    required: [true, 'תאריך מתוכנן הוא שדה חובה']
  },
  completedDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  type: {
    type: String,
    enum: ['routine_refill', 'repair', 'installation', 'removal', 'complaint'],
    default: 'routine_refill'
  },
  devices: [{
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device'
    },
    taskDescription: {
      type: String,
      trim: true
    },
    isCompleted: {
      type: Boolean,
      default: false
    }
  }],
  notes: {
    type: String,
    trim: true
  },
  completionNotes: {
    type: String,
    trim: true
  },
  customerSignature: {
    type: String
  },
  estimatedDuration: {
    type: Number
  }
}, {
  timestamps: true
});

workOrderSchema.index({ assignedTo: 1, status: 1 });
workOrderSchema.index({ scheduledDate: 1 });
workOrderSchema.index({ branchId: 1 });
workOrderSchema.index({ status: 1 });
workOrderSchema.index({ createdBy: 1 });

module.exports = mongoose.model('WorkOrder', workOrderSchema);
