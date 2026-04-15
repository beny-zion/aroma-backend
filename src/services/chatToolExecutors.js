/**
 * SECURITY: ALL functions in this file MUST be READ-ONLY.
 * Do NOT add any create/update/delete operations.
 * Every function must only use: find, findById, findOne, aggregate, countDocuments, lean.
 */

const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Branch = require('../models/Branch');
const Device = require('../models/Device');
const ServiceLog = require('../models/ServiceLog');
const Scent = require('../models/Scent');
const WorkOrder = require('../models/WorkOrder');
const User = require('../models/User');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ============ Fuzzy Search Helpers ============

// Generate search variations for Hebrew text
function generateSearchVariations(text) {
  if (!text) return [];
  const clean = text.trim();
  const variations = new Set();
  variations.add(clean);

  // Split into words and add each word
  const words = clean.split(/\s+/);
  for (const w of words) {
    if (w.length >= 2) variations.add(w);
  }

  // Hebrew double-letter variations (יי↔י, וו↔ו, etc.)
  const doubleMap = { 'יי': 'י', 'וו': 'ו', 'טט': 'ט', 'לל': 'ל', 'ננ': 'נ', 'ממ': 'מ', 'ססס': 'ס' };
  for (const [doubled, single] of Object.entries(doubleMap)) {
    if (clean.includes(single) && !clean.includes(doubled)) {
      variations.add(clean.replace(new RegExp(single, 'g'), doubled));
    }
    if (clean.includes(doubled)) {
      variations.add(clean.replace(new RegExp(doubled, 'g'), single));
    }
  }

  // Common Hebrew-English transliterations in business names
  const hebrewToEnglish = { 'היצ': 'H', 'אייצ': 'H', 'איי': 'I', 'ביג': 'BIG', 'סי': 'C', 'אם': 'M', 'אל': 'L', 'ג׳י': 'G', 'די': 'D', 'אס': 'S' };
  for (const [heb, eng] of Object.entries(hebrewToEnglish)) {
    if (clean.includes(heb)) {
      variations.add(clean.replace(heb, eng).trim());
      // Also try without the English part
      variations.add(clean.replace(heb, '').trim());
    }
  }

  // First 3 chars for very short fuzzy
  if (clean.length > 3) {
    variations.add(clean.substring(0, 3));
  }

  return [...variations].filter(v => v.length >= 2);
}

// Search with fuzzy matching - tries multiple variations
async function fuzzySearch(Model, fieldName, searchTerm, selectFields, limit = 20) {
  if (!searchTerm) {
    return Model.find().select(selectFields).sort({ [fieldName]: 1 }).limit(limit).lean();
  }

  const variations = generateSearchVariations(searchTerm);

  for (const variation of variations) {
    const query = { [fieldName]: { $regex: variation, $options: 'i' } };
    const results = await Model.find(query).select(selectFields).sort({ [fieldName]: 1 }).limit(limit).lean();
    if (results.length > 0) return results;
  }

  // Nothing found - return all items so the AI can show options
  return Model.find().select(selectFields).sort({ [fieldName]: 1 }).limit(limit).lean();
}

