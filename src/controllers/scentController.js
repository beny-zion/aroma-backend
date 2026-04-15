const { Scent } = require('../models');

// @desc    Get all scents
// @route   GET /api/scents
const getScents = async (req, res) => {
  try {
    const { isActive, lowStock, search, page = 1, limit = 20, all } = req.query;
    const query = {};

    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) query.name = { $regex: search, $options: 'i' };

    // Server-side low stock filtering
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$stockQuantity', '$minStockAlert'] };
    }

    // Support fetching all for dropdowns (backward compatibility)
    if (all === 'true') {
      const scents = await Scent.find(query).sort({ name: 1 }).lean();
      return res.json(scents);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [scents, total] = await Promise.all([
      Scent.find(query).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
      Scent.countDocuments(query)
    ]);

    res.json({
      data: scents,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single scent
// @route   GET /api/scents/:id
const getScent = async (req, res) => {
  try {
    const scent = await Scent.findById(req.params.id);
    if (!scent) {
      return res.status(404).json({ message: 'ריח לא נמצא' });
    }
    res.json(scent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create scent
// @route   POST /api/scents
const createScent = async (req, res) => {
  try {
    const scent = await Scent.create(req.body);
    res.status(201).json(scent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update scent
// @route   PUT /api/scents/:id
const updateScent = async (req, res) => {
  try {
    const scent = await Scent.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!scent) {
      return res.status(404).json({ message: 'ריח לא נמצא' });
    }
    res.json(scent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete scent
// @route   DELETE /api/scents/:id
const deleteScent = async (req, res) => {
  try {
    const scent = await Scent.findByIdAndDelete(req.params.id);
    if (!scent) {
      return res.status(404).json({ message: 'ריח לא נמצא' });
    }
    res.json({ message: 'ריח נמחק בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add stock to scent
// @route   POST /api/scents/:id/add-stock
const addStock = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'יש לציין כמות חיובית' });
    }

    const scent = await Scent.findById(req.params.id);
    if (!scent) {
      return res.status(404).json({ message: 'ריח לא נמצא' });
    }

    scent.stockQuantity += amount;
    await scent.save();

    res.json({
      message: `נוספו ${amount} מ"ל למלאי`,
      scent
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get low stock alerts
// @route   GET /api/scents/alerts/low-stock
const getLowStockAlerts = async (req, res) => {
  try {
    const lowStock = await Scent.find({
      isActive: true,
      $expr: { $lte: ['$stockQuantity', '$minStockAlert'] }
    }).sort({ stockQuantity: 1 }).lean();

    res.json({
      count: lowStock.length,
      scents: lowStock
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getScents,
  getScent,
  createScent,
  updateScent,
  deleteScent,
  addStock,
  getLowStockAlerts
};
