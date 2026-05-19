const { Customer, Branch, Device, WorkOrder, ServiceLog, ServiceRequest } = require('../models');
const { logCreate, logUpdate, logDelete } = require('../utils/audit');
const { startOfMonth, startOfNextMonth, startOfYear } = require('../utils/dateHelpers');

// @desc    Get all customers
// @route   GET /api/customers
const getCustomers = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20, all } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      // Also match customers whose branches have a matching name or city
      const matchingBranches = await Branch.find(
        { $or: [{ branchName: searchRegex }, { city: searchRegex }] },
        'customerId'
      ).lean();
      const customerIdsFromBranches = matchingBranches
        .map(b => b.customerId)
        .filter(Boolean);
      query.$or = [{ name: searchRegex }];
      if (customerIdsFromBranches.length > 0) {
        query.$or.push({ _id: { $in: customerIdsFromBranches } });
      }
    }

    // Support fetching all for dropdowns (backward compatibility)
    if (all === 'true') {
      const customers = await Customer.find(query).sort({ name: 1 }).lean();
      return res.json(customers);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Aggregate global totals across the FULL filtered set (not just this page)
    // so the page header can show real totals — sum monthlyPrice + sum of all
    // active devices' monthlyRate across every customer that matches `query`.
    const [customers, total, globalTotals] = await Promise.all([
      Customer.find(query).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
      Customer.countDocuments(query),
      Customer.aggregate([
        { $match: query },
        { $group: { _id: null, monthlyPriceSum: { $sum: { $ifNull: ['$monthlyPrice', 0] } } } }
      ])
    ]);
    const totalsByCustomerLevel = globalTotals[0]?.monthlyPriceSum || 0;

    // Sum device-level monthly rates across ALL active branches of customers in the filtered set
    const allMatchingCustomerIds = await Customer.find(query, '_id').lean();
    const allMatchingIds = allMatchingCustomerIds.map(c => c._id);
    const allBranchesForMatching = await Branch.find(
      { customerId: { $in: allMatchingIds }, isActive: { $ne: false } },
      '_id'
    ).lean();
    const allActiveBranchIds = allBranchesForMatching.map(b => b._id);
    const deviceTotalsAgg = await Device.aggregate([
      { $match: { branchId: { $in: allActiveBranchIds }, isActive: true } },
      { $group: { _id: null, totalMonthlyRate: { $sum: { $ifNull: ['$monthlyRate', 0] } } } }
    ]);
    const totalsByDeviceLevel = deviceTotalsAgg[0]?.totalMonthlyRate || 0;

    // Aggregate per-customer counts (branches + devices) for the current page
    const customerIds = customers.map(c => c._id);
    const branches = await Branch.find({ customerId: { $in: customerIds } }, '_id customerId isActive').lean();
    const branchByCustomer = new Map();
    for (const b of branches) {
      const key = b.customerId.toString();
      if (!branchByCustomer.has(key)) branchByCustomer.set(key, []);
      branchByCustomer.get(key).push(b);
    }
    const branchIds = branches.map(b => b._id);
    const deviceAgg = await Device.aggregate([
      { $match: { branchId: { $in: branchIds } } },
      { $group: {
        _id: '$branchId',
        deviceCount: { $sum: 1 },
        activeDeviceCount: { $sum: { $cond: ['$isActive', 1, 0] } },
        totalMonthlyRate: { $sum: { $cond: ['$isActive', { $ifNull: ['$monthlyRate', 0] }, 0] } }
      } }
    ]);
    const aggByBranch = new Map(deviceAgg.map(a => [a._id.toString(), a]));

    const customersEnriched = customers.map(c => {
      const cBranches = branchByCustomer.get(c._id.toString()) || [];
      const branchCount = cBranches.length;
      const activeBranchCount = cBranches.filter(b => b.isActive !== false).length;
      let activeDeviceCount = 0;
      let deviceCount = 0;
      let totalMonthlyRate = 0;
      for (const b of cBranches) {
        const a = aggByBranch.get(b._id.toString());
        if (!a) continue;
        deviceCount += a.deviceCount || 0;
        if (b.isActive !== false) {
          activeDeviceCount += a.activeDeviceCount || 0;
          totalMonthlyRate += a.totalMonthlyRate || 0;
        }
      }
      return {
        ...c,
        branchCount,
        activeBranchCount,
        deviceCount,
        activeDeviceCount,
        computedMonthlyTotal: totalMonthlyRate
      };
    });

    res.json({
      data: customersEnriched,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      totals: {
        // Across the FULL filtered set, not just the current page
        monthlyPriceSum: totalsByCustomerLevel,
        deviceMonthlyRateSum: totalsByDeviceLevel
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single customer with branches
// @route   GET /api/customers/:id
const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'לקוח לא נמצא' });
    }

    const branches = await Branch.find({ customerId: customer._id });
    const branchIds = branches.map(b => b._id);

    // Aggregate device count + monthlyRate sum per branch
    const aggByBranch = await Device.aggregate([
      { $match: { branchId: { $in: branchIds } } },
      { $group: {
        _id: '$branchId',
        deviceCount: { $sum: 1 },
        activeDeviceCount: { $sum: { $cond: ['$isActive', 1, 0] } },
        totalMonthlyRate: { $sum: { $cond: ['$isActive', { $ifNull: ['$monthlyRate', 0] }, 0] } }
      } }
    ]);
    const aggMap = new Map(aggByBranch.map(a => [a._id.toString(), a]));

    const branchesEnriched = branches.map(b => {
      const a = aggMap.get(b._id.toString());
      return {
        ...b.toObject(),
        deviceCount: a?.deviceCount || 0,
        activeDeviceCount: a?.activeDeviceCount || 0,
        totalMonthlyRate: a?.totalMonthlyRate || 0
      };
    });

    const computedMonthlyTotal = branchesEnriched.reduce((s, b) => s + (b.totalMonthlyRate || 0), 0);

    res.json({
      ...customer.toObject(),
      branches: branchesEnriched,
      computedMonthlyTotal
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create customer
// @route   POST /api/customers
const createCustomer = async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    await logCreate(req, 'customer', customer._id, customer.name, customer.toObject());
    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
const updateCustomer = async (req, res) => {
  try {
    const before = await Customer.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'לקוח לא נמצא' });
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    await logUpdate(req, 'customer', customer._id, customer.name, before, customer.toObject());
    res.json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'לקוח לא נמצא' });
    }
    await logDelete(req, 'customer', customer._id, customer.name, customer.toObject());
    res.json({ message: 'לקוח נמחק בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get customer 360° summary — billing, branches, devices status,
//          recent + upcoming work orders, service activity
// @route   GET /api/customers/:id/summary
const getCustomerSummary = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ message: 'לקוח לא נמצא' });
    }

    const branches = await Branch.find({ customerId: customer._id })
      .select('_id branchName city isActive')
      .lean();
    const branchIds = branches.map(b => b._id);
    const activeBranchIds = branches.filter(b => b.isActive !== false).map(b => b._id);

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = startOfNextMonth(now);
    const yearStart = startOfYear(now);

    const [
      deviceTotals,
      deviceStatusAgg,
      upcomingWOs,
      recentlyCompletedWOs,
      woCountsAgg,
      serviceLogsThisMonth,
      serviceLogsThisYear,
      lastServiceLogs,
      serviceRequestsAgg,
      recentServiceRequests
    ] = await Promise.all([
      // Sum monthlyRate of active devices in active branches
      Device.aggregate([
        { $match: { branchId: { $in: activeBranchIds }, isActive: true } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          activeTotal: { $sum: 1 },
          monthlyRateSum: { $sum: { $ifNull: ['$monthlyRate', 0] } }
        }}
      ]),
      // Status breakdown (green/yellow/red/unknown) by days since last refill
      Device.aggregate([
        { $match: { branchId: { $in: branchIds } } },
        { $addFields: {
          daysSinceRefill: {
            $cond: [
              { $eq: ['$lastRefillDate', null] }, null,
              { $divide: [{ $subtract: ['$$NOW', '$lastRefillDate'] }, 1000 * 60 * 60 * 24] }
            ]
          }
        }},
        { $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          green: { $sum: { $cond: [
            { $and: [{ $ne: ['$daysSinceRefill', null] }, { $lte: ['$daysSinceRefill', 20] }, '$isActive'] },
            1, 0
          ]}},
          yellow: { $sum: { $cond: [
            { $and: [{ $gt: ['$daysSinceRefill', 20] }, { $lte: ['$daysSinceRefill', 40] }, '$isActive'] },
            1, 0
          ]}},
          red: { $sum: { $cond: [
            { $and: [{ $gt: ['$daysSinceRefill', 40] }, '$isActive'] },
            1, 0
          ]}},
          unknown: { $sum: { $cond: [
            { $and: [{ $eq: ['$daysSinceRefill', null] }, '$isActive'] },
            1, 0
          ]}}
        }}
      ]),
      // Upcoming 5 work orders
      WorkOrder.find({
        branchId: { $in: branchIds },
        status: { $in: ['pending', 'assigned', 'in_progress'] }
      })
        .sort({ scheduledDate: 1 })
        .limit(5)
        .populate('branchId', 'branchName city')
        .populate('assignedTo', 'name')
        .lean(),
      // Recently completed 5 work orders
      WorkOrder.find({
        branchId: { $in: branchIds },
        status: 'completed'
      })
        .sort({ completedDate: -1 })
        .limit(5)
        .populate('branchId', 'branchName city')
        .populate('assignedTo', 'name')
        .lean(),
      // Work order counts by status
      WorkOrder.aggregate([
        { $match: { branchId: { $in: branchIds } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // Service logs this month — count + total ml
      ServiceLog.aggregate([
        { $lookup: {
          from: 'devices',
          localField: 'deviceId',
          foreignField: '_id',
          as: 'device'
        }},
        { $unwind: '$device' },
        { $match: {
          'device.branchId': { $in: branchIds },
          date: { $gte: monthStart, $lt: monthEnd }
        }},
        { $group: {
          _id: null,
          count: { $sum: 1 },
          totalMl: { $sum: { $ifNull: ['$mlFilled', 0] } }
        }}
      ]),
      // Service logs this year — count
      ServiceLog.aggregate([
        { $lookup: {
          from: 'devices',
          localField: 'deviceId',
          foreignField: '_id',
          as: 'device'
        }},
        { $unwind: '$device' },
        { $match: {
          'device.branchId': { $in: branchIds },
          date: { $gte: yearStart }
        }},
        { $count: 'count' }
      ]),
      // Last 10 service logs for this customer (across all branches/devices)
      ServiceLog.aggregate([
        { $lookup: {
          from: 'devices',
          localField: 'deviceId',
          foreignField: '_id',
          as: 'device'
        }},
        { $unwind: '$device' },
        { $match: { 'device.branchId': { $in: branchIds } } },
        { $sort: { date: -1 } },
        { $limit: 10 },
        { $lookup: {
          from: 'branches',
          localField: 'device.branchId',
          foreignField: '_id',
          as: 'branch'
        }},
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $lookup: {
          from: 'scents',
          localField: 'scentId',
          foreignField: '_id',
          as: 'scent'
        }},
        { $unwind: { path: '$scent', preserveNullAndEmptyArrays: true } },
        { $project: {
          date: 1,
          mlFilled: 1,
          serviceType: 1,
          technicianName: 1,
          technicianNotes: 1,
          issuesFound: 1,
          deviceType: '$device.deviceType',
          locationInBranch: '$device.locationInBranch',
          branchName: '$branch.branchName',
          city: '$branch.city',
          scentName: '$scent.name'
        }}
      ]),
      // Service request counts by status + overdue SLA detection
      ServiceRequest.aggregate([
        { $match: { customerId: customer._id } },
        { $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          overdue: [
            { $match: { status: 'open', targetByDate: { $lt: new Date() } } },
            { $count: 'count' }
          ]
        }}
      ]),
      // 5 most recent service requests
      ServiceRequest.find({ customerId: customer._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('branchId', 'branchName city')
        .select('issueType description urgency status targetByDate createdAt')
        .lean()
    ]);

    const deviceMonthlyTotal = deviceTotals[0]?.monthlyRateSum || 0;
    const monthlyPrice = customer.monthlyPrice || 0;
    const totalMonthlyRevenue = monthlyPrice + deviceMonthlyTotal;

    const statusBreakdown = deviceStatusAgg[0] || {
      total: 0, active: 0, green: 0, yellow: 0, red: 0, unknown: 0
    };

    const woCounts = { pending: 0, assigned: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const row of woCountsAgg) {
      if (row._id in woCounts) woCounts[row._id] = row.count;
    }

    res.json({
      customer: {
        _id: customer._id,
        name: customer.name,
        status: customer.status,
        monthlyPrice,
        billingDetails: customer.billingDetails || {},
        notes: customer.notes
      },
      billing: {
        monthlyPrice,
        deviceMonthlyTotal,
        totalMonthlyRevenue,
        projectedAnnual: totalMonthlyRevenue * 12
      },
      branches: {
        total: branches.length,
        active: branches.filter(b => b.isActive !== false).length,
        inactive: branches.filter(b => b.isActive === false).length
      },
      devices: {
        total: statusBreakdown.total,
        active: statusBreakdown.active,
        statusBreakdown: {
          green: statusBreakdown.green,
          yellow: statusBreakdown.yellow,
          red: statusBreakdown.red,
          unknown: statusBreakdown.unknown
        }
      },
      workOrders: {
        upcoming: upcomingWOs,
        recentlyCompleted: recentlyCompletedWOs,
        counts: woCounts
      },
      serviceLogs: {
        last10: lastServiceLogs,
        totalThisMonth: serviceLogsThisMonth[0]?.count || 0,
        totalMlThisMonth: serviceLogsThisMonth[0]?.totalMl || 0,
        totalThisYear: serviceLogsThisYear[0]?.count || 0
      },
      serviceRequests: (() => {
        const facet = serviceRequestsAgg[0] || { byStatus: [], overdue: [] };
        const counts = { open: 0, scheduled: 0, completed: 0, cancelled: 0 };
        for (const row of facet.byStatus) {
          if (row._id in counts) counts[row._id] = row.count;
        }
        return {
          counts,
          overdueSlaCount: facet.overdue?.[0]?.count || 0,
          recent: recentServiceRequests
        };
      })()
    });
  } catch (error) {
    console.error('getCustomerSummary error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCustomers,
  getCustomer,
  getCustomerSummary,
  createCustomer,
  updateCustomer,
  deleteCustomer
};
