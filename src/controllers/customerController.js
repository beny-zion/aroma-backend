const { Customer, Branch } = require('../models');

// @desc    Get all customers
// @route   GET /api/customers
const getCustomers = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const customers = await Customer.find(query).sort({ name: 1 });
    res.json(customers);
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
    res.json({ ...customer.toObject(), branches });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create customer
// @route   POST /api/customers
const createCustomer = async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!customer) {
      return res.status(404).json({ message: 'לקוח לא נמצא' });
    }
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
