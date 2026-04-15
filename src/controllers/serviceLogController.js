const { ServiceLog, Device, Scent } = require('../models');

// @desc    Get all service logs
// @route   GET /api/service-logs
const getServiceLogs = async (req, res) => {
  try {
    const { deviceId, startDate, endDate, serviceType, page = 1, limit = 20, all } = req.query;
    const query = {};

    if (deviceId) query.deviceId = deviceId;
    if (serviceType) query.serviceType = serviceType;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Support fetching all (backward compatibility, capped at 200)
    if (all === 'true') {
      const logs = await ServiceLog.find(query)
        .populate({ path: 'deviceId', populate: { path: 'branchId', select: 'branchName' } })
        .populate('scentId', 'name')
        .sort({ date: -1 }).limit(200).lean();
      return res.json(logs);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      ServiceLog.find(query)
        .populate({ path: 'deviceId', populate: { path: 'branchId', select: 'branchName' } })
        .populate('scentId', 'name')
        .sort({ date: -1 }).skip(skip).limit(limitNum).lean(),
      ServiceLog.countDocuments(query)
    ]);

    res.json({
      data: logs,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get service log by ID
// @route   GET /api/service-logs/:id
const getServiceLog = async (req, res) => {
  try {
    const log = await ServiceLog.findById(req.params.id)
      .populate({
        path: 'deviceId',
        populate: {
          path: 'branchId',
          populate: { path: 'customerId', select: 'name' }
        }
      })
      .populate('scentId', 'name')
      .populate('previousScentId', 'name');

    if (!log) {
      return res.status(404).json({ message: 'רשומת שירות לא נמצאה' });
    }
    res.json(log);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create service log (refill)
// @route   POST /api/service-logs
const createServiceLog = async (req, res) => {
  try {
    const { deviceId, mlFilled, scentId, date, ...otherData } = req.body;

    // בדיקה שהמכשיר קיים
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'מכשיר לא נמצא' });
    }

    // בדיקה שהריח קיים והפחתת מלאי אטומית
    if (scentId) {
      const updatedScent = await Scent.findOneAndUpdate(
        { _id: scentId, stockQuantity: { $gte: mlFilled } },
        { $inc: { stockQuantity: -mlFilled } },
        { new: true }
      );

      if (!updatedScent) {
        const scent = await Scent.findById(scentId);
        if (!scent) {
          return res.status(404).json({ message: 'ריח לא נמצא' });
        }
        return res.status(400).json({
          message: `אין מספיק מלאי. מלאי נוכחי: ${scent.stockQuantity} מ"ל`
        });
      }
    }

    // שמירת הריח הקודם
    const previousScentId = device.scentId;

    // יצירת רשומת השירות
    const serviceLog = await ServiceLog.create({
      deviceId,
      mlFilled,
      scentId,
      date: date || new Date(),
      previousScentId,
      ...otherData
    });

    // עדכון המכשיר
    device.lastRefillDate = serviceLog.date;
    if (scentId) device.scentId = scentId;
    await device.save(); // זה יפעיל את ה-pre save hook שיחשב את nextScheduledRefill

    // טעינת הרשומה המלאה לתשובה
    const populatedLog = await ServiceLog.findById(serviceLog._id)
      .populate('deviceId', 'deviceType locationInBranch')
      .populate('scentId', 'name');

    res.status(201).json({
      message: 'מילוי נרשם בהצלחה',
      serviceLog: populatedLog,
      device: {
        id: device._id,
        lastRefillDate: device.lastRefillDate,
        nextScheduledRefill: device.nextScheduledRefill
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update service log
// @route   PUT /api/service-logs/:id
const updateServiceLog = async (req, res) => {
  try {
    const log = await ServiceLog.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!log) {
      return res.status(404).json({ message: 'רשומת שירות לא נמצאה' });
    }
    res.json(log);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete service log
// @route   DELETE /api/service-logs/:id
const deleteServiceLog = async (req, res) => {
  try {
    const log = await ServiceLog.findByIdAndDelete(req.params.id);
    if (!log) {
      return res.status(404).json({ message: 'רשומת שירות לא נמצאה' });
    }
    res.json({ message: 'רשומת שירות נמחקה בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get device service history
// @route   GET /api/service-logs/device/:deviceId/history
const getDeviceHistory = async (req, res) => {
  try {
    const logs = await ServiceLog.find({ deviceId: req.params.deviceId })
      .populate('scentId', 'name')
      .sort({ date: -1 });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getServiceLogs,
  getServiceLog,
  createServiceLog,
  updateServiceLog,
  deleteServiceLog,
  getDeviceHistory
};
