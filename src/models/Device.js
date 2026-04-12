const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: [true, 'חובה לשייך מכשיר לסניף']
  },
  deviceType: {
    type: String,
    required: [true, 'סוג מכשיר הוא שדה חובה'],
    trim: true
    // דוגמאות: "גדול", "קטן", "אפליקציה", "מיני"
  },
  scentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scent'
  },
  locationInBranch: {
    type: String,
    trim: true
    // דוגמאות: "ספא", "קומה 2", "לובי", "חדר ישיבות"
  },
  lastRefillDate: {
    type: Date
  },
  nextScheduledRefill: {
    type: Date
  },
  refillIntervalDays: {
    type: Number,
    default: 30 // ברירת מחדל - מילוי כל 30 יום
  },
  mlPerRefill: {
    type: Number,
    default: 100 // כמות מ"ל ממוצעת למילוי
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

// חישוב אוטומטי של תאריך מילוי הבא לפני שמירה
deviceSchema.pre('save', function(next) {
  if (this.lastRefillDate && this.refillIntervalDays) {
    const nextDate = new Date(this.lastRefillDate);
    nextDate.setDate(nextDate.getDate() + this.refillIntervalDays);
    this.nextScheduledRefill = nextDate;
  }
  next();
});

// Virtual לבדיקת סטטוס מילוי
deviceSchema.virtual('refillStatus').get(function() {
  if (!this.lastRefillDate) return 'unknown';

  const today = new Date();
  const lastRefill = new Date(this.lastRefillDate);
  const daysSinceRefill = Math.floor((today - lastRefill) / (1000 * 60 * 60 * 24));

  if (daysSinceRefill <= 20) return 'green';
  if (daysSinceRefill <= 40) return 'yellow';
  return 'red';
});

// כולל virtuals ב-JSON
deviceSchema.set('toJSON', { virtuals: true });
deviceSchema.set('toObject', { virtuals: true });

// אינדקסים
deviceSchema.index({ branchId: 1 });
deviceSchema.index({ nextScheduledRefill: 1 });
deviceSchema.index({ isActive: 1, nextScheduledRefill: 1 });

module.exports = mongoose.model('Device', deviceSchema);
