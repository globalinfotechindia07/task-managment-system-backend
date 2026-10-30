const SiteContent = require('../models/SiteContent');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Helper to ensure a single singleton document exists
const getOrCreateContent = async () => {
  let content = await SiteContent.findOne();
  if (!content) {
    content = await SiteContent.create({});
  }
  return content;
};

// @desc    Get public landing page content
// @route   GET /api/site-content/public
// @access  Public
exports.getPublicContent = async (req, res) => {
  try {
    const content = await getOrCreateContent();
    // Return sanitized object without exposing secret key
    const sanitized = {
      hero: content.hero,
      aboutUs: content.aboutUs,
      contactInfo: content.contactInfo,
      termsAndConditions: content.termsAndConditions,
      privacyPolicy: content.privacyPolicy,
      paymentPolicy: content.paymentPolicy,
      refundPolicy: content.refundPolicy,
      testimonials: content.testimonials,
      paymentGateway: {
        razorpayKeyId: content.paymentGateway?.razorpayKeyId || '',
        isEnabled: !!content.paymentGateway?.isEnabled,
        currency: content.paymentGateway?.currency || 'INR'
      }
    };
    res.json(sanitized);
  } catch (error) {
    console.error('Error fetching public content:', error);
    res.status(500).json({ message: 'Server error fetching landing content' });
  }
};

// @desc    Get all site content including payment keys for Super Admin
// @route   GET /api/site-content/admin
// @access  Private (Super Admin only)
exports.getAdminContent = async (req, res) => {
  try {
    const content = await getOrCreateContent();
    res.json(content);
  } catch (error) {
    console.error('Error fetching admin content:', error);
    res.status(500).json({ message: 'Server error fetching content settings' });
  }
};

// @desc    Update site content / payment keys
// @route   PUT /api/site-content
// @access  Private (Super Admin only)
exports.updateContent = async (req, res) => {
  try {
    let content = await getOrCreateContent();
    
    const { hero, aboutUs, contactInfo, termsAndConditions, privacyPolicy, paymentPolicy, refundPolicy, testimonials, paymentGateway } = req.body;

    if (hero) content.hero = { ...content.hero.toObject(), ...hero };
    if (aboutUs) content.aboutUs = { ...content.aboutUs.toObject(), ...aboutUs };
    if (contactInfo) content.contactInfo = { ...content.contactInfo.toObject(), ...contactInfo };
    if (termsAndConditions) {
      content.termsAndConditions = {
        ...content.termsAndConditions.toObject(),
        ...termsAndConditions,
        lastUpdated: new Date()
      };
    }
    if (privacyPolicy) {
      content.privacyPolicy = {
        ...content.privacyPolicy.toObject(),
        ...privacyPolicy,
        lastUpdated: new Date()
      };
    }
    if (paymentPolicy) {
      content.paymentPolicy = {
        ...content.paymentPolicy.toObject(),
        ...paymentPolicy,
        lastUpdated: new Date()
      };
    }
    if (refundPolicy) {
      content.refundPolicy = {
        ...content.refundPolicy.toObject(),
        ...refundPolicy,
        lastUpdated: new Date()
      };
    }
    if (testimonials) content.testimonials = testimonials;
    if (paymentGateway) {
      let keyId = (paymentGateway.razorpayKeyId !== undefined ? paymentGateway.razorpayKeyId : content.paymentGateway?.razorpayKeyId || '').trim();
      let keySecret = (paymentGateway.razorpayKeySecret !== undefined ? paymentGateway.razorpayKeySecret : content.paymentGateway?.razorpayKeySecret || '').trim();

      // Auto-correct if user accidentally omitted the leading 'r'
      if (keyId.startsWith('zp_test_')) keyId = 'r' + keyId;
      if (keyId.startsWith('zp_live_')) keyId = 'r' + keyId;

      content.paymentGateway = {
        razorpayKeyId: keyId,
        razorpayKeySecret: keySecret,
        isEnabled: paymentGateway.isEnabled ?? content.paymentGateway?.isEnabled ?? false,
        currency: (paymentGateway.currency || 'INR').trim().toUpperCase()
      };
    }

    const saved = await content.save();
    res.json({ message: 'Content & Settings updated successfully', content: saved });
  } catch (error) {
    console.error('Error updating site content:', error);
    res.status(500).json({ message: 'Server error updating content' });
  }
};

// @desc    Submit public contact inquiry
// @route   POST /api/site-content/inquiry
// @access  Public
exports.submitInquiry = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Name, email, and message are required' });
    }

    // Notify Super Admin if any exists
    const superAdmin = await User.findOne({ role: 'Super Admin' });
    if (superAdmin) {
      await Notification.create({
        user: superAdmin._id,
        title: `New Inquiry from ${name}`,
        message: `${subject ? `[${subject}] ` : ''}${message.slice(0, 100)}... (${email})`,
        link: '/super-admin/dashboard'
      });
    }

    res.json({ message: 'Thank you! Your inquiry has been received. Our team will contact you shortly.' });
  } catch (error) {
    console.error('Error submitting inquiry:', error);
    res.status(500).json({ message: 'Server error submitting inquiry' });
  }
};

// @desc    Create Razorpay Order for a Subscription Plan
// @route   POST /api/site-content/create-order
// @access  Public
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    const content = await getOrCreateContent();
    const keyId = content.paymentGateway?.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = content.paymentGateway?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(400).json({
        message: 'Online payment gateway is currently not configured. Please contact sales directly.'
      });
    }

    const instance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });

    const options = {
      amount: Math.round(plan.price * 100), // amount in paise
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${plan._id.toString().slice(-4)}`,
      notes: {
        planId: plan._id.toString(),
        planName: plan.name,
        maxEmployees: plan.maxEmployees.toString()
      }
    };

    const order = await instance.orders.create(options);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      planName: plan.name,
      planPrice: plan.price
    });
  } catch (error) {
    console.error('Razorpay Order Error:', error);
    res.status(500).json({ message: error.message || 'Error creating Razorpay order' });
  }
};
