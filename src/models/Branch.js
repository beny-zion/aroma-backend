const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'חובה לשייך סניף ללקוח']
  },
  branchName: {
    type: String,
    required: [true, 'שם סניף הוא שדה חובה'],
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  region: {
    type: String,
    trim: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  contactPhone: {
    type: String,
    trim: true
  },
  visitIntervalDays: {
    type: Number,
    default: 30,
    min: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// אינדקס לחיפוש לפי לקוח
branchSchema.index({ customerId: 1 });
// אינדקס לחיפוש לפי עיר/אזור
branchSchema.index({ city: 1, region: 1 });

module.exports = mongoose.model('Branch', branchSchema);
