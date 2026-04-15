const { DeviceType } = require('../models');

// @desc    Get all device types
// @route   GET /api/device-types
const getDeviceTypes = async (req, res) => {
  try {
    const { isActive, search, page = 1, limit = 20, all } = req.query;
    const query = {};

    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) query.name = { $regex: search, $options: 'i' };

    // Support fetching all for dropdowns (backward compatibility)
    if (all === 'true') {
      const deviceTypes = await DeviceType.find(query).sort({ name: 1 }).lean();
      return res.json(deviceTypes);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [deviceTypes, total] = await Promise.all([
      DeviceType.find(query).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
      DeviceType.countDocuments(query)
    ]);

    res.json({
      data: deviceTypes,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single device type
// @route   GET /api/device-types/:id
const getDeviceType = async (req, res) => {
  try {
    const deviceType = await DeviceType.findById(req.params.id);
    if (!deviceType) {
      return res.status(404).json({ message: 'סוג מכשיר לא נמצא' });
    }
    res.json(deviceType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create device type
// @route   POST /api/device-types
const createDeviceType = async (req, res) => {
  try {
    const deviceType = await DeviceType.create(req.body);
    res.status(201).json(deviceType);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'סוג מכשיר בשם זה כבר קיים' });
    }
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update device type
// @route   PUT /api/device-types/:id
const updateDeviceType = async (req, res) => {
  try {
    const deviceType = await DeviceType.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!deviceType) {
      return res.status(404).json({ message: 'סוג מכשיר לא נמצא' });
    }
    res.json(deviceType);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'סוג מכשיר בשם זה כבר קיים' });
    }
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete device type
// @route   DELETE /api/device-types/:id
const deleteDeviceType = async (req, res) => {
  try {
    const deviceType = await DeviceType.findByIdAndDelete(req.params.id);
    if (!deviceType) {
      return res.status(404).json({ message: 'סוג מכשיר לא נמצא' });
    }
    res.json({ message: 'סוג מכשיר נמחק בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add stock to device type
// @route   POST /api/device-types/:id/add-stock
const addStock = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'יש להזין כמות חיובית' });
    }

    const deviceType = await DeviceType.findById(req.params.id);
    if (!deviceType) {
      return res.status(404).json({ message: 'סוג מכשיר לא נמצא' });
    }

    deviceType.stockQuantity += amount;
    await deviceType.save();

    res.json({ message: `נוספו ${amount} יחידות למלאי`, deviceType });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get low stock alerts
// @route   GET /api/device-types/alerts/low-stock
const getLowStockAlerts = async (req, res) => {
  try {
    const lowStock = await DeviceType.find({
      isActive: true,
      $expr: { $lte: ['$stockQuantity', '$minStockAlert'] }
    }).sort({ stockQuantity: 1 }).lean();
    res.json(lowStock);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDeviceTypes,
  getDeviceType,
  createDeviceType,
  updateDeviceType,
  deleteDeviceType,
  addStock,
  getLowStockAlerts
};
