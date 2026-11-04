const SiteContent = require('../models/SiteContent');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Notification = require('../models/Notification');
const User = require('../models/User');
const PublicInquiry = require('../models/PublicInquiry');

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
      faqs: (content.faqs || [])
        .filter((f) => f.isPublished !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
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
    
    const { hero, aboutUs, contactInfo, termsAndConditions, privacyPolicy, paymentPolicy, refundPolicy, testimonials, faqs, paymentGateway } = req.body;

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
    if (faqs) content.faqs = faqs;
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

    // 1. Save to Database so Super Admin can view, search, reply and manage
    const inquiry = await PublicInquiry.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: (phone || '').trim(),
      subject: (subject || '').trim() || 'General Enterprise Inquiry',
      message: message.trim(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
    });

    // 2. Notify Super Admin
    const superAdmin = await User.findOne({ role: 'Super Admin' });
    if (superAdmin) {
      await Notification.create({
        user: superAdmin._id,
        title: `New Direct Inquiry from ${name}`,
        message: `${subject ? `[${subject}] ` : ''}${message.slice(0, 100)}... (${email})`,
        link: '/super-admin/cms?tab=inquiries'
      });
    }

    res.json({
      message: 'Thank you! Your inquiry has been received. Our team will contact you shortly.',
      inquiryId: inquiry._id
    });
  } catch (error) {
    console.error('Error submitting inquiry:', error);
    res.status(500).json({ message: 'Server error submitting inquiry' });
  }
};

// ===================== SUPER ADMIN INQUIRY MANAGEMENT =====================

// @desc    Get all landing page inquiries
// @route   GET /api/site-content/inquiries
// @access  Private (Super Admin)
exports.getInquiries = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 25 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [inquiries, total, unreadCount] = await Promise.all([
      PublicInquiry.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      PublicInquiry.countDocuments(query),
      PublicInquiry.countDocuments({ status: 'unread' }),
    ]);

    res.json({
      inquiries,
      total,
      unreadCount,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    res.status(500).json({ message: 'Error fetching inquiries' });
  }
};

// @desc    Update inquiry status or notes
// @route   PATCH /api/site-content/inquiries/:id
// @access  Private (Super Admin)
exports.updateInquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const inquiry = await PublicInquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found' });
    }

    if (status) inquiry.status = status;
    if (notes !== undefined) inquiry.notes = notes;
    if (status === 'contacted' && !inquiry.respondedAt) {
      inquiry.respondedAt = new Date();
    }

    await inquiry.save();
    res.json({ message: 'Inquiry updated successfully', inquiry });
  } catch (error) {
    console.error('Error updating inquiry:', error);
    res.status(500).json({ message: 'Error updating inquiry' });
  }
};

// @desc    Delete inquiry
// @route   DELETE /api/site-content/inquiries/:id
// @access  Private (Super Admin)
exports.deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    await PublicInquiry.findByIdAndDelete(id);
    res.json({ message: 'Inquiry deleted successfully' });
  } catch (error) {
    console.error('Error deleting inquiry:', error);
    res.status(500).json({ message: 'Error deleting inquiry' });
  }
};

// ===================== SUPER ADMIN FAQ CRUD =====================

// @desc    Add a new FAQ
// @route   POST /api/site-content/faqs
// @access  Private (Super Admin)
exports.addFaq = async (req, res) => {
  try {
    const { question, answer, category, isPublished, order } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ message: 'Question and answer are required' });
    }

    const content = await getOrCreateContent();
    const newFaq = {
      question: question.trim(),
      answer: answer.trim(),
      category: (category || 'General').trim(),
      isPublished: isPublished !== false,
      order: Number(order) || content.faqs.length + 1,
    };

    content.faqs.push(newFaq);
    await content.save();

    res.status(201).json({
      message: 'FAQ added successfully',
      faqs: content.faqs,
      faq: content.faqs[content.faqs.length - 1],
    });
  } catch (error) {
    console.error('Error adding FAQ:', error);
    res.status(500).json({ message: 'Error adding FAQ' });
  }
};

// @desc    Update an existing FAQ
// @route   PUT /api/site-content/faqs/:faqId
// @access  Private (Super Admin)
exports.updateFaq = async (req, res) => {
  try {
    const { faqId } = req.params;
    const { question, answer, category, isPublished, order } = req.body;

    const content = await getOrCreateContent();
    const faq = content.faqs.id(faqId);
    if (!faq) {
      return res.status(404).json({ message: 'FAQ not found' });
    }

    if (question) faq.question = question.trim();
    if (answer) faq.answer = answer.trim();
    if (category) faq.category = category.trim();
    if (isPublished !== undefined) faq.isPublished = Boolean(isPublished);
    if (order !== undefined) faq.order = Number(order);

    await content.save();
    res.json({ message: 'FAQ updated successfully', faqs: content.faqs, faq });
  } catch (error) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({ message: 'Error updating FAQ' });
  }
};

// @desc    Delete an FAQ
// @route   DELETE /api/site-content/faqs/:faqId
// @access  Private (Super Admin)
exports.deleteFaq = async (req, res) => {
  try {
    const { faqId } = req.params;
    const content = await getOrCreateContent();
    content.faqs = content.faqs.filter((f) => f._id.toString() !== faqId);
    await content.save();
    res.json({ message: 'FAQ deleted successfully', faqs: content.faqs });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({ message: 'Error deleting FAQ' });
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
