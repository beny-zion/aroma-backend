const jwt = require('jsonwebtoken');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const User = require('../models/User');
const { parseUserAgent } = require('../utils/parseUserAgent');

const ISRAEL_TZ = 'Asia/Jerusalem';

// Extract real IP from request (handles proxies)
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.connection?.remoteAddress || req.ip || 'unknown';
}

// POST /api/analytics/track
const trackEvent = async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    if (events.length > 50) {
      return res.status(400).json({ message: 'Maximum 50 events per batch' });
    }

    const ua = parseUserAgent(req.headers['user-agent']);
    const ipAddress = getClientIP(req);

    // Try to extract user from JWT cookie (optional)
    let userId = null, userName = null, userRole = 'anonymous';
    try {
      const token = req.cookies?.accessToken;
      if (token && process.env.JWT_SECRET) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.userId) {
          const user = await User.findById(decoded.userId).select('name role').lean();
          if (user) {
            userId = decoded.userId;
            userName = user.name || null;
            userRole = user.role || 'anonymous';
          }
        }
      }
    } catch {
      // JWT missing or invalid - track as anonymous
    }

    const docs = events.map(event => ({
      type: event.type || 'page_view',
      page: event.page,
      action: event.action,
      userId,
      userName,
      userRole,
      deviceType: ua.deviceType,
      browser: ua.browser,
      os: ua.os,
      sessionId: event.sessionId,
      ipAddress,
      screenResolution: event.screenResolution || null,
      deviceFingerprint: event.deviceFingerprint || null,
      metadata: event.metadata || {},
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date()
    }));

    await AnalyticsEvent.insertMany(docs, { ordered: false });
    res.status(201).json({ tracked: docs.length });
  } catch {
    res.status(201).json({ tracked: 0 });
  }
};

// POST /api/analytics/admin/verify
const verifyPassword = async (req, res) => {
  res.json({ success: true, message: 'Password verified' });
};

// GET /api/analytics/admin/overview?days=30
const getOverview = async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalEvents,
      uniqueIPs,
      uniqueSessions,
      uniqueDevices,
      dailyTrend,
      deviceBreakdown,
      topPages,
      topVisitors,
      hourlyHeatmap,
      roleBreakdown,
      browserBreakdown,
      chatUsage
    ] = await Promise.all([
      // 1. Total events
      AnalyticsEvent.countDocuments({ timestamp: { $gte: since } }),

      // 2. Unique IPs = real unique visitors
      AnalyticsEvent.distinct('ipAddress', { timestamp: { $gte: since }, ipAddress: { $ne: null } }),

      // 3. Unique sessions
      AnalyticsEvent.distinct('sessionId', { timestamp: { $gte: since }, sessionId: { $ne: null } }),

      // 3b. Unique device fingerprints
      AnalyticsEvent.distinct('deviceFingerprint', { timestamp: { $gte: since }, deviceFingerprint: { $ne: null } }),

      // 4. Daily trend (Israel timezone)
      AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: ISRAEL_TZ } },
          pageViews: { $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } },
          actions: { $sum: { $cond: [{ $eq: ['$type', 'action'] }, 1, 0] } },
          total: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),

      // 5. Device breakdown
      AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$deviceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // 6. Top pages (unique visitors by IP)
      AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: since }, type: 'page_view' } },
        { $group: {
          _id: '$page',
          views: { $sum: 1 },
          uniqueIPs: { $addToSet: '$ipAddress' }
        }},
        { $project: {
          _id: 1,
          views: 1,
          uniqueVisitors: { $size: '$uniqueIPs' }
        }},
        { $sort: { views: -1 } },
        { $limit: 15 }
      ]),

      // 7. Top visitors - grouped by IP (real identification)
      AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: since }, ipAddress: { $ne: null } } },
        { $group: {
          _id: '$ipAddress',
          userName: { $last: '$userName' },
          userRole: { $last: '$userRole' },
          events: { $sum: 1 },
          sessions: { $addToSet: '$sessionId' },
          pages: { $addToSet: '$page' },
          devices: { $addToSet: '$deviceType' },
          browsers: { $addToSet: '$browser' },
          os: { $addToSet: '$os' },
          screenResolutions: { $addToSet: '$screenResolution' },
          deviceFingerprints: { $addToSet: '$deviceFingerprint' },
          firstSeen: { $min: '$timestamp' },
          lastSeen: { $max: '$timestamp' }
        }},
        { $project: {
          _id: 1,
          userName: 1,
          userRole: 1,
          events: 1,
          sessionsCount: { $size: '$sessions' },
          pagesVisited: { $size: '$pages' },
          uniqueDevicesCount: { $size: { $filter: { input: '$deviceFingerprints', cond: { $ne: ['$$this', null] } } } },
          devices: 1,
          browsers: 1,
          os: 1,
          screenResolutions: 1,
          firstSeen: 1,
          lastSeen: 1
        }},
        { $sort: { events: -1 } },
        { $limit: 15 }
      ]),

      // 8. Hourly heatmap (Israel timezone!)
      AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: {
          _id: {
            hour: { $hour: { date: '$timestamp', timezone: ISRAEL_TZ } },
            dayOfWeek: { $dayOfWeek: { date: '$timestamp', timezone: ISRAEL_TZ } }
          },
          count: { $sum: 1 }
        }},
        { $sort: { '_id.dayOfWeek': 1, '_id.hour': 1 } }
      ]),

      // 9. Role breakdown
      AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$userRole', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // 10. Browser breakdown
      AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$browser', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // 11. Chat/AI usage stats
      AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: since }, type: 'action', action: { $regex: /^chat_/ } } },
        { $group: {
          _id: '$action',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$ipAddress' }
        }},
        { $project: {
          _id: 1,
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }},
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        kpis: {
          totalEvents,
          uniqueVisitors: uniqueIPs.length,
          uniqueDevices: uniqueDevices.length,
          uniqueSessions: uniqueSessions.length,
          avgEventsPerSession: uniqueSessions.length > 0
            ? Math.round(totalEvents / uniqueSessions.length)
            : 0
        },
        dailyTrend,
        deviceBreakdown,
        topPages,
        topVisitors,
        hourlyHeatmap,
        roleBreakdown,
        browserBreakdown,
        chatUsage,
        period: { days, since: since.toISOString() }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/analytics/admin/events?page=1&limit=20
const getEvents = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, deviceType, filterPage, ip } = req.query;
    const query = {};
    if (type) query.type = type;
    if (deviceType) query.deviceType = deviceType;
    if (filterPage) query.page = filterPage;
    if (ip) query.ipAddress = ip;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const [events, total] = await Promise.all([
      AnalyticsEvent.find(query)
        .sort({ timestamp: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      AnalyticsEvent.countDocuments(query)
    ]);

    res.json({
      data: events,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  trackEvent,
  verifyPassword,
  getOverview,
  getEvents
};
