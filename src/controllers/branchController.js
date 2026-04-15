const { Branch, Device } = require('../models');

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

    res.json({
      data: branches,
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
    res.status(201).json(branch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update branch
// @route   PUT /api/branches/:id
const updateBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!branch) {
      return res.status(404).json({ message: 'סניף לא נמצא' });
    }
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
