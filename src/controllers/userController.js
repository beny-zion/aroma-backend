const User = require('../models/User');
const { isValidEmail, isStrongPassword } = require('../utils/validators');

// @desc    Get all users
// @route   GET /api/users
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const limitNum = Math.min(Number(limit), 100);
    const pageNum = Number(page);

    const users = await User.find(query)
      .select('-passwordHash -refreshToken')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      data: users,
      pagination: { page: pageNum, limit: limitNum, total }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash -refreshToken');
    if (!user) {
      return res.status(404).json({ message: 'משתמש לא נמצא' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create user
// @route   POST /api/users
const createUser = async (req, res) => {
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

    res.status(201).json({ message: 'משתמש נוצר בהצלחה', data: user.toJSON() });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
const updateUser = async (req, res) => {
  try {
    const { password, email, ...updateData } = req.body;

    // Handle password change
    if (password) {
      if (!isStrongPassword(password)) {
        return res.status(400).json({ message: 'הסיסמה חייבת להכיל לפחות 8 תווים' });
      }
      updateData.passwordHash = await User.hashPassword(password);
    }

    // Handle email change
    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'כתובת אימייל לא תקינה' });
      }
      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(400).json({ message: 'כתובת האימייל כבר קיימת במערכת' });
      }
      updateData.email = email;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-passwordHash -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'משתמש לא נמצא' });
    }

    res.json({ message: 'משתמש עודכן בהצלחה', data: user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete user (soft delete)
// @route   DELETE /api/users/:id
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select('-passwordHash -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'משתמש לא נמצא' });
    }

    res.json({ message: 'משתמש הושבת בהצלחה', data: user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getUsers, getUser, createUser, updateUser, deleteUser };
