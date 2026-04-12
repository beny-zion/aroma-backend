const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'אימייל הוא שדה חובה'],
    unique: true,
    trim: true,
    lowercase: true
  },
  passwordHash: {
    type: String,
    required: [true, 'סיסמה היא שדה חובה']
  },
  name: {
    type: String,
    required: [true, 'שם הוא שדה חובה'],
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'technician'],
    default: 'technician'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  avatar: {
    type: String
  },
  assignedRegions: [{
    type: String,
    trim: true
  }],
  lastLogin: {
    type: Date
  },
  refreshToken: {
    type: String
  }
}, {
  timestamps: true
});

// Compare candidate password with stored hash
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Hash a password (static method)
userSchema.statics.hashPassword = async function(password) {
  return bcrypt.hash(password, 12);
};

// Exclude sensitive fields from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshToken;
  return obj;
};

userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model('User', userSchema);
