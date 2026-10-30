const SubscriptionPlan = require('../models/SubscriptionPlan');

// @desc    Get all active subscription plans
// @route   GET /api/plans
// @access  Public / Private
const getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ price: 1 });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new subscription plan
// @route   POST /api/plans
// @access  Private (Super Admin)
const createPlan = async (req, res) => {
  try {
    const { name, price, billingCycle, maxEmployees, features, durationDays, description } = req.body;

    const existingPlan = await SubscriptionPlan.findOne({ name });
    if (existingPlan) {
      return res.status(400).json({ message: `A plan with name "${name}" already exists` });
    }

    const plan = await SubscriptionPlan.create({
      name,
      price: Number(price) || 0,
      billingCycle: billingCycle || 'Monthly',
      maxEmployees: Number(maxEmployees) || 20,
      features: Array.isArray(features) ? features : (features ? features.split(',').map(f => f.trim()) : undefined),
      durationDays: Number(durationDays) || (billingCycle === 'Yearly' ? 365 : 30),
      description: description || ''
    });

    res.status(201).json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a subscription plan
// @route   PUT /api/plans/:id
// @access  Private (Super Admin)
const updatePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    const { name, price, billingCycle, maxEmployees, features, durationDays, description, isActive } = req.body;

    plan.name = name || plan.name;
    if (price !== undefined) plan.price = Number(price);
    if (billingCycle !== undefined) plan.billingCycle = billingCycle;
    if (maxEmployees !== undefined) plan.maxEmployees = Number(maxEmployees);
    if (features !== undefined) {
      plan.features = Array.isArray(features) ? features : features.split(',').map(f => f.trim());
    }
    if (durationDays !== undefined) plan.durationDays = Number(durationDays);
    if (description !== undefined) plan.description = description;
    if (isActive !== undefined) plan.isActive = Boolean(isActive);

    const updatedPlan = await plan.save();
    res.json(updatedPlan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a subscription plan
// @route   DELETE /api/plans/:id
// @access  Private (Super Admin)
const deletePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    await plan.deleteOne();
    res.json({ message: 'Subscription plan removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
};
