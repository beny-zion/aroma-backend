const { ServiceRequest, Branch, WorkOrder } = require('../models');
const { logCreate, logUpdate, logEvent } = require('../utils/audit');

// Map urgency → days from "now" by which it should be handled
const URGENCY_DAYS = {
  urgent: 3,
  medium: 10,
  low: 14
};
// Map urgency → priority on the created WorkOrder
const URGENCY_TO_PRIORITY = {
  urgent: 'urgent',
  medium: 'high',
  low: 'medium'
};

function targetDateForUrgency(urgency) {
  const d = new Date();
  d.setDate(d.getDate() + (URGENCY_DAYS[urgency] ?? 10));
  d.setHours(12, 0, 0, 0);
  return d;
}

function describeRequest(req) {
  const issueLabel = {
    device_broken: 'תקלה במכשיר',
    scent_issue: 'בעיית ריח',
    refill_request: 'בקשת מילוי',
    leak: 'דליפה',
    noise: 'רעש',
    other: 'אחר'
  }[req.issueType] || 'תקלה';
  return `${issueLabel} — ${req.description?.slice(0, 50) || ''}`;
}

// @desc    List service requests
// @route   GET /api/service-requests
const listServiceRequests = async (req, res) => {
  try {
    const { status, urgency, branchId, customerId, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (urgency) query.urgency = urgency;
    if (branchId) query.branchId = branchId;
    if (customerId) query.customerId = customerId;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Sort: urgent first, then by SLA target ascending (closest deadline next)
    const urgencyOrder = { urgent: 0, medium: 1, low: 2 };
    const [requests, total] = await Promise.all([
      ServiceRequest.find(query)
        .populate({
          path: 'branchId',
          select: 'branchName city region address contactPerson contactPhone customerId',
          populate: { path: 'customerId', select: 'name' }
        })
        .populate('createdBy', 'name')
        .populate('workOrderId', 'scheduledDate status assignedTo')
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ServiceRequest.countDocuments(query)
    ]);

    // Sort in JS (Mongoose can't easily sort by enum order)
    requests.sort((a, b) => {
      const u = (urgencyOrder[a.urgency] ?? 99) - (urgencyOrder[b.urgency] ?? 99);
      if (u !== 0) return u;
      return new Date(a.targetByDate) - new Date(b.targetByDate);
    });

    res.json({
      data: requests,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Create a new service request
// @route   POST /api/service-requests
const createServiceRequest = async (req, res) => {
  try {
    const { branchId, issueType, description, reportedBy, urgency, notes } = req.body;
    if (!branchId || !description) {
      return res.status(400).json({ message: 'סניף ותיאור הם שדות חובה' });
    }
    const branch = await Branch.findById(branchId).populate('customerId', 'name');
    if (!branch) return res.status(404).json({ message: 'סניף לא נמצא' });

    const targetByDate = targetDateForUrgency(urgency || 'medium');
    const request = await ServiceRequest.create({
      branchId,
      customerId: branch.customerId._id || branch.customerId,
      issueType: issueType || 'other',
      description,
      reportedBy,
      urgency: urgency || 'medium',
      targetByDate,
      notes,
      createdBy: req.user._id
    });

    await logCreate(req, 'work_order', request._id, describeRequest(request), request.toObject());

    const populated = await ServiceRequest.findById(request._id)
      .populate({
        path: 'branchId',
        select: 'branchName city region address contactPerson contactPhone customerId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('createdBy', 'name');

    res.status(201).json({ message: 'פניה נוצרה', data: populated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc    Update service request (status, urgency, etc.)
// @route   PUT /api/service-requests/:id
const updateServiceRequest = async (req, res) => {
  try {
    const before = await ServiceRequest.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'פניה לא נמצאה' });

    // If urgency changed, recompute target date
    const updates = { ...req.body };
    if (updates.urgency && updates.urgency !== before.urgency) {
      updates.targetByDate = targetDateForUrgency(updates.urgency);
    }
    const updated = await ServiceRequest.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate({
      path: 'branchId',
      select: 'branchName city region address contactPerson contactPhone customerId',
      populate: { path: 'customerId', select: 'name' }
    });

    await logUpdate(req, 'work_order', updated._id, describeRequest(updated), before, updated.toObject(), {
      fields: ['urgency', 'status', 'description', 'notes', 'issueType', 'reportedBy']
    });

    res.json({ message: 'פניה עודכנה', data: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc    Schedule a service request → creates a WorkOrder at the target date
// @route   POST /api/service-requests/:id/schedule
// @body    { assignedTo? }
const scheduleServiceRequest = async (req, res) => {
  try {
    const request = await ServiceRequest.findById(req.params.id).populate('branchId');
    if (!request) return res.status(404).json({ message: 'פניה לא נמצאה' });
    if (request.status !== 'open') {
      return res.status(400).json({ message: 'הפניה כבר שובצה או טופלה' });
    }
    if (!request.branchId) return res.status(400).json({ message: 'סניף חסר בפניה' });

    const { assignedTo } = req.body;

    const wo = await WorkOrder.create({
      branchId: request.branchId._id,
      assignedTo: assignedTo || undefined,
      createdBy: req.user._id,
      scheduledDate: request.targetByDate,
      status: assignedTo ? 'assigned' : 'pending',
      priority: URGENCY_TO_PRIORITY[request.urgency] || 'high',
      type: request.issueType === 'refill_request' ? 'routine_refill' : 'repair',
      devices: [],
      notes: `נוצר מפניית שירות: ${request.description}${request.reportedBy ? ` (דווח ע"י ${request.reportedBy})` : ''}`
    });

    request.status = 'scheduled';
    request.workOrderId = wo._id;
    await request.save();

    await logEvent(req, 'work_order', request._id, describeRequest(request), 'status_change', {
      changes: [{ field: 'status', from: 'open', to: 'scheduled' }],
      notes: `שובץ להזמנת עבודה ${wo._id} בתאריך ${new Date(request.targetByDate).toLocaleDateString('he-IL')}`
    });
    await logEvent(req, 'work_order', wo._id, request.branchId.branchName || 'הזמנת עבודה', 'create', {
      notes: `נוצרה אוטומטית מפניית שירות עם דחיפות "${request.urgency}"`
    });

    res.status(201).json({ message: 'פניה שובצה', data: { request, workOrder: wo } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// @desc    Delete a service request
// @route   DELETE /api/service-requests/:id
const deleteServiceRequest = async (req, res) => {
  try {
    const request = await ServiceRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ message: 'פניה לא נמצאה' });
    res.json({ message: 'פניה נמחקה' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  listServiceRequests,
  createServiceRequest,
  updateServiceRequest,
  scheduleServiceRequest,
  deleteServiceRequest
};
