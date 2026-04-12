const { Device, Branch } = require('../models');

// @desc    Get all devices
// @route   GET /api/devices
const getDevices = async (req, res) => {
  try {
    const { branchId, isActive, status } = req.query;
    const query = {};

    if (branchId) query.branchId = branchId;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const devices = await Device.find(query)
      .populate({
        path: 'branchId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('scentId', 'name')
      .sort({ nextScheduledRefill: 1 });

    // סינון לפי סטטוס מילוי אם נדרש
    if (status) {
      const filtered = devices.filter(d => d.refillStatus === status);
      return res.json(filtered);
    }

    res.json(devices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get devices due for refill
// @route   GET /api/devices/due-for-refill
const getDevicesDueForRefill = async (req, res) => {
  try {
    const { days = 45 } = req.query;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(days));

    const devices = await Device.find({
      isActive: true,
      $or: [
        { nextScheduledRefill: { $lte: targetDate } },
        { nextScheduledRefill: null },
        { lastRefillDate: null }
      ]
    })
      .populate({
        path: 'branchId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('scentId', 'name')
      .sort({ nextScheduledRefill: 1 });

    // קבץ לפי סטטוס
    const grouped = {
      overdue: [], // אדום - מעל 45 יום
      dueSoon: [], // צהוב - 30-45 יום
      ok: [],      // ירוק - פחות מ-30 יום
      unknown: []  // לא ידוע
    };

    devices.forEach(device => {
      const status = device.refillStatus;
      if (status === 'red') grouped.overdue.push(device);
      else if (status === 'yellow') grouped.dueSoon.push(device);
      else if (status === 'green') grouped.ok.push(device);
      else grouped.unknown.push(device);
    });

    res.json({
      total: devices.length,
      grouped,
      devices
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single device
// @route   GET /api/devices/:id
const getDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id)
      .populate({
        path: 'branchId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('scentId', 'name');

    if (!device) {
      return res.status(404).json({ message: 'מכשיר לא נמצא' });
    }
    res.json(device);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create device
// @route   POST /api/devices
const createDevice = async (req, res) => {
  try {
    const device = await Device.create(req.body);
    res.status(201).json(device);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update device
// @route   PUT /api/devices/:id
const updateDevice = async (req, res) => {
  try {
    const device = await Device.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!device) {
      return res.status(404).json({ message: 'מכשיר לא נמצא' });
    }
    res.json(device);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete device
// @route   DELETE /api/devices/:id
const deleteDevice = async (req, res) => {
  try {
    const device = await Device.findByIdAndDelete(req.params.id);
    if (!device) {
      return res.status(404).json({ message: 'מכשיר לא נמצא' });
    }
    res.json({ message: 'מכשיר נמחק בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dashboard statistics
// @route   GET /api/devices/stats/dashboard
const getDashboardStats = async (req, res) => {
  try {
    const totalDevices = await Device.countDocuments({ isActive: true });

    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));
    const fortyFiveDaysAgo = new Date(new Date().setDate(new Date().getDate() - 45));
    const twentyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 20));

    // ספירת מכשירים לפי סטטוס
    const greenCount = await Device.countDocuments({
      isActive: true,
      lastRefillDate: { $gte: twentyDaysAgo }
    });

    const yellowCount = await Device.countDocuments({
      isActive: true,
      lastRefillDate: { $lt: twentyDaysAgo, $gte: fortyFiveDaysAgo }
    });

    const redCount = await Device.countDocuments({
      isActive: true,
      $or: [
        { lastRefillDate: { $lt: fortyFiveDaysAgo } },
        { lastRefillDate: null }
      ]
    });

    res.json({
      totalDevices,
      statusCounts: {
        green: greenCount,
        yellow: yellowCount,
        red: redCount
      },
      percentages: {
        green: totalDevices ? Math.round((greenCount / totalDevices) * 100) : 0,
        yellow: totalDevices ? Math.round((yellowCount / totalDevices) * 100) : 0,
        red: totalDevices ? Math.round((redCount / totalDevices) * 100) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDevices,
  getDevicesDueForRefill,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  getDashboardStats
};
