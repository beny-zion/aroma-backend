const mongoose = require('mongoose');

const serviceLogSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: [true, 'חובה לשייך רשומת שירות למכשיר']
  },
  date: {
    type: Date,
    required: [true, 'תאריך שירות הוא שדה חובה'],
    default: Date.now
  },
  mlFilled: {
    type: Number,
    required: [true, 'כמות מילוי היא שדה חובה'],
    min: 0
  },
  scentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scent'
  },
  technicianName: {
    type: String,
    trim: true
  },
  technicianNotes: {
    type: String,
    trim: true
  },
  serviceType: {
    type: String,
    enum: ['refill', 'repair', 'replacement', 'installation', 'removal'],
    default: 'refill'
  },
  // שדות נוספים לתיעוד
  previousScentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scent'
  },
  issuesFound: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// אינדקסים
serviceLogSchema.index({ deviceId: 1, date: -1 });
serviceLogSchema.index({ date: -1 });
serviceLogSchema.index({ scentId: 1 });

module.exports = mongoose.model('ServiceLog', serviceLogSchema);
