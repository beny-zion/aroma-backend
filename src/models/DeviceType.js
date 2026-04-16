const mongoose = require('mongoose');

const deviceTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'שם סוג המכשיר הוא שדה חובה'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // כמות מ"ל לכל מילוי
  mlPerRefill: {
    type: Number,
    default: 100
  },
  // מרווח ימים בין מילויים (ברירת מחדל)
  defaultRefillInterval: {
    type: Number,
    default: 45
  },
  // מחיר המכשיר
  price: {
    type: Number,
    default: 0
  },
  // כמות במלאי
  stockQuantity: {
    type: Number,
    default: 0
  },
  // התראת מלאי מינימלי
  minStockAlert: {
    type: Number,
    default: 5
  },
  // האם פעיל
  isActive: {
    type: Boolean,
    default: true
  },
  // הערות
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// כלול virtuals ב-JSON
deviceTypeSchema.set('toJSON', { virtuals: true });

// אינדקסים (name כבר מאונדקס דרך unique: true)
deviceTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model('DeviceType', deviceTypeSchema);
