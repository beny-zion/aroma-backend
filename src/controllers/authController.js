const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { isValidEmail, isStrongPassword } = require('../utils/validators');

// Generate access token (15 minutes)
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

// Generate refresh token (7 days)
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

// Set httpOnly cookies
const setTokenCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

// @desc    Login user
// @route   POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'אימייל וסיסמה הם שדות חובה' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'אימייל או סיסמה שגויים' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'המשתמש אינו פעיל. פנה למנהל המערכת' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'אימייל או סיסמה שגויים' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store hashed refresh token
    user.refreshToken = await bcrypt.hash(refreshToken, 10);
    user.lastLogin = new Date();
    await user.save();

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      message: 'התחברות בוצעה בהצלחה',
      user: user.toJSON()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register new user (admin only)
// @route   POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, name, phone, role, assignedRegions } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'אימייל, סיסמה ושם הם שדות חובה' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'כתובת אימייל לא תקינה' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: 'הסיסמה חייבת להכיל לפחות 8 תווים' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'כתובת האימייל כבר קיימת במערכת' });
    }

    const passwordHash = await User.hashPassword(password);

    const user = await User.create({
      email,
      passwordHash,
      name,
      phone,
      role: role || 'technician',
      assignedRegions: assignedRegions || []
    });

    res.status(201).json({
      message: 'משתמש נוצר בהצלחה',
      data: user.toJSON()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = async (req, res) => {
  try {
    res.json(req.user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({ message: 'אין refresh token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'refresh token לא תקין או פג תוקף' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive || !user.refreshToken) {
      return res.status(401).json({ message: 'משתמש לא נמצא או לא פעיל' });
    }

    // Verify stored refresh token matches
    const isValid = await bcrypt.compare(token, user.refreshToken);
    if (!isValid) {
      return res.status(401).json({ message: 'refresh token לא תקין' });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Update stored refresh token
    user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
    await user.save();

    setTokenCookies(res, newAccessToken, newRefreshToken);

    res.json({ message: 'טוקן חודש בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
const logout = async (req, res) => {
  try {
    // Try to clear refresh token from DB
    const token = req.cookies.accessToken;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await User.findByIdAndUpdate(decoded.userId, { refreshToken: null });
      } catch (e) {
        // Token might be expired, that's ok
      }
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });

    res.json({ message: 'התנתקת בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { login, register, getMe, refresh, logout };
