const { Scent } = require('../models');

// @desc    Get all scents
// @route   GET /api/scents
const getScents = async (req, res) => {
  try {
    const { isActive, lowStock } = req.query;
    const query = {};

    if (isActive !== undefined) query.isActive = isActive === 'true';

    let scents = await Scent.find(query).sort({ name: 1 });

    // סינון ריחות עם מלאי נמוך
    if (lowStock === 'true') {
      scents = scents.filter(s => s.stockQuantity <= s.minStockAlert);
    }

    res.json(scents);
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
    const scents = await Scent.find({ isActive: true });
    const lowStock = scents.filter(s => s.stockQuantity <= s.minStockAlert);

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
