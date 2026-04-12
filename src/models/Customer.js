const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'שם לקוח הוא שדה חובה'],
    trim: true
  },
  billingDetails: {
    address: {
      type: String,
      trim: true
    },
    taxId: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
  },
  monthlyPrice: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// אינדקס לחיפוש מהיר לפי שם
customerSchema.index({ name: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
