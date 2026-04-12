const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT from httpOnly cookie
const protect = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({ message: 'לא מחובר. נא להתחבר מחדש' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash -refreshToken');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'משתמש לא נמצא או לא פעיל' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'הטוקן פג תוקף', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'טוקן לא תקין' });
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'לא מחובר' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'אין הרשאה לפעולה זו' });
    }
    next();
  };
};

module.exports = { protect, authorize };
