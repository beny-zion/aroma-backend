const { Customer, Branch, Device, ServiceLog, WorkOrder } = require('../models');

// @desc    Revenue overview — current MRR + service activity trend + top customers
// @route   GET /api/reports/revenue?months=12
// @access  admin / manager
//
// IMPORTANT: There is no Invoice/Payment model yet (Phase 3 in the roadmap).
// "Revenue" here means contractual MRR (Customer.monthlyPrice + sum of Device.monthlyRate).
// The trend shows SERVICE ACTIVITY per month (ServiceLog count, completed WOs),
// not paid invoices. Field names use `estimated*` to make this explicit.
const getRevenueReport = async (req, res) => {
  try {
    const months = Math.min(36, Math.max(1, Number(req.query.months) || 12));

    // Window for the trend: first day of (months-1) ago through next month start
    const now = new Date();
    const trendStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const trendEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      customerMonthlySumAgg,
      deviceMonthlyRateAgg,
      activeCustomersCount,
      activeDevicesCount,
      activeBranchesCount,
      serviceTrendAgg,
      completedWOTrendAgg,
      topCustomersAgg
    ] = await Promise.all([
      // Sum of Customer.monthlyPrice (active customers only)
      Customer.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, sum: { $sum: { $ifNull: ['$monthlyPrice', 0] } } } }
      ]),
      // Sum of Device.monthlyRate (active devices in active branches of active customers)
      Customer.aggregate([
        { $match: { status: 'active' } },
        { $lookup: { from: 'branches', localField: '_id', foreignField: 'customerId', as: 'branches' } },
        { $unwind: '$branches' },
        { $match: { 'branches.isActive': { $ne: false } } },
        { $lookup: { from: 'devices', localField: 'branches._id', foreignField: 'branchId', as: 'devices' } },
        { $unwind: '$devices' },
        { $match: { 'devices.isActive': true } },
        { $group: { _id: null, sum: { $sum: { $ifNull: ['$devices.monthlyRate', 0] } } } }
      ]),
      Customer.countDocuments({ status: 'active' }),
      Device.countDocuments({ isActive: true }),
      Branch.countDocuments({ isActive: { $ne: false } }),
      // Service activity trend (group by year-month)
      ServiceLog.aggregate([
        { $match: { date: { $gte: trendStart, $lt: trendEnd } } },
        { $group: {
          _id: { y: { $year: '$date' }, m: { $month: '$date' } },
          serviceLogCount: { $sum: 1 },
          uniqueDevices: { $addToSet: '$deviceId' }
        }},
        { $project: {
          _id: 0,
          year: '$_id.y',
          month: '$_id.m',
          serviceLogCount: 1,
          uniqueDevicesCount: { $size: '$uniqueDevices' }
        }},
        { $sort: { year: 1, month: 1 } }
      ]),
      // Completed work orders per month
      WorkOrder.aggregate([
        { $match: {
          status: 'completed',
          completedDate: { $gte: trendStart, $lt: trendEnd }
        }},
        { $group: {
          _id: { y: { $year: '$completedDate' }, m: { $month: '$completedDate' } },
          completedCount: { $sum: 1 }
        }},
        { $project: { _id: 0, year: '$_id.y', month: '$_id.m', completedCount: 1 }},
        { $sort: { year: 1, month: 1 } }
      ]),
      // Top 10 customers by computed monthly revenue (contract + devices)
      Customer.aggregate([
        { $match: { status: 'active' } },
        { $lookup: { from: 'branches', localField: '_id', foreignField: 'customerId', as: 'branches' } },
        { $addFields: {
          activeBranchIds: {
            $map: {
              input: { $filter: { input: '$branches', as: 'b', cond: { $ne: ['$$b.isActive', false] } } },
              as: 'b',
              in: '$$b._id'
            }
          }
        }},
        { $lookup: {
          from: 'devices',
          let: { branchIds: '$activeBranchIds' },
          pipeline: [
            { $match: { $expr: { $and: [{ $in: ['$branchId', '$$branchIds'] }, { $eq: ['$isActive', true] }] } } },
            { $group: { _id: null, sum: { $sum: { $ifNull: ['$monthlyRate', 0] } } } }
          ],
          as: 'deviceTotals'
        }},
        { $addFields: {
          deviceMonthlyTotal: { $ifNull: [{ $arrayElemAt: ['$deviceTotals.sum', 0] }, 0] },
          monthlyPriceSafe: { $ifNull: ['$monthlyPrice', 0] }
        }},
        { $addFields: {
          totalMonthlyRevenue: { $add: ['$monthlyPriceSafe', '$deviceMonthlyTotal'] }
        }},
        { $sort: { totalMonthlyRevenue: -1 } },
        { $limit: 10 },
        { $project: {
          _id: 1,
          name: 1,
          monthlyPrice: '$monthlyPriceSafe',
          deviceMonthlyTotal: 1,
          totalMonthlyRevenue: 1,
          branchCount: { $size: '$activeBranchIds' }
        }}
      ])
    ]);

    const monthlyPriceSum = customerMonthlySumAgg[0]?.sum || 0;
    const deviceMonthlyRateSum = deviceMonthlyRateAgg[0]?.sum || 0;
    const totalMRR = monthlyPriceSum + deviceMonthlyRateSum;

    // Merge service trend + WO trend into a single time series, filling empty months with 0
    const trend = [];
    const serviceMap = new Map(serviceTrendAgg.map(r => [`${r.year}-${r.month}`, r]));
    const woMap = new Map(completedWOTrendAgg.map(r => [`${r.year}-${r.month}`, r]));

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = `${y}-${m}`;
      const sv = serviceMap.get(key);
      const wo = woMap.get(key);
      trend.push({
        month: `${y}-${String(m).padStart(2, '0')}`,
        year: y,
        monthNum: m,
        serviceLogCount: sv?.serviceLogCount || 0,
        uniqueDevicesCount: sv?.uniqueDevicesCount || 0,
        completedWorkOrders: wo?.completedCount || 0
      });
    }

    res.json({
      current: {
        monthlyPriceSum,
        deviceMonthlyRateSum,
        totalMRR,
        projectedAnnual: totalMRR * 12,
        activeCustomersCount,
        activeBranchesCount,
        activeDevicesCount
      },
      trend,
      topCustomers: topCustomersAgg,
      meta: {
        months,
        revenueBasis: 'contract_mrr',
        note: 'הכנסה מבוססת MRR חוזה — לא כולל חשבוניות/תשלומים בפועל (יתווסף בשלב 3)'
      }
    });
  } catch (error) {
    console.error('getRevenueReport error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getRevenueReport };
