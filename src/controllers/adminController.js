const Customer = require('../models/Customer');
const Branch = require('../models/Branch');
const Device = require('../models/Device');
const Scent = require('../models/Scent');
const ServiceLog = require('../models/ServiceLog');

// Get comprehensive dashboard statistics using MongoDB aggregations
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);

    // Run all aggregations in parallel for performance
    const [
      mrrResult,
      deviceStats,
      branchCount,
      serviceCallsCount,
      refillStatusStats,
      geoDistribution,
      lowStockScents,
      popularScents,
      recentActivity
    ] = await Promise.all([
      // 1. MRR - Monthly Recurring Revenue from active customers
      Customer.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, totalMRR: { $sum: '$monthlyPrice' }, count: { $sum: 1 } } }
      ]),

      // 2. Active devices count
      Device.countDocuments({ isActive: true }),

      // 3. Active branches count
      Branch.countDocuments({ isActive: true }),

      // 4. Open service calls (issues found, not resolved)
      ServiceLog.countDocuments({
        issuesFound: { $exists: true, $ne: '' },
        serviceType: { $in: ['repair', 'replacement'] }
      }),

      // 5. Refill status breakdown (green/yellow/red)
      Device.aggregate([
        { $match: { isActive: true } },
        {
          $project: {
            status: {
              $cond: {
                if: { $eq: ['$lastRefillDate', null] },
                then: 'unknown',
                else: {
                  $cond: {
                    if: { $lte: [{ $subtract: [today, '$lastRefillDate'] }, 30 * 24 * 60 * 60 * 1000] },
                    then: 'green',
                    else: {
                      $cond: {
                        if: { $lte: [{ $subtract: [today, '$lastRefillDate'] }, 45 * 24 * 60 * 60 * 1000] },
                        then: 'yellow',
                        else: 'red'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),

      // 6. Geographic distribution by city
      Branch.aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'devices',
            localField: '_id',
            foreignField: 'branchId',
            as: 'devices'
          }
        },
        {
          $project: {
            city: { $ifNull: ['$city', 'לא צוין'] },
            deviceCount: {
              $size: {
                $filter: {
                  input: '$devices',
                  as: 'device',
                  cond: { $eq: ['$$device.isActive', true] }
                }
              }
            }
          }
        },
        { $group: { _id: '$city', totalDevices: { $sum: '$deviceCount' }, branchCount: { $sum: 1 } } },
        { $sort: { totalDevices: -1 } },
        { $limit: 10 }
      ]),

      // 7. Low stock scents (below minStockAlert)
      Scent.find({
        isActive: true,
        $expr: { $lt: ['$stockQuantity', '$minStockAlert'] }
      }).sort({ stockQuantity: 1 }).limit(5).lean(),

      // 8. Popular scents (most used in devices)
      Device.aggregate([
        { $match: { isActive: true, scentId: { $exists: true, $ne: null } } },
        { $group: { _id: '$scentId', usageCount: { $sum: 1 } } },
        { $sort: { usageCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'scents',
            localField: '_id',
            foreignField: '_id',
            as: 'scentInfo'
          }
        },
        { $unwind: '$scentInfo' },
        {
          $project: {
            _id: 1,
            name: '$scentInfo.name',
            usageCount: 1,
            stockQuantity: '$scentInfo.stockQuantity'
          }
        }
      ]),

      // 9. Recent activity (last 10 events)
      ServiceLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate({
          path: 'deviceId',
          select: 'locationInBranch deviceType',
          populate: {
            path: 'branchId',
            select: 'branchName city',
            populate: {
              path: 'customerId',
              select: 'name'
            }
          }
        })
        .populate('scentId', 'name')
        .lean()
    ]);

    // Process refill status stats into a more usable format
    const refillStatusMap = { green: 0, yellow: 0, red: 0, unknown: 0 };
    refillStatusStats.forEach(item => {
      refillStatusMap[item._id] = item.count;
    });

    const totalDevicesForStatus = Object.values(refillStatusMap).reduce((a, b) => a + b, 0);

    // Format recent activity into readable messages
    const formattedActivity = recentActivity.map(log => {
      const branchName = log.deviceId?.branchId?.branchName || 'סניף לא ידוע';
      const customerName = log.deviceId?.branchId?.customerId?.name || '';
      const scentName = log.scentId?.name || 'ריח לא צוין';
      const location = log.deviceId?.locationInBranch || '';

      let message = '';
      let type = log.serviceType;

      switch (log.serviceType) {
        case 'refill':
          message = `בוצע מילוי ב${branchName}${location ? ` (${location})` : ''} - ${log.mlFilled} מ"ל ${scentName}`;
          break;
        case 'repair':
          message = `בוצע תיקון ב${branchName}${location ? ` (${location})` : ''}`;
          break;
        case 'installation':
          message = `הותקן מכשיר חדש ב${branchName}${customerName ? ` - ${customerName}` : ''}`;
          break;
        case 'removal':
          message = `הוסר מכשיר מ${branchName}`;
          break;
        case 'replacement':
          message = `הוחלף מכשיר ב${branchName}`;
          break;
        default:
          message = `פעולת שירות ב${branchName}`;
      }

      return {
        id: log._id,
        message,
        type,
        date: log.createdAt,
        technicianName: log.technicianName
      };
    });

    // Build the response
    res.json({
      success: true,
      data: {
        // KPI Section
        kpis: {
          mrr: mrrResult[0]?.totalMRR || 0,
          activeCustomers: mrrResult[0]?.count || 0,
          activeDevices: deviceStats,
          activeBranches: branchCount,
          openServiceCalls: serviceCallsCount
        },

        // Operational Health
        refillStatus: {
          green: refillStatusMap.green,
          yellow: refillStatusMap.yellow,
          red: refillStatusMap.red,
          unknown: refillStatusMap.unknown,
          total: totalDevicesForStatus,
          percentages: {
            green: totalDevicesForStatus ? Math.round((refillStatusMap.green / totalDevicesForStatus) * 100) : 0,
            yellow: totalDevicesForStatus ? Math.round((refillStatusMap.yellow / totalDevicesForStatus) * 100) : 0,
            red: totalDevicesForStatus ? Math.round((refillStatusMap.red / totalDevicesForStatus) * 100) : 0
          }
        },

        // Geographic Distribution
        geoDistribution: geoDistribution.map(item => ({
          city: item._id,
          deviceCount: item.totalDevices,
          branchCount: item.branchCount
        })),

        // Inventory Intelligence
        inventory: {
          lowStock: lowStockScents.map(scent => ({
            id: scent._id,
            name: scent.name,
            stockQuantity: scent.stockQuantity,
            minStockAlert: scent.minStockAlert,
            unit: scent.unit,
            urgency: scent.stockQuantity === 0 ? 'critical' : 'warning'
          })),
          popularScents: popularScents.map(scent => ({
            id: scent._id,
            name: scent.name,
            usageCount: scent.usageCount,
            stockQuantity: scent.stockQuantity
          }))
        },

        // Recent Activity
        recentActivity: formattedActivity,

        // Metadata
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בטעינת נתוני הדשבורד',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getDashboardStats
};
