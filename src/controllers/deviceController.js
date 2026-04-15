const { Device, Branch } = require('../models');

// @desc    Get all devices
// @route   GET /api/devices
const getDevices = async (req, res) => {
  try {
    const { branchId, isActive, status, search, page = 1, limit = 20, all } = req.query;
    const query = {};

    if (branchId) query.branchId = branchId;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) query.locationInBranch = { $regex: search, $options: 'i' };

    // Server-side refill status filtering using date ranges
    if (status) {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

      if (status === 'green') {
        query.lastRefillDate = { $gte: thirtyDaysAgo };
      } else if (status === 'yellow') {
        query.lastRefillDate = { $lt: thirtyDaysAgo, $gte: fortyFiveDaysAgo };
      } else if (status === 'red') {
        query.$or = [
          { lastRefillDate: { $lt: fortyFiveDaysAgo } },
          { lastRefillDate: null }
        ];
      } else if (status === 'unknown') {
        query.lastRefillDate = null;
      }
    }

    // Support fetching all for dropdowns (backward compatibility)
    if (all === 'true') {
      const devices = await Device.find(query)
        .populate({ path: 'branchId', populate: { path: 'customerId', select: 'name' } })
        .populate('scentId', 'name')
        .sort({ nextScheduledRefill: 1 });
      return res.json(devices);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [devices, total] = await Promise.all([
      Device.find(query)
        .populate({ path: 'branchId', populate: { path: 'customerId', select: 'name' } })
        .populate('scentId', 'name')
        .sort({ nextScheduledRefill: 1 }).skip(skip).limit(limitNum),
      Device.countDocuments(query)
    ]);

    res.json({
      data: devices,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
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
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

    // Single aggregation instead of 4 separate queries
    const [statusCounts] = await Device.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          green: {
            $sum: { $cond: [{ $and: [{ $ne: ['$lastRefillDate', null] }, { $gte: ['$lastRefillDate', thirtyDaysAgo] }] }, 1, 0] }
          },
          yellow: {
            $sum: { $cond: [{ $and: [{ $ne: ['$lastRefillDate', null] }, { $lt: ['$lastRefillDate', thirtyDaysAgo] }, { $gte: ['$lastRefillDate', fortyFiveDaysAgo] }] }, 1, 0] }
          },
          red: {
            $sum: { $cond: [{ $or: [{ $eq: ['$lastRefillDate', null] }, { $lt: ['$lastRefillDate', fortyFiveDaysAgo] }] }, 1, 0] }
          }
        }
      }
    ]);

    const totalDevices = statusCounts?.total || 0;

    res.json({
      totalDevices,
      statusCounts: {
        green: statusCounts?.green || 0,
        yellow: statusCounts?.yellow || 0,
        red: statusCounts?.red || 0
      },
      percentages: {
        green: totalDevices ? Math.round(((statusCounts?.green || 0) / totalDevices) * 100) : 0,
        yellow: totalDevices ? Math.round(((statusCounts?.yellow || 0) / totalDevices) * 100) : 0,
        red: totalDevices ? Math.round(((statusCounts?.red || 0) / totalDevices) * 100) : 0
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
