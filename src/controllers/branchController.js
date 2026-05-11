const { Branch, Device } = require('../models');
const { logCreate, logUpdate, logDelete } = require('../utils/audit');

// @desc    Get all branches
// @route   GET /api/branches
const getBranches = async (req, res) => {
  try {
    const { customerId, city, region, search, page = 1, limit = 20, all } = req.query;
    const query = {};

    if (customerId) query.customerId = customerId;
    if (city) query.city = city;
    if (region) query.region = region;
    if (search) query.branchName = { $regex: search, $options: 'i' };

    // Support fetching all for dropdowns (backward compatibility)
    if (all === 'true') {
      const branches = await Branch.find(query)
        .populate('customerId', 'name status')
        .sort({ branchName: 1 }).lean();
      return res.json(branches);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [branches, total] = await Promise.all([
      Branch.find(query)
        .populate('customerId', 'name status')
        .sort({ branchName: 1 }).skip(skip).limit(limitNum).lean(),
      Branch.countDocuments(query)
    ]);

    // Aggregate device counts per branch (for the current page)
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
    const aggMap = new Map(deviceAgg.map(a => [a._id.toString(), a]));
    const branchesEnriched = branches.map(b => {
      const a = aggMap.get(b._id.toString());
      return {
        ...b,
        deviceCount: a?.deviceCount || 0,
        activeDeviceCount: a?.activeDeviceCount || 0,
        totalMonthlyRate: a?.totalMonthlyRate || 0
      };
    });

    res.json({
      data: branchesEnriched,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single branch with devices
// @route   GET /api/branches/:id
const getBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id)
      .populate('customerId', 'name status');
    if (!branch) {
      return res.status(404).json({ message: 'סניף לא נמצא' });
    }

    const devices = await Device.find({ branchId: branch._id })
      .populate('scentId', 'name');
    res.json({ ...branch.toObject(), devices });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create branch
// @route   POST /api/branches
const createBranch = async (req, res) => {
  try {
    const branch = await Branch.create(req.body);
    await logCreate(req, 'branch', branch._id, branch.branchName, branch.toObject());
    res.status(201).json(branch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update branch
// @route   PUT /api/branches/:id
const updateBranch = async (req, res) => {
  try {
    const before = await Branch.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'סניף לא נמצא' });
    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    await logUpdate(req, 'branch', branch._id, branch.branchName, before, branch.toObject());
    res.json(branch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndDelete(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: 'סניף לא נמצא' });
    }
    await logDelete(req, 'branch', branch._id, branch.branchName, branch.toObject());
    res.json({ message: 'סניף נמחק בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch
};
