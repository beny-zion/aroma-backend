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

scentSchema.index({ isActive: 1 });
scentSchema.index({ isActive: 1, stockQuantity: 1 });

module.exports = mongoose.model('Scent', scentSchema);
