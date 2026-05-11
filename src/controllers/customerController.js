const { Customer, Branch, Device } = require('../models');
const { logCreate, logUpdate, logDelete } = require('../utils/audit');

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
      query.name = { $regex: search, $options: 'i' };
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

module.exports = {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer
};
