const { AuditLog } = require('../models');

// @desc    List audit log entries (global feed or filtered)
// @route   GET /api/audit
// @query   entityType, entityId, userId, action, dateFrom, dateTo, page, limit
const listAudit = async (req, res) => {
  try {
    const { entityType, entityId, userId, action, dateFrom, dateTo, page = 1, limit = 30 } = req.query;
    const query = {};

    if (entityType) query.entityType = entityType;
    if (entityId) query.entityId = entityId;
    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const dt = new Date(dateTo);
        dt.setHours(23, 59, 59, 999);
        query.createdAt.$lte = dt;
      }
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [entries, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    res.json({
      data: entries,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { listAudit };
