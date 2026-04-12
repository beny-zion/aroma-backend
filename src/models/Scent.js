const mongoose = require('mongoose');

const scentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'שם ריח הוא שדה חובה'],
    unique: true,
    trim: true
  },
  stockQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  unit: {
    type: String,
    enum: ['ml', 'liter'],
    default: 'ml'
  },
  minStockAlert: {
    type: Number,
    default: 500 // התראה כשמלאי יורד מתחת ל-500 מ"ל
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// אינדקס לחיפוש לפי שם - כבר מוגדר דרך unique: true

module.exports = mongoose.model('Scent', scentSchema);
