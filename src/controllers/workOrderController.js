const { WorkOrder, Branch, Device, User } = require('../models');

// @desc    Get all work orders (admin/manager)
// @route   GET /api/work-orders
const getWorkOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, type, assignedTo, branchId, dateFrom, dateTo } = req.query;
    const query = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (type) query.type = type;
    if (assignedTo) query.assignedTo = assignedTo;
    if (branchId) query.branchId = branchId;
    if (dateFrom || dateTo) {
      query.scheduledDate = {};
      if (dateFrom) query.scheduledDate.$gte = new Date(dateFrom);
      if (dateTo) query.scheduledDate.$lte = new Date(dateTo);
    }

    const limitNum = Math.min(Number(limit), 100);
    const pageNum = Number(page);

    const workOrders = await WorkOrder.find(query)
      .populate({
        path: 'branchId',
        select: 'branchName address city customerId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('assignedTo', 'name phone')
      .populate('createdBy', 'name')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ scheduledDate: 1 });

    const total = await WorkOrder.countDocuments(query);

    res.json({
      data: workOrders,
      pagination: { page: pageNum, limit: limitNum, total }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get my work orders (technician)
// @route   GET /api/work-orders/my
const getMyWorkOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { assignedTo: req.user._id };

    if (status) query.status = status;

    const limitNum = Math.min(Number(limit), 100);
    const pageNum = Number(page);

    const workOrders = await WorkOrder.find(query)
      .populate({
        path: 'branchId',
        select: 'branchName address city contactPerson contactPhone customerId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('devices.deviceId', 'deviceType locationInBranch')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ scheduledDate: 1 });

    const total = await WorkOrder.countDocuments(query);

    res.json({
      data: workOrders,
      pagination: { page: pageNum, limit: limitNum, total }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single work order
// @route   GET /api/work-orders/:id
const getWorkOrder = async (req, res) => {
  try {
    const workOrder = await WorkOrder.findById(req.params.id)
      .populate({
        path: 'branchId',
        select: 'branchName address city contactPerson contactPhone customerId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('assignedTo', 'name phone email')
      .populate('createdBy', 'name')
      .populate('devices.deviceId', 'deviceType locationInBranch scentId lastRefillDate');

    if (!workOrder) {
      return res.status(404).json({ message: 'הזמנת עבודה לא נמצאה' });
    }

    // Technician can only see their own work orders
    if (req.user.role === 'technician' && workOrder.assignedTo?._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'אין הרשאה לצפות בהזמנה זו' });
    }

    res.json(workOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create work order
// @route   POST /api/work-orders
const createWorkOrder = async (req, res) => {
  try {
    const { branchId, assignedTo, scheduledDate, priority, type, devices, notes, estimatedDuration } = req.body;

    if (!branchId || !scheduledDate) {
      return res.status(400).json({ message: 'סניף ותאריך מתוכנן הם שדות חובה' });
    }

    // Validate branch exists
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ message: 'סניף לא נמצא' });
    }

    // Validate technician exists and is a technician
    if (assignedTo) {
      const technician = await User.findById(assignedTo);
      if (!technician || !technician.isActive) {
        return res.status(404).json({ message: 'טכנאי לא נמצא או לא פעיל' });
      }
    }

    const workOrder = await WorkOrder.create({
      branchId,
      assignedTo,
      createdBy: req.user._id,
      scheduledDate,
      status: assignedTo ? 'assigned' : 'pending',
      priority: priority || 'medium',
      type: type || 'routine_refill',
      devices: devices || [],
      notes,
      estimatedDuration
    });

    const populated = await WorkOrder.findById(workOrder._id)
      .populate({
        path: 'branchId',
        select: 'branchName address city customerId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('assignedTo', 'name phone')
      .populate('createdBy', 'name');

    res.status(201).json({ message: 'הזמנת עבודה נוצרה בהצלחה', data: populated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update work order
// @route   PUT /api/work-orders/:id
const updateWorkOrder = async (req, res) => {
  try {
    const workOrder = await WorkOrder.findById(req.params.id);
    if (!workOrder) {
      return res.status(404).json({ message: 'הזמנת עבודה לא נמצאה' });
    }

    if (['completed', 'cancelled'].includes(workOrder.status)) {
      return res.status(400).json({ message: 'לא ניתן לעדכן הזמנה שהושלמה או בוטלה' });
    }

    // Technician can only update their own work orders
    if (req.user.role === 'technician' && workOrder.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'אין הרשאה לעדכן הזמנה זו' });
    }

    const updated = await WorkOrder.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate({
        path: 'branchId',
        select: 'branchName address city customerId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('assignedTo', 'name phone')
      .populate('createdBy', 'name');

    res.json({ message: 'הזמנת עבודה עודכנה בהצלחה', data: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update work order status
// @route   PATCH /api/work-orders/:id/status
const updateWorkOrderStatus = async (req, res) => {
  try {
    const { status, completionNotes, devices } = req.body;
    const workOrder = await WorkOrder.findById(req.params.id);

    if (!workOrder) {
      return res.status(404).json({ message: 'הזמנת עבודה לא נמצאה' });
    }

    // Technician can only update their own work orders
    if (req.user.role === 'technician' && workOrder.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'אין הרשאה לעדכן הזמנה זו' });
    }

    // Validate status transitions
    const validTransitions = {
      pending: ['assigned', 'cancelled'],
      assigned: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: []
    };

    if (!validTransitions[workOrder.status]?.includes(status)) {
      return res.status(400).json({
        message: `לא ניתן לעבור מסטטוס "${workOrder.status}" ל-"${status}"`
      });
    }

    // Only admin/manager can cancel
    if (status === 'cancelled' && req.user.role === 'technician') {
      return res.status(403).json({ message: 'רק מנהל יכול לבטל הזמנת עבודה' });
    }

    const updateData = { status };

    if (status === 'completed') {
      updateData.completedDate = new Date();
      if (completionNotes) updateData.completionNotes = completionNotes;
      if (devices) updateData.devices = devices;
    }

    const updated = await WorkOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate({
        path: 'branchId',
        select: 'branchName address city customerId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('assignedTo', 'name phone')
      .populate('createdBy', 'name');

    res.json({ message: 'סטטוס עודכן בהצלחה', data: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Auto-generate work orders from refill schedule
// @route   POST /api/work-orders/auto-generate
const autoGenerateWorkOrders = async (req, res) => {
  try {
    const { targetDate } = req.body;
    const target = targetDate ? new Date(targetDate) : new Date();

    // Find active devices that need refill by target date
    const devices = await Device.find({
      isActive: true,
      nextScheduledRefill: { $lte: target }
    }).populate('branchId', 'branchName customerId isActive');

    // Filter only active branches and group by branch
    const branchGroups = {};
    for (const device of devices) {
      if (!device.branchId || !device.branchId.isActive) continue;
      const branchKey = device.branchId._id.toString();
      if (!branchGroups[branchKey]) {
        branchGroups[branchKey] = {
          branchId: device.branchId._id,
          devices: []
        };
      }
      branchGroups[branchKey].devices.push({
        deviceId: device._id,
        taskDescription: `מילוי ${device.deviceType} - ${device.locationInBranch || ''}`.trim()
      });
    }

    // Create work orders
    const created = [];
    for (const group of Object.values(branchGroups)) {
      // Check if there's already a pending/assigned work order for this branch
      const existing = await WorkOrder.findOne({
        branchId: group.branchId,
        status: { $in: ['pending', 'assigned', 'in_progress'] },
        type: 'routine_refill'
      });

      if (existing) continue;

      const workOrder = await WorkOrder.create({
        branchId: group.branchId,
        createdBy: req.user._id,
        scheduledDate: target,
        type: 'routine_refill',
        devices: group.devices,
        notes: 'נוצר אוטומטית מלוח מילויים'
      });

      created.push(workOrder);
    }

    res.status(201).json({
      message: `נוצרו ${created.length} הזמנות עבודה חדשות`,
      data: created
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getWorkOrders,
  getMyWorkOrders,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  updateWorkOrderStatus,
  autoGenerateWorkOrders
};