// Helper: compute refill status from lastRefillDate
function getRefillStatus(lastRefillDate) {
  if (!lastRefillDate) return 'unknown';
  const daysSince = Math.floor((Date.now() - new Date(lastRefillDate).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince <= 30) return 'green';
  if (daysSince <= 45) return 'yellow';
  return 'red';
}

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

const executors = {
  // Tool 1: Search customers (with fuzzy search)
  search_customers: async (args) => {
    const limit = Math.min(args.limit || 10, 20);
    let customers;

    if (args.search) {
      // Use fuzzy search with Hebrew variations
      const statusFilter = args.status ? { status: args.status } : {};
      const variations = generateSearchVariations(args.search);

      for (const variation of variations) {
        const query = { name: { $regex: variation, $options: 'i' }, ...statusFilter };
        customers = await Customer.find(query).select('name status monthlyPrice').sort({ name: 1 }).limit(limit).lean();
        if (customers.length > 0) break;
      }

      // If still nothing - get all customers
      if (!customers || customers.length === 0) {
        customers = await Customer.find(statusFilter).select('name status monthlyPrice').sort({ name: 1 }).limit(limit).lean();
      }
    } else {
      const query = {};
      if (args.status) query.status = args.status;
      customers = await Customer.find(query).select('name status monthlyPrice').sort({ name: 1 }).limit(limit).lean();
    }

    // Enrich with branch count
    const customerIds = customers.map(c => c._id);
    const branchCounts = await Branch.aggregate([
      { $match: { customerId: { $in: customerIds } } },
      { $group: { _id: '$customerId', count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(branchCounts.map(b => [b._id.toString(), b.count]));

    return {
      customers: customers.map(c => ({
        _id: c._id,
        name: c.name,
        status: c.status,
        monthlyPrice: c.monthlyPrice,
        branchCount: countMap[c._id.toString()] || 0
      })),
      totalFound: customers.length
    };
  },

  // Tool 2: Get customer details
  get_customer_details: async (args) => {
    if (!isValidId(args.customerId)) return { error: 'מזהה לקוח לא תקין' };

    const customer = await Customer.findById(args.customerId)
      .select('name status monthlyPrice billingDetails notes')
      .lean();
    if (!customer) return { error: 'לקוח לא נמצא' };

    const branches = await Branch.find({ customerId: customer._id })
      .select('branchName city region isActive')
      .lean();

    // Get device counts per branch
    const branchIds = branches.map(b => b._id);
    const deviceStats = await Device.aggregate([
      { $match: { branchId: { $in: branchIds }, isActive: true } },
      {
        $group: {
          _id: '$branchId',
          total: { $sum: 1 },
          green: {
            $sum: {
              $cond: [{
                $and: [
                  { $ne: ['$lastRefillDate', null] },
                  { $gte: ['$lastRefillDate', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] }
                ]
              }, 1, 0]
            }
          },
          red: {
            $sum: {
              $cond: [{
                $or: [
                  { $eq: ['$lastRefillDate', null] },
                  { $lt: ['$lastRefillDate', new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)] }
                ]
              }, 1, 0]
            }
          }
        }
      }
    ]);
    const statsMap = Object.fromEntries(deviceStats.map(s => [s._id.toString(), s]));

    return {
      customer: {
        _id: customer._id,
        name: customer.name,
        status: customer.status,
        monthlyPrice: customer.monthlyPrice,
        phone: customer.billingDetails?.phone,
        email: customer.billingDetails?.email
      },
      branches: branches.map(b => {
        const stats = statsMap[b._id.toString()] || { total: 0, green: 0, red: 0 };
        return {
          _id: b._id,
          branchName: b.branchName,
          city: b.city,
          region: b.region,
          isActive: b.isActive,
          totalDevices: stats.total,
          greenDevices: stats.green,
          yellowDevices: stats.total - stats.green - stats.red,
          redDevices: stats.red
        };
      }),
      totalBranches: branches.length
    };
  },

  // Tool 3: Search branches (with fuzzy search)
  search_branches: async (args) => {
    const limit = Math.min(args.limit || 10, 20);
    const baseQuery = {};
    if (args.city) baseQuery.city = { $regex: args.city, $options: 'i' };
    if (args.region) baseQuery.region = { $regex: args.region, $options: 'i' };
    if (args.customerId && isValidId(args.customerId)) {
      baseQuery.customerId = new mongoose.Types.ObjectId(args.customerId);
    }

    let branches;
    if (args.search) {
      const variations = generateSearchVariations(args.search);
      for (const variation of variations) {
        const query = { ...baseQuery, branchName: { $regex: variation, $options: 'i' } };
        branches = await Branch.find(query)
          .populate('customerId', 'name')
          .select('branchName city region contactPerson isActive customerId')
          .sort({ branchName: 1 })
          .limit(limit)
          .lean();
        if (branches.length > 0) break;
      }
      // Also try searching by customer name if branch search failed
      if (!branches || branches.length === 0) {
        for (const variation of variations) {
          const customers = await Customer.find({ name: { $regex: variation, $options: 'i' } }).select('_id').lean();
          if (customers.length > 0) {
            const customerIds = customers.map(c => c._id);
            branches = await Branch.find({ ...baseQuery, customerId: { $in: customerIds } })
              .populate('customerId', 'name')
              .select('branchName city region contactPerson isActive customerId')
              .sort({ branchName: 1 })
              .limit(limit)
              .lean();
            if (branches.length > 0) break;
          }
        }
      }
      // Still nothing - return all branches
      if (!branches || branches.length === 0) {
        branches = await Branch.find(baseQuery)
          .populate('customerId', 'name')
          .select('branchName city region contactPerson isActive customerId')
          .sort({ branchName: 1 })
          .limit(limit)
          .lean();
      }
    } else {
      branches = await Branch.find(baseQuery)
        .populate('customerId', 'name')
        .select('branchName city region contactPerson isActive customerId')
        .sort({ branchName: 1 })
        .limit(limit)
        .lean();
    }

    // Get device status counts per branch
    const branchIds = branches.map(b => b._id);
    const deviceStats = await Device.aggregate([
      { $match: { branchId: { $in: branchIds }, isActive: true } },
      {
        $group: {
          _id: '$branchId',
          total: { $sum: 1 },
          green: {
            $sum: {
              $cond: [{
                $and: [
                  { $ne: ['$lastRefillDate', null] },
                  { $gte: ['$lastRefillDate', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] }
                ]
              }, 1, 0]
            }
          },
          red: {
            $sum: {
              $cond: [{
                $or: [
                  { $eq: ['$lastRefillDate', null] },
                  { $lt: ['$lastRefillDate', new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)] }
                ]
              }, 1, 0]
            }
          }
        }
      }
    ]);
    const statsMap = Object.fromEntries(deviceStats.map(s => [s._id.toString(), s]));

    return {
      branches: branches.map(b => {
        const stats = statsMap[b._id.toString()] || { total: 0, green: 0, red: 0 };
        return {
          _id: b._id,
          branchName: b.branchName,
          city: b.city,
          region: b.region,
          customerName: b.customerId?.name || 'לא ידוע',
          customerId: b.customerId?._id,
          isActive: b.isActive,
          totalDevices: stats.total,
          greenDevices: stats.green,
          yellowDevices: stats.total - stats.green - stats.red,
          redDevices: stats.red
        };
      }),
      totalFound: branches.length
    };
  },

  // Tool 4: Get branch details
  get_branch_details: async (args) => {
    if (!isValidId(args.branchId)) return { error: 'מזהה סניף לא תקין' };

    const branch = await Branch.findById(args.branchId)
      .populate('customerId', 'name status')
      .lean();
    if (!branch) return { error: 'סניף לא נמצא' };

    const devices = await Device.find({ branchId: branch._id })
      .populate('scentId', 'name')
      .select('deviceType locationInBranch lastRefillDate nextScheduledRefill isActive scentId refillIntervalDays')
      .sort({ isActive: -1, nextScheduledRefill: 1 })
      .limit(50)
      .lean();

    return {
      branch: {
        _id: branch._id,
        branchName: branch.branchName,
        address: branch.address,
        city: branch.city,
        region: branch.region,
        contactPerson: branch.contactPerson,
        contactPhone: branch.contactPhone,
        customerName: branch.customerId?.name,
        customerId: branch.customerId?._id,
        isActive: branch.isActive
      },
      devices: devices.map(d => ({
        _id: d._id,
        deviceType: d.deviceType,
        location: d.locationInBranch,
        scent: d.scentId?.name || 'לא מוגדר',
        isActive: d.isActive,
        status: getRefillStatus(d.lastRefillDate),
        daysSinceRefill: daysSince(d.lastRefillDate),
        lastRefill: d.lastRefillDate ? new Date(d.lastRefillDate).toISOString().split('T')[0] : null,
        nextRefill: d.nextScheduledRefill ? new Date(d.nextScheduledRefill).toISOString().split('T')[0] : null
      })),
      summary: {
        total: devices.length,
        active: devices.filter(d => d.isActive).length,
        green: devices.filter(d => getRefillStatus(d.lastRefillDate) === 'green').length,
        yellow: devices.filter(d => getRefillStatus(d.lastRefillDate) === 'yellow').length,
        red: devices.filter(d => getRefillStatus(d.lastRefillDate) === 'red').length,
        unknown: devices.filter(d => getRefillStatus(d.lastRefillDate) === 'unknown').length
      }
    };
  },

  // Tool 5: Search devices
  search_devices: async (args) => {
    const query = { isActive: true };
    if (args.branchId && isValidId(args.branchId)) {
      query.branchId = new mongoose.Types.ObjectId(args.branchId);
    }
    if (args.deviceType) query.deviceType = { $regex: args.deviceType, $options: 'i' };

    // Status filtering
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

    if (args.status === 'green') {
      query.lastRefillDate = { $gte: thirtyDaysAgo };
    } else if (args.status === 'yellow') {
      query.lastRefillDate = { $lt: thirtyDaysAgo, $gte: fortyFiveDaysAgo };
    } else if (args.status === 'red') {
      query.$or = [
        { lastRefillDate: { $lt: fortyFiveDaysAgo } },
        { lastRefillDate: null }
      ];
    } else if (args.status === 'unknown') {
      query.lastRefillDate = null;
    }

    const limit = Math.min(args.limit || 10, 30);

    const devices = await Device.find(query)
      .populate({ path: 'branchId', populate: { path: 'customerId', select: 'name' } })
      .populate('scentId', 'name')
      .sort({ nextScheduledRefill: 1 })
      .limit(limit)
      .lean();

    return {
      devices: devices.map(d => ({
        _id: d._id,
        deviceType: d.deviceType,
        location: d.locationInBranch,
        branch: d.branchId?.branchName || 'לא ידוע',
        branchId: d.branchId?._id,
        customer: d.branchId?.customerId?.name || 'לא ידוע',
        scent: d.scentId?.name || 'לא מוגדר',
        status: getRefillStatus(d.lastRefillDate),
        daysSinceRefill: daysSince(d.lastRefillDate),
        lastRefill: d.lastRefillDate ? new Date(d.lastRefillDate).toISOString().split('T')[0] : null
      })),
      totalFound: devices.length
    };
  },

  // Tool 6: Get device details
  get_device_details: async (args) => {
    if (!isValidId(args.deviceId)) return { error: 'מזהה מכשיר לא תקין' };

    const device = await Device.findById(args.deviceId)
      .populate({ path: 'branchId', populate: { path: 'customerId', select: 'name' } })
      .populate('scentId', 'name')
      .lean();
    if (!device) return { error: 'מכשיר לא נמצא' };

    return {
      device: {
        _id: device._id,
        deviceType: device.deviceType,
        location: device.locationInBranch,
        branch: device.branchId?.branchName,
        branchId: device.branchId?._id,
        customer: device.branchId?.customerId?.name,
        customerId: device.branchId?.customerId?._id,
        scent: device.scentId?.name || 'לא מוגדר',
        isActive: device.isActive,
        status: getRefillStatus(device.lastRefillDate),
        daysSinceRefill: daysSince(device.lastRefillDate),
        lastRefill: device.lastRefillDate ? new Date(device.lastRefillDate).toISOString().split('T')[0] : null,
        nextRefill: device.nextScheduledRefill ? new Date(device.nextScheduledRefill).toISOString().split('T')[0] : null,
        refillIntervalDays: device.refillIntervalDays,
        mlPerRefill: device.mlPerRefill,
        notes: device.notes
      }
    };
  },

  // Tool 7: Get device service history
  get_device_service_history: async (args) => {
    if (!isValidId(args.deviceId)) return { error: 'מזהה מכשיר לא תקין' };
    const limit = Math.min(args.limit || 10, 20);

    const logs = await ServiceLog.find({ deviceId: args.deviceId })
      .populate('scentId', 'name')
      .select('date mlFilled scentId technicianName serviceType issuesFound technicianNotes')
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    return {
      serviceLogs: logs.map(l => ({
        date: new Date(l.date).toISOString().split('T')[0],
        serviceType: l.serviceType,
        mlFilled: l.mlFilled,
        scent: l.scentId?.name || 'לא ידוע',
        technician: l.technicianName,
        issues: l.issuesFound || null,
        notes: l.technicianNotes || null
      })),
      totalLogs: logs.length,
      deviceId: args.deviceId
    };
  },

  // Tool 8: Get devices due for refill
  get_devices_due_for_refill: async (args) => {
    const days = args.days || 45;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(days));

    let matchStage = {
      isActive: true,
      $or: [
        { nextScheduledRefill: { $lte: targetDate } },
        { nextScheduledRefill: null },
        { lastRefillDate: null }
      ]
    };

    let devices = await Device.find(matchStage)
      .populate({
        path: 'branchId',
        populate: { path: 'customerId', select: 'name' }
      })
      .populate('scentId', 'name')
      .sort({ nextScheduledRefill: 1 })
      .lean();

    // Filter by city or customer if specified
    if (args.city) {
      const cityRegex = new RegExp(args.city, 'i');
      devices = devices.filter(d => d.branchId?.city && cityRegex.test(d.branchId.city));
    }
    if (args.customerId && isValidId(args.customerId)) {
      devices = devices.filter(d => d.branchId?.customerId?._id?.toString() === args.customerId);
    }

    // Group by status
    const overdue = [];
    const dueSoon = [];
    const unknown = [];

    for (const d of devices) {
      const status = getRefillStatus(d.lastRefillDate);
      const item = {
        _id: d._id,
        deviceType: d.deviceType,
        location: d.locationInBranch,
        branch: d.branchId?.branchName,
        branchId: d.branchId?._id,
        customer: d.branchId?.customerId?.name,
        status,
        daysSinceRefill: daysSince(d.lastRefillDate)
      };

      if (status === 'red') overdue.push(item);
      else if (status === 'yellow') dueSoon.push(item);
      else if (status === 'unknown') unknown.push(item);
    }

    return {
      overdue: overdue.slice(0, 20),
      dueSoon: dueSoon.slice(0, 20),
      unknown: unknown.slice(0, 10),
      summary: {
        overdueCount: overdue.length,
        dueSoonCount: dueSoon.length,
        unknownCount: unknown.length,
        totalDue: overdue.length + dueSoon.length + unknown.length
      }
    };
  },

  // Tool 9: Get inventory status
  get_inventory_status: async (args) => {
    const query = { isActive: true };
    if (args.lowStockOnly) {
      query.$expr = { $lt: ['$stockQuantity', '$minStockAlert'] };
    }

    const scents = await Scent.find(query)
      .select('name stockQuantity unit minStockAlert')
      .sort({ stockQuantity: 1 })
      .limit(50)
      .lean();

    return {
      scents: scents.map(s => ({
        _id: s._id,
        name: s.name,
        stockQuantity: s.stockQuantity,
        unit: s.unit,
        minStockAlert: s.minStockAlert,
        isLowStock: s.stockQuantity < s.minStockAlert
      })),
      summary: {
        totalScents: scents.length,
        lowStockCount: scents.filter(s => s.stockQuantity < s.minStockAlert).length
      }
    };
  },

  // Tool 10: Get dashboard summary
  get_dashboard_summary: async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

    const [mrrResult, activeDevices, activeBranches, activeCustomers, refillStatus, recentActivity] = await Promise.all([
      Customer.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, totalMRR: { $sum: '$monthlyPrice' }, count: { $sum: 1 } } }
      ]),
      Device.countDocuments({ isActive: true }),
      Branch.countDocuments({ isActive: true }),
      Customer.countDocuments({ status: 'active' }),
      Device.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            green: {
              $sum: { $cond: [{ $and: [{ $ne: ['$lastRefillDate', null] }, { $gte: ['$lastRefillDate', thirtyDaysAgo] }] }, 1, 0] }
            },
            yellow: {
              $sum: {
                $cond: [{
                  $and: [
                    { $ne: ['$lastRefillDate', null] },
                    { $lt: ['$lastRefillDate', thirtyDaysAgo] },
                    { $gte: ['$lastRefillDate', fortyFiveDaysAgo] }
                  ]
                }, 1, 0]
              }
            },
            red: {
              $sum: { $cond: [{ $or: [{ $eq: ['$lastRefillDate', null] }, { $lt: ['$lastRefillDate', fortyFiveDaysAgo] }] }, 1, 0] }
            }
          }
        }
      ]),
      ServiceLog.find()
        .sort({ date: -1 })
        .limit(5)
        .populate({ path: 'deviceId', select: 'deviceType locationInBranch', populate: { path: 'branchId', select: 'branchName' } })
        .populate('scentId', 'name')
        .lean()
    ]);

    const mrr = mrrResult[0] || { totalMRR: 0, count: 0 };
    const status = refillStatus[0] || { total: 0, green: 0, yellow: 0, red: 0 };

    return {
      kpis: {
        mrr: mrr.totalMRR,
        activeCustomers,
        activeBranches,
        activeDevices
      },
      refillStatus: {
        total: status.total,
        green: status.green,
        yellow: status.yellow,
        red: status.red
      },
      recentActivity: recentActivity.map(a => ({
        date: new Date(a.date).toISOString().split('T')[0],
        type: a.serviceType,
        device: a.deviceId?.deviceType,
        branch: a.deviceId?.branchId?.branchName,
        scent: a.scentId?.name,
        technician: a.technicianName
      }))
    };
  },

  // Tool 11: Get work orders
  get_work_orders: async (args) => {
    const query = {};
    if (args.status) query.status = args.status;
    if (args.priority) query.priority = args.priority;
    if (args.type) query.type = args.type;
    if (args.assignedTo && isValidId(args.assignedTo)) query.assignedTo = args.assignedTo;
    if (args.branchId && isValidId(args.branchId)) query.branchId = args.branchId;
    const limit = Math.min(args.limit || 10, 20);

    const workOrders = await WorkOrder.find(query)
      .populate({ path: 'branchId', select: 'branchName city', populate: { path: 'customerId', select: 'name' } })
      .populate('assignedTo', 'name')
      .select('status priority type scheduledDate completedDate branchId assignedTo notes')
      .sort({ scheduledDate: 1 })
      .limit(limit)
      .lean();

    return {
      workOrders: workOrders.map(wo => ({
        _id: wo._id,
        status: wo.status,
        priority: wo.priority,
        type: wo.type,
        scheduledDate: wo.scheduledDate ? new Date(wo.scheduledDate).toISOString().split('T')[0] : null,
        completedDate: wo.completedDate ? new Date(wo.completedDate).toISOString().split('T')[0] : null,
        branch: wo.branchId?.branchName,
        branchId: wo.branchId?._id,
        city: wo.branchId?.city,
        customer: wo.branchId?.customerId?.name,
        technician: wo.assignedTo?.name || 'לא משובץ',
        notes: wo.notes
      })),
      totalFound: workOrders.length
    };
  },

  // Tool 12: Get technicians
  get_technicians: async (args) => {
    const query = { role: 'technician', isActive: true };
    if (args.region) {
      query.assignedRegions = { $regex: args.region, $options: 'i' };
    }

    const technicians = await User.find(query)
      .select('name phone assignedRegions lastLogin')
      .sort({ name: 1 })
      .lean();

    // Count active work orders per technician
    const techIds = technicians.map(t => t._id);
    const workOrderCounts = await WorkOrder.aggregate([
      { $match: { assignedTo: { $in: techIds }, status: { $in: ['pending', 'assigned', 'in_progress'] } } },
      { $group: { _id: '$assignedTo', activeOrders: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(workOrderCounts.map(w => [w._id.toString(), w.activeOrders]));

    return {
      technicians: technicians.map(t => ({
        _id: t._id,
        name: t.name,
        phone: t.phone,
        regions: t.assignedRegions || [],
        activeWorkOrders: countMap[t._id.toString()] || 0,
        lastLogin: t.lastLogin ? new Date(t.lastLogin).toISOString().split('T')[0] : null
      })),
      totalTechnicians: technicians.length
    };
  },

  // Tool 13: Get maintenance overview
  get_maintenance_overview: async (args) => {
    const branchQuery = { isActive: true };
    if (args.city) branchQuery.city = { $regex: args.city, $options: 'i' };
    if (args.region) branchQuery.region = { $regex: args.region, $options: 'i' };
    if (args.customerId && isValidId(args.customerId)) {
      branchQuery.customerId = new mongoose.Types.ObjectId(args.customerId);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

    const branches = await Branch.aggregate([
      { $match: branchQuery },
      {
        $lookup: {
          from: 'devices',
          let: { branchId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$branchId', '$$branchId'] }, { $eq: ['$isActive', true] }] } } }
          ],
          as: 'devices'
        }
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1 } }],
          as: 'customer'
        }
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          branchName: 1,
          city: 1,
          region: 1,
          customerName: '$customer.name',
          customerId: '$customerId',
          totalDevices: { $size: '$devices' },
          greenDevices: {
            $size: {
              $filter: {
                input: '$devices',
                as: 'd',
                cond: {
                  $and: [
                    { $ne: ['$$d.lastRefillDate', null] },
                    { $gte: ['$$d.lastRefillDate', thirtyDaysAgo] }
                  ]
                }
              }
            }
          },
          redDevices: {
            $size: {
              $filter: {
                input: '$devices',
                as: 'd',
                cond: {
                  $or: [
                    { $eq: ['$$d.lastRefillDate', null] },
                    { $lt: ['$$d.lastRefillDate', fortyFiveDaysAgo] }
                  ]
                }
              }
            }
          }
        }
      },
      { $addFields: { yellowDevices: { $subtract: ['$totalDevices', { $add: ['$greenDevices', '$redDevices'] }] } } },
      { $sort: { redDevices: -1, totalDevices: -1 } },
      { $limit: 20 }
    ]);

    const totals = branches.reduce((acc, b) => ({
      totalDevices: acc.totalDevices + b.totalDevices,
      green: acc.green + b.greenDevices,
      yellow: acc.yellow + b.yellowDevices,
      red: acc.red + b.redDevices
    }), { totalDevices: 0, green: 0, yellow: 0, red: 0 });

    return {
      branches: branches.map(b => ({
        _id: b._id,
        branchName: b.branchName,
        city: b.city,
        customerName: b.customerName,
        customerId: b.customerId,
        totalDevices: b.totalDevices,
        greenDevices: b.greenDevices,
        yellowDevices: b.yellowDevices,
        redDevices: b.redDevices
      })),
      summary: {
        totalBranches: branches.length,
        ...totals
      }
    };
  }
};

module.exports = executors;
