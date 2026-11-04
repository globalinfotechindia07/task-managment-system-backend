const Company = require('../models/Company');
const User = require('../models/User');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const AttendancePolicy = require('../models/AttendancePolicy');
const Notification = require('../models/Notification');
const SiteContent = require('../models/SiteContent');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Transaction = require('../models/Transaction');

// @desc    Get all companies / offices with stats & subscription
// @route   GET /api/companies
// @access  Private (Super Admin)
const getCompanies = async (req, res) => {
  try {
    const companies = await Company.find()
      .populate('adminUser', 'name email phone status designation')
      .populate('subscription.plan')
      .sort({ createdAt: -1 });

    // Attach real-time user count for each company
    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const userCount = await User.countDocuments({ company: company._id });
        const compObj = company.toObject();
        compObj.currentEmployeeCount = userCount;
        return compObj;
      })
    );

    res.status(200).json(companiesWithStats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single company
// @route   GET /api/companies/:id
// @access  Private
const getCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('adminUser', 'name email phone status')
      .populate('subscription.plan');

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const userCount = await User.countDocuments({ company: company._id });
    const compObj = company.toObject();
    compObj.currentEmployeeCount = userCount;

    res.status(200).json(compObj);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new Company / Office + Admin User
// @route   POST /api/companies/register-office
// @access  Private (Super Admin)
const registerOffice = async (req, res) => {
  const {
    name,
    companyCode,
    industry,
    location,
    address,
    contactEmail,
    phone,
    adminName,
    adminEmail,
    adminPassword,
    planId,
    durationDays,
    customMaxEmployees
  } = req.body;

  if (!name || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      message: 'Please provide company name, admin name, admin email, and admin password',
    });
  }

  try {
    // 1. Check if admin email is already used
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      return res.status(400).json({
        message: `An account with email ${adminEmail} already exists. Please choose a different admin email.`,
      });
    }

    // 2. Fetch Subscription Plan if specified
    let planData = {
      planName: 'Free Trial',
      maxEmployees: Number(customMaxEmployees) || 20,
      status: 'Trial',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };

    if (planId) {
      const plan = await SubscriptionPlan.findById(planId);
      if (plan) {
        const days = Number(durationDays) || plan.durationDays || 30;
        planData = {
          plan: plan._id,
          planName: plan.name,
          maxEmployees: Number(customMaxEmployees) || plan.maxEmployees,
          status: 'Active',
          startDate: new Date(),
          endDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        };
      }
    }

    // 3. Create Company
    const company = new Company({
      name,
      companyCode,
      industry: industry || 'Technology',
      location: location || '',
      address: address || '',
      contactEmail: contactEmail || adminEmail,
      phone: phone || '',
      subscription: planData,
      status: 'Active'
    });

    const savedCompany = await company.save();

    // 4. Create Office Admin User
    const adminUser = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'Admin',
      designation: 'Office Administrator',
      company: savedCompany._id,
      requiresPasswordChange: false,
      status: 'Active'
    });

    // 5. Link Admin User to Company
    savedCompany.adminUser = adminUser._id;
    await savedCompany.save();

    // 6. Create Default Attendance Policy for this office
    await AttendancePolicy.create({
      company: savedCompany._id,
      officeAddress: address || location || '',
      officeLatitude: 0,
      officeLongitude: 0,
      allowedRadiusMeters: 50,
      inTime: '09:00',
      outTime: '18:00',
      bufferMinutes: 15,
      allowedLateMarks: 3
    });

    res.status(201).json({
      message: 'Office and Administrator created successfully',
      company: savedCompany,
      admin: {
        _id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  } catch (error) {
    console.error('Error registering office:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update company details
// @route   PUT /api/companies/:id
// @access  Private (Super Admin / Office Admin)
const updateCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // If not super admin, must be their own company
    if (req.user.role !== 'Super Admin' && company._id.toString() !== req.companyId?.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this company' });
    }

    const { name, industry, location, address, contactEmail, phone, status } = req.body;

    company.name = name || company.name;
    if (industry !== undefined) company.industry = industry;
    if (location !== undefined) company.location = location;
    if (address !== undefined) company.address = address;
    if (contactEmail !== undefined) company.contactEmail = contactEmail;
    if (phone !== undefined) company.phone = phone;

    // Only Super Admin can change company overall status (e.g. Suspend)
    if (status && req.user.role === 'Super Admin') {
      company.status = status;
    }

    const updatedCompany = await company.save();
    res.status(200).json(updatedCompany);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update / Renew subscription for an office
// @route   PUT /api/companies/:id/subscription
// @access  Private (Super Admin)
const updateSubscription = async (req, res) => {
  try {
    const { planId, status, durationDays, maxEmployees } = req.body;
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    if (planId) {
      const plan = await SubscriptionPlan.findById(planId);
      if (plan) {
        company.subscription.plan = plan._id;
        company.subscription.planName = plan.name;
        company.subscription.maxEmployees = maxEmployees || plan.maxEmployees;
        const days = Number(durationDays) || plan.durationDays || 30;
        company.subscription.startDate = new Date();
        company.subscription.endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
    }

    if (status) {
      company.subscription.status = status;
      if (status === 'Active') {
        company.status = 'Active';
      }
    }

    if (durationDays && !planId) {
      // Extend validity from current end date or from now
      const baseDate = company.subscription.endDate && new Date(company.subscription.endDate) > new Date()
        ? new Date(company.subscription.endDate)
        : new Date();
      company.subscription.endDate = new Date(baseDate.getTime() + Number(durationDays) * 24 * 60 * 60 * 1000);
    }

    if (maxEmployees && !planId) {
      company.subscription.maxEmployees = Number(maxEmployees);
    }

    const updatedCompany = await company.save();
    res.json({ message: 'Subscription updated successfully', company: updatedCompany });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a company and its users
// @route   DELETE /api/companies/:id
// @access  Private (Super Admin)
const deleteCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Delete all users belonging to this company
    await User.deleteMany({ company: company._id });

    // Delete company attendance policy
    await AttendancePolicy.deleteOne({ company: company._id });

    // Delete company
    await company.deleteOne();

    res.status(200).json({ message: 'Office and all associated accounts deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Super Admin Global Platform Stats
// @route   GET /api/companies/platform/stats
// @access  Private (Super Admin)
const getPlatformStats = async (req, res) => {
  try {
    const totalCompanies = await Company.countDocuments();
    const activeCompanies = await Company.countDocuments({ 'subscription.status': 'Active', status: 'Active' });
    const trialCompanies = await Company.countDocuments({ 'subscription.status': 'Trial' });
    const expiredCompanies = await Company.countDocuments({
      $or: [{ 'subscription.status': 'Expired' }, { status: 'Suspended' }]
    });

    const totalUsers = await User.countDocuments({ role: { $ne: 'Super Admin' } });

    // Calculate approximate monthly revenue from active subscriptions
    const activeComps = await Company.find({ 'subscription.status': 'Active' }).populate('subscription.plan');
    const estimatedMonthlyRevenue = activeComps.reduce((acc, c) => {
      const price = c.subscription?.plan?.price || 0;
      const cycle = c.subscription?.plan?.billingCycle || 'Monthly';
      return acc + (cycle === 'Yearly' ? Math.round(price / 12) : price);
    }, 0);

    const totalPlans = await SubscriptionPlan.countDocuments();

    res.json({
      totalCompanies,
      activeCompanies,
      trialCompanies,
      expiredCompanies,
      totalUsers,
      estimatedMonthlyRevenue,
      totalPlans
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Self-Service Public Onboarding: Company Details + Admin Account + Subscription/Payment
// @route   POST /api/companies/public-onboard
// @access  Public
const publicOnboardOffice = async (req, res) => {
  try {
    const {
      companyName,
      location,
      address,
      registrationNumber,
      employeeSize,
      gstNumber,
      industry,
      phone,
      contactEmail,
      adminName,
      adminEmail,
      adminPassword,
      adminDesignation,
      planId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    } = req.body;

    // Validate required fields
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ message: 'Company / Organization name is required.' });
    }
    if (!adminName || !adminName.trim()) {
      return res.status(400).json({ message: 'Administrator full name is required.' });
    }
    if (!adminEmail || !adminEmail.trim()) {
      return res.status(400).json({ message: 'Administrator email is required.' });
    }
    if (!adminPassword || adminPassword.length < 6) {
      return res.status(400).json({ message: 'Administrator password must be at least 6 characters.' });
    }
    if (!planId) {
      return res.status(400).json({ message: 'Please select a subscription plan.' });
    }

    const cleanEmail = adminEmail.trim().toLowerCase();

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({
        message: `An account with email '${cleanEmail}' already exists. Please choose a different admin email or login.`
      });
    }

    // Verify Subscription Plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: 'Selected subscription plan not found.' });
    }

    // Optional Razorpay signature verification if provided
    if (razorpaySignature && razorpayOrderId && razorpayPaymentId) {
      const siteContent = await SiteContent.findOne();
      const secret = siteContent?.paymentGateway?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
      if (secret) {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(`${razorpayOrderId}|${razorpayPaymentId}`)
          .digest('hex');

        if (expectedSignature !== razorpaySignature) {
          return res.status(400).json({ message: 'Invalid payment signature. Payment verification failed.' });
        }
      }
    }

    const validityDays = plan.durationDays || (plan.billingCycle === 'yearly' ? 365 : 30);

    const subscriptionData = {
      plan: plan._id,
      planName: plan.name,
      status: 'Active',
      startDate: new Date(),
      endDate: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
      maxEmployees: plan.maxEmployees || 20
    };

    // 1. Create Company Document
    const company = new Company({
      name: companyName.trim(),
      industry: industry || 'Technology & Business Services',
      location: location || '',
      address: address || '',
      registrationNumber: (registrationNumber || '').trim(),
      gstNumber: (gstNumber || '').trim().toUpperCase(),
      employeeSize: employeeSize || '1-15',
      contactEmail: (contactEmail || cleanEmail).trim().toLowerCase(),
      phone: phone || '',
      subscription: subscriptionData,
      paymentDetails: {
        orderId: razorpayOrderId || '',
        paymentId: razorpayPaymentId || `pay_onboard_${Date.now()}`,
        amount: plan.price,
        method: razorpayPaymentId ? 'Razorpay' : 'Direct Checkout',
        paidAt: new Date()
      },
      status: 'Active'
    });

    const savedCompany = await company.save();

    // 2. Create Admin User
    const adminUser = await User.create({
      name: adminName.trim(),
      email: cleanEmail,
      password: adminPassword,
      role: 'Admin',
      designation: adminDesignation || 'Company Administrator',
      company: savedCompany._id,
      phone: phone || '',
      requiresPasswordChange: false,
      status: 'Active'
    });

    // 3. Link Admin to Company
    savedCompany.adminUser = adminUser._id;
    await savedCompany.save();

    // 4. Create Default Attendance Policy for this office
    await AttendancePolicy.create({
      company: savedCompany._id,
      officeAddress: address || location || `${companyName} Headquarters`,
      officeLatitude: 0,
      officeLongitude: 0,
      allowedRadiusMeters: 100,
      inTime: '09:00',
      outTime: '18:00',
      bufferMinutes: 15,
      allowedLateMarks: 3
    });

    // 5. Notify Super Admin
    try {
      const superAdmin = await User.findOne({ role: 'Super Admin' });
      if (superAdmin) {
        await Notification.create({
          user: superAdmin._id,
          title: `New Organization Onboarded: ${savedCompany.name}`,
          message: `${savedCompany.name} successfully subscribed to ${plan.name} (Quota: ${plan.maxEmployees} seats). Admin: ${adminUser.name} (${adminUser.email})`,
          link: '/super-admin/companies'
        });
      }
    } catch (notifErr) {
      console.warn('Super Admin notification warning:', notifErr.message);
    }

    // 6. Record Billing Transaction & Generate Invoice
    const basePrice = plan.price || 0;
    const gstAmount = Math.round(basePrice * 0.18);
    const totalAmount = basePrice + gstAmount;
    const dateStr = new Date().toISOString().slice(0, 7).replace('-', '');
    const randomStr = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${dateStr}-${randomStr}`;

    await Transaction.create({
      company: savedCompany._id,
      user: adminUser._id,
      plan: plan._id,
      planName: plan.name,
      billingCycle: plan.billingCycle || 'monthly',
      invoiceNumber,
      basePrice,
      gstAmount,
      amount: totalAmount,
      currency: 'INR',
      paymentGateway: 'Razorpay',
      paymentId: razorpayPaymentId || `pay_onboard_${Date.now()}`,
      orderId: razorpayOrderId || `order_${Date.now()}`,
      status: 'Success',
      startDate: subscriptionData.startDate,
      endDate: subscriptionData.endDate,
      paidAt: new Date()
    });

    // 7. Generate JWT token (Persistent enterprise session - 365 days)
    const token = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || 'secret123', {
      expiresIn: '365d'
    });

    res.status(201).json({
      success: true,
      message: 'Company and Administrator onboarded successfully!',
      token,
      user: {
        _id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        designation: adminUser.designation,
        requiresPasswordChange: false,
        company: {
          _id: savedCompany._id,
          name: savedCompany.name,
          companyCode: savedCompany.companyCode,
          subscription: savedCompany.subscription
        }
      },
      company: {
        _id: savedCompany._id,
        name: savedCompany.name,
        companyCode: savedCompany.companyCode,
        subscription: savedCompany.subscription
      }
    });
  } catch (error) {
    console.error('Error during public onboarding:', error);
    res.status(500).json({ message: error.message || 'Server error during onboarding' });
  }
};

// @desc    Get current logged-in company's transactions & billing history
// @route   GET /api/companies/my-transactions
// @access  Private (Admin, CTO)
const getMyTransactions = async (req, res) => {
  try {
    const companyId = req.user.company;
    if (!companyId) {
      return res.status(400).json({ message: 'User does not belong to any registered company.' });
    }

    const company = await Company.findById(companyId)
      .populate('subscription.plan')
      .populate('adminUser', 'name email phone');

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const employeeCount = await User.countDocuments({ company: company._id });

    // Fetch transactions
    let transactions = await Transaction.find({ company: company._id })
      .populate('plan')
      .sort({ paidAt: -1 });

    // If company was created without Transaction record, synthesize initial invoice so history is never blank
    if (transactions.length === 0 && company.subscription?.planName) {
      const basePrice = company.paymentDetails?.amount || (company.subscription.plan ? 999 : 0);
      const gstAmount = Math.round(basePrice * 0.18);
      const dateStr = new Date(company.createdAt).toISOString().slice(0, 7).replace('-', '');
      const randomStr = Math.floor(1000 + Math.random() * 9000);
      const invoiceNumber = `INV-${dateStr}-${randomStr}`;

      const syntheticTx = await Transaction.create({
        company: company._id,
        user: company.adminUser?._id || req.user._id,
        plan: company.subscription.plan,
        planName: company.subscription.planName,
        billingCycle: 'monthly',
        invoiceNumber,
        basePrice,
        gstAmount,
        amount: basePrice + gstAmount,
        paymentGateway: company.paymentDetails?.method || 'Razorpay',
        paymentId: company.paymentDetails?.paymentId || `pay_initial_${company._id.toString().slice(-6)}`,
        orderId: company.paymentDetails?.orderId || `order_initial_${company._id.toString().slice(-6)}`,
        status: 'Success',
        startDate: company.subscription.startDate || company.createdAt,
        endDate: company.subscription.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paidAt: company.paymentDetails?.paidAt || company.subscription.startDate || company.createdAt
      });
      transactions = [syntheticTx];
    }

    const baseLimit = company.subscription?.maxEmployees || 15;
    const extraUsersCount = company.subscription?.extraUsersCount || 0;
    const totalAllowedSeats = baseLimit + extraUsersCount;
    const planPrice = company.subscription?.plan?.price || 1500;
    const pricePerExtraSeat = Math.max(99, Math.round(planPrice / baseLimit));

    res.json({
      company: {
        _id: company._id,
        name: company.name,
        companyCode: company.companyCode,
        location: company.location,
        address: company.address,
        registrationNumber: company.registrationNumber,
        gstNumber: company.gstNumber,
        phone: company.phone,
        contactEmail: company.contactEmail,
        subscription: {
          ...(company.subscription ? company.subscription.toObject() : {}),
          baseLimit,
          extraUsersCount,
          totalAllowedSeats,
          maxAddonAllowed: 5,
          remainingAddons: Math.max(0, 5 - extraUsersCount),
          pricePerExtraSeat,
        },
        currentEmployeeCount: employeeCount
      },
      transactions
    });
  } catch (error) {
    console.error('Error fetching company transactions:', error);
    res.status(500).json({ message: error.message || 'Error fetching billing transactions' });
  }
};

// @desc    Get detailed invoice data for a transaction
// @route   GET /api/companies/transactions/:id/invoice
// @access  Private (Admin, CTO, Super Admin)
const getTransactionInvoice = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('company')
      .populate('user', 'name email phone')
      .populate('plan');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction / Invoice record not found' });
    }

    // Security check: non-Super Admin can only view their own company invoice
    const userCompanyId = (req.companyId || req.user.company?._id || req.user.company || '').toString();
    const txCompanyId = (transaction.company?._id || transaction.company || '').toString();
    if (req.user.role !== 'Super Admin' && txCompanyId !== userCompanyId) {
      return res.status(403).json({ message: 'Unauthorized to view this invoice' });
    }

    const siteContent = await SiteContent.findOne();

    const invoiceData = {
      invoiceNumber: transaction.invoiceNumber,
      invoiceDate: transaction.paidAt,
      dueDate: transaction.paidAt,
      seller: {
        companyName: 'Global Infotech India Pvt. Ltd.',
        address: siteContent?.contactInfo?.address || 'Global Infotech Towers, Powai IT Park, Mumbai, Maharashtra 400076',
        gstNumber: '27AABCG1234F1Z8',
        sacCode: '998313', // IT SaaS Services SAC Code
        email: siteContent?.contactInfo?.email || 'billing@globalinfotech.com',
        phone: siteContent?.contactInfo?.phone || '+91 98765 43210'
      },
      buyer: {
        companyName: transaction.company.name,
        companyCode: transaction.company.companyCode,
        address: transaction.company.address || transaction.company.location || 'Head Office',
        location: transaction.company.location,
        gstNumber: transaction.company.gstNumber || 'Unregistered',
        registrationNumber: transaction.company.registrationNumber || 'N/A',
        contactEmail: transaction.company.contactEmail,
        phone: transaction.company.phone,
        adminName: transaction.user?.name || 'Administrator'
      },
      item: {
        description: `Enterprise Cloud Workspace Subscription (${transaction.planName})`,
        validity: `${new Date(transaction.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} to ${new Date(transaction.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        sacCode: '998313',
        billingCycle: transaction.billingCycle,
        basePrice: transaction.basePrice,
        cgst: Math.round(transaction.gstAmount / 2),
        sgst: Math.round(transaction.gstAmount / 2),
        gstAmount: transaction.gstAmount,
        totalAmount: transaction.amount,
        currency: transaction.currency
      },
      payment: {
        gateway: transaction.paymentGateway,
        paymentId: transaction.paymentId,
        orderId: transaction.orderId,
        status: transaction.status,
        paidAt: transaction.paidAt
      }
    };

    res.json(invoiceData);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ message: error.message || 'Server error generating invoice' });
  }
};

// @desc    Purchase add-on extra users (Max 5 users, priced proportionally to base plan)
// @route   POST /api/companies/purchase-extra-users
// @desc    Create checkout order for extra seats or plan upgrade (Razorpay or Sandbox)
// @route   POST /api/companies/create-checkout-order
// @access  Private (Admin, CTO)
const createCheckoutOrder = async (req, res) => {
  try {
    const companyId = req.user.company?._id || req.user.company;
    if (!companyId) {
      return res.status(400).json({ message: 'User does not belong to any registered company.' });
    }

    const { type, seatsCount, newPlanId } = req.body;
    const company = await Company.findById(companyId).populate('subscription.plan');
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    let basePrice = 0;
    let description = '';
    let itemName = '';
    let seats = 0;
    let targetPlan = null;

    if (type === 'ADDON') {
      seats = parseInt(seatsCount, 10);
      if (isNaN(seats) || seats <= 0) {
        return res.status(400).json({ message: 'Please specify a valid number of seats (1-5).' });
      }

      const currentExtra = company.subscription?.extraUsersCount || 0;
      const maxAddonLimit = 5;
      if (currentExtra >= maxAddonLimit) {
        return res.status(400).json({
          message: 'You have already reached the maximum of 5 add-on seats. Please upgrade your plan for higher team capacity.',
        });
      }
      if (currentExtra + seats > maxAddonLimit) {
        const allowed = maxAddonLimit - currentExtra;
        return res.status(400).json({
          message: `You can only add up to ${allowed} more extra seat(s). Maximum allowed add-on seats is 5.`,
        });
      }

      const baseLimit = company.subscription?.maxEmployees || 15;
      const planPrice = company.subscription?.plan?.price || 1500;
      const pricePerSeat = Math.max(99, Math.round(planPrice / baseLimit));

      basePrice = pricePerSeat * seats;
      itemName = `Add-on ${seats} User Seat${seats > 1 ? 's' : ''}`;
      description = `Capacity Expansion (+${seats} seats @ ₹${pricePerSeat}/user)`;
    } else if (type === 'UPGRADE') {
      if (!newPlanId) {
        return res.status(400).json({ message: 'Please select a plan to upgrade to.' });
      }
      targetPlan = await SubscriptionPlan.findById(newPlanId);
      if (!targetPlan) {
        return res.status(404).json({ message: 'Target subscription plan not found.' });
      }

      const isSamePlan = company.subscription?.plan?._id?.toString() === targetPlan._id.toString();
      if (isSamePlan && company.subscription?.status === 'Active') {
        return res.status(400).json({ message: 'Your company is already subscribed to this plan.' });
      }

      basePrice = targetPlan.price || 0;
      itemName = `${targetPlan.name} Plan Upgrade`;
      description = `Upgrade to ${targetPlan.name} (${targetPlan.maxEmployees} User Seats)`;
    } else {
      return res.status(400).json({ message: 'Invalid checkout type. Expected ADDON or UPGRADE.' });
    }

    const gstAmount = Math.round(basePrice * 0.18);
    const totalAmount = basePrice + gstAmount;

    // Check Razorpay configuration
    const content = await SiteContent.findOne();
    const keyId = content?.paymentGateway?.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = content?.paymentGateway?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;
    const isGatewayEnabled = content?.paymentGateway?.isEnabled ?? true;

    // If Razorpay keys are configured and gateway is enabled, create official Razorpay order
    if (keyId && keySecret && isGatewayEnabled) {
      try {
        const razorpayInstance = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

        const rzpOrder = await razorpayInstance.orders.create({
          amount: Math.round(totalAmount * 100), // amount in paise
          currency: 'INR',
          receipt: `rcpt_${type.toLowerCase()}_${Date.now().toString().slice(-6)}`,
          notes: {
            companyId: company._id.toString(),
            companyName: company.name,
            type,
            seats: seats.toString(),
            planId: targetPlan ? targetPlan._id.toString() : (company.subscription?.plan?._id?.toString() || ''),
          },
        });

        return res.status(200).json({
          success: true,
          mode: 'RAZORPAY',
          orderId: rzpOrder.id,
          amount: totalAmount,
          amountPaise: rzpOrder.amount,
          currency: 'INR',
          keyId,
          itemName,
          description,
          basePrice,
          gstAmount,
          totalAmount,
          company: {
            name: company.name,
            email: req.user.email || company.contactEmail,
            phone: company.phone || req.user.phone || '',
          },
        });
      } catch (rzpErr) {
        console.warn('Razorpay order creation failed, falling back to secure sandbox gateway:', rzpErr.message);
      }
    }

    // Otherwise return sandbox / simulated order
    const simulatedOrderId = `order_${type.toLowerCase()}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    return res.status(200).json({
      success: true,
      mode: 'SANDBOX',
      orderId: simulatedOrderId,
      amount: totalAmount,
      currency: 'INR',
      keyId: keyId || 'rzp_test_sandbox_mode',
      itemName,
      description,
      basePrice,
      gstAmount,
      totalAmount,
      company: {
        name: company.name,
        email: req.user.email || company.contactEmail,
        phone: company.phone || req.user.phone || '',
      },
    });
  } catch (error) {
    console.error('Error creating checkout order:', error);
    res.status(500).json({ message: error.message || 'Failed to initialize payment checkout' });
  }
};

// @desc    Purchase extra employee seats (up to 5 max add-on seats)
// @route   POST /api/companies/purchase-extra-users
// @access  Private (Admin, CTO)
const purchaseExtraUsers = async (req, res) => {
  try {
    const companyId = req.user.company?._id || req.user.company;
    if (!companyId) {
      return res.status(400).json({ message: 'User does not belong to any registered company.' });
    }

    const {
      seatsCount,
      paymentMethod = 'Razorpay',
      paymentId,
      orderId,
      paymentGateway = 'Razorpay',
    } = req.body;
    const seats = parseInt(seatsCount, 10);

    if (isNaN(seats) || seats <= 0) {
      return res.status(400).json({ message: 'Please specify a valid number of seats (1-5) to purchase.' });
    }

    const company = await Company.findById(companyId).populate('subscription.plan');
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const currentExtra = company.subscription?.extraUsersCount || 0;
    const maxAddonLimit = 5;

    if (currentExtra >= maxAddonLimit) {
      return res.status(400).json({
        message: 'You have already reached the maximum of 5 add-on seats for this plan. Please upgrade your subscription plan to add more users.',
        maxReached: true,
      });
    }

    if (currentExtra + seats > maxAddonLimit) {
      const allowed = maxAddonLimit - currentExtra;
      return res.status(400).json({
        message: `You can only add up to ${allowed} more extra seat(s). Maximum allowed add-on seats is 5.`,
        allowedSeats: allowed,
      });
    }

    // Price calculation proportional to base plan price
    const baseLimit = company.subscription?.maxEmployees || 15;
    const planPrice = company.subscription?.plan?.price || 1500;
    const pricePerSeat = Math.max(99, Math.round(planPrice / baseLimit));

    const basePrice = pricePerSeat * seats;
    const gstAmount = Math.round(basePrice * 0.18);
    const totalAmount = basePrice + gstAmount;

    // Generate unique invoice number
    const txCount = await Transaction.countDocuments();
    const invoiceNumber = `INV-${company.companyCode || 'ACME'}-ADDON-${1000 + txCount}`;

    const finalPaymentId = paymentId || `pay_addon_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalOrderId = orderId || `order_addon_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalGateway = paymentGateway || paymentMethod || 'Razorpay';

    // Create transaction record
    const transaction = await Transaction.create({
      company: company._id,
      user: req.user._id,
      plan: company.subscription?.plan?._id,
      planName: `${company.subscription?.planName || 'Plan'} (Add-on +${seats} Users)`,
      description: `Add-on Extra Users (+${seats} seats @ ₹${pricePerSeat}/user)`,
      billingCycle: company.subscription?.plan?.billingCycle || 'monthly',
      invoiceNumber,
      amount: totalAmount,
      basePrice,
      gstAmount,
      paymentGateway: finalGateway,
      paymentId: finalPaymentId,
      orderId: finalOrderId,
      status: 'Success',
      startDate: company.subscription?.startDate || new Date(),
      endDate: company.subscription?.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paidAt: new Date(),
    });

    // Update company subscription
    company.subscription.extraUsersCount = currentExtra + seats;
    if (!company.subscription.extraUsersHistory) {
      company.subscription.extraUsersHistory = [];
    }
    company.subscription.extraUsersHistory.push({
      seatsAdded: seats,
      pricePerSeat,
      amountPaid: totalAmount,
      gstAmount,
      invoiceNumber,
      paymentId: finalPaymentId,
      purchasedAt: new Date(),
    });

    await company.save();

    // Log Audit Event
    try {
      const { logAudit } = require('../utils/auditLogger');
      await logAudit({
        req,
        action: 'SUBSCRIPTION_ADDON_PURCHASED',
        category: 'BILLING',
        status: 'SUCCESS',
        details: {
          seatsAdded: seats,
          newExtraCount: company.subscription.extraUsersCount,
          totalAllowed: baseLimit + company.subscription.extraUsersCount,
          pricePerSeat,
          totalAmount,
          invoiceNumber,
          paymentId: finalPaymentId,
        },
      });
    } catch (e) {
      console.error('Audit log failed for addon:', e.message);
    }

    res.status(200).json({
      success: true,
      message: `Successfully added ${seats} extra user seat(s)! Your total seat limit is now ${baseLimit + company.subscription.extraUsersCount} users.`,
      newExtraUsersCount: company.subscription.extraUsersCount,
      totalAllowedSeats: baseLimit + company.subscription.extraUsersCount,
      transaction,
    });
  } catch (error) {
    console.error('Error purchasing extra users:', error);
    res.status(500).json({ message: error.message || 'Failed to purchase extra seats' });
  }
};

// @desc    Upgrade company subscription to a higher plan
// @route   POST /api/companies/upgrade-plan
// @access  Private (Admin, CTO)
const upgradeCompanyPlan = async (req, res) => {
  try {
    const companyId = req.user.company?._id || req.user.company;
    if (!companyId) {
      return res.status(400).json({ message: 'User does not belong to any registered company.' });
    }

    const {
      newPlanId,
      paymentMethod = 'Razorpay',
      paymentId,
      orderId,
      paymentGateway = 'Razorpay',
    } = req.body;
    if (!newPlanId) {
      return res.status(400).json({ message: 'Please select a plan to upgrade to.' });
    }

    const [company, newPlan] = await Promise.all([
      Company.findById(companyId).populate('subscription.plan'),
      SubscriptionPlan.findById(newPlanId),
    ]);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    if (!newPlan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    // Check if company is already on this active plan
    const isSamePlan = company.subscription?.plan?._id?.toString() === newPlan._id.toString();
    if (isSamePlan && company.subscription?.status === 'Active') {
      return res.status(400).json({ message: 'Your company is already subscribed to this plan.' });
    }

    const basePrice = newPlan.price || 0;
    const gstAmount = Math.round(basePrice * 0.18);
    const totalAmount = basePrice + gstAmount;

    // Generate invoice number
    const txCount = await Transaction.countDocuments();
    const invoiceNumber = `INV-${company.companyCode || 'ACME'}-UPG-${1000 + txCount}`;

    const durationDays = newPlan.durationDays || (newPlan.billingCycle === 'Yearly' ? 365 : 30);
    const startDate = new Date();
    const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    const finalPaymentId = paymentId || `pay_upg_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalOrderId = orderId || `order_upg_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalGateway = paymentGateway || paymentMethod || 'Razorpay';

    // Create transaction record
    const transaction = await Transaction.create({
      company: company._id,
      user: req.user._id,
      plan: newPlan._id,
      planName: `${newPlan.name} Plan Upgrade`,
      description: `Plan Upgrade to ${newPlan.name} (${newPlan.maxEmployees} User Seats)`,
      billingCycle: newPlan.billingCycle || 'monthly',
      invoiceNumber,
      amount: totalAmount,
      basePrice,
      gstAmount,
      paymentGateway: finalGateway,
      paymentId: finalPaymentId,
      orderId: finalOrderId,
      status: 'Success',
      startDate,
      endDate,
      paidAt: new Date(),
    });

    // Update company subscription
    company.subscription.plan = newPlan._id;
    company.subscription.planName = newPlan.name;
    company.subscription.maxEmployees = newPlan.maxEmployees;
    company.subscription.extraUsersCount = 0; // reset add-on seats on new tier
    company.subscription.status = 'Active';
    company.subscription.startDate = startDate;
    company.subscription.endDate = endDate;

    await company.save();

    // Log Audit Event
    try {
      const { logAudit } = require('../utils/auditLogger');
      await logAudit({
        req,
        action: 'SUBSCRIPTION_PLAN_UPGRADED',
        category: 'BILLING',
        status: 'SUCCESS',
        details: {
          newPlanName: newPlan.name,
          newLimit: newPlan.maxEmployees,
          amount: totalAmount,
          invoiceNumber,
          paymentId: finalPaymentId,
        },
      });
    } catch (e) {
      console.error('Audit log failed for upgrade:', e.message);
    }

    res.status(200).json({
      success: true,
      message: `Successfully upgraded to ${newPlan.name}! Your new employee limit is ${newPlan.maxEmployees} users.`,
      subscription: company.subscription,
      transaction,
    });
  } catch (error) {
    console.error('Error upgrading plan:', error);
    res.status(500).json({ message: error.message || 'Failed to upgrade subscription plan' });
  }
};

// @desc    Get all platform billing transactions across all tenant companies with period filtering and sorting
// @route   GET /api/companies/platform/transactions
// @access  Private (Super Admin)
const getAllPlatformTransactions = async (req, res) => {
  try {
    const { search, gateway, status, period = 'all', startDate, endDate, sortBy = 'date_desc' } = req.query;

    const query = {};

    if (gateway && gateway !== 'ALL') {
      query.paymentGateway = new RegExp(gateway, 'i');
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }

    // Determine date range based on period filter (today, week, month, year, custom)
    const now = new Date();
    let computedStart = null;
    let computedEnd = null;
    let periodLabel = 'All Time';

    if (period === 'today') {
      computedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      computedEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      periodLabel = 'Today (' + now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ')';
    } else if (period === 'week') {
      // Current week (Monday to Sunday)
      const dayOfWeek = now.getDay() || 7; // Sunday is 7
      computedStart = new Date(now);
      computedStart.setDate(now.getDate() - dayOfWeek + 1);
      computedStart.setHours(0, 0, 0, 0);

      computedEnd = new Date(computedStart);
      computedEnd.setDate(computedStart.getDate() + 6);
      computedEnd.setHours(23, 59, 59, 999);
      periodLabel = 'This Week (' + computedStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' - ' + computedEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ')';
    } else if (period === 'month') {
      computedStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      computedEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      periodLabel = 'This Month (' + now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) + ')';
    } else if (period === 'year') {
      computedStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      computedEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      periodLabel = 'This Year (' + now.getFullYear() + ')';
    } else if (period === 'custom' && (startDate || endDate)) {
      if (startDate) computedStart = new Date(new Date(startDate).setHours(0, 0, 0, 0));
      if (endDate) computedEnd = new Date(new Date(endDate).setHours(23, 59, 59, 999));
      periodLabel = 'Custom Range (' + (startDate || 'Beginning') + ' to ' + (endDate || 'Present') + ')';
    } else if (startDate || endDate) {
      if (startDate) computedStart = new Date(new Date(startDate).setHours(0, 0, 0, 0));
      if (endDate) computedEnd = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    if (computedStart || computedEnd) {
      query.paidAt = {};
      if (computedStart) query.paidAt.$gte = computedStart;
      if (computedEnd) query.paidAt.$lte = computedEnd;
    }

    let transactions = await Transaction.find(query)
      .populate('company', 'name companyCode location address phone contactEmail registrationNumber gstNumber subscription')
      .populate('user', 'name email phone')
      .populate('plan', 'name price billingCycle maxEmployees');

    // In-memory text search across company name, code, invoice number, payment id, order id
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      transactions = transactions.filter((t) => {
        const compName = t.company?.name?.toLowerCase() || '';
        const compCode = t.company?.companyCode?.toLowerCase() || '';
        const invNum = t.invoiceNumber?.toLowerCase() || '';
        const payId = t.paymentId?.toLowerCase() || '';
        const ordId = t.orderId?.toLowerCase() || '';
        const planName = t.planName?.toLowerCase() || '';
        const desc = t.description?.toLowerCase() || '';
        return (
          compName.includes(term) ||
          compCode.includes(term) ||
          invNum.includes(term) ||
          payId.includes(term) ||
          ordId.includes(term) ||
          planName.includes(term) ||
          desc.includes(term)
        );
      });
    }

    // Sorting
    transactions.sort((a, b) => {
      const dateA = new Date(a.paidAt || a.createdAt).getTime();
      const dateB = new Date(b.paidAt || b.createdAt).getTime();
      const amountA = Number(a.amount) || 0;
      const amountB = Number(b.amount) || 0;
      const gstA = Number(a.gstAmount) || 0;
      const gstB = Number(b.gstAmount) || 0;
      const compA = (a.company?.name || '').toLowerCase();
      const compB = (b.company?.name || '').toLowerCase();

      switch (sortBy) {
        case 'date_asc':
          return dateA - dateB;
        case 'amount_desc':
          return amountB - amountA;
        case 'amount_asc':
          return amountA - amountB;
        case 'gst_desc':
          return gstB - gstA;
        case 'gst_asc':
          return gstA - gstB;
        case 'company_asc':
          return compA.localeCompare(compB);
        case 'company_desc':
          return compB.localeCompare(compA);
        case 'date_desc':
        default:
          return dateB - dateA;
      }
    });

    // Calculate aggregated platform metrics for the filtered period
    const totalRevenue = transactions
      .filter((t) => t.status === 'Success')
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    const totalTaxable = transactions
      .filter((t) => t.status === 'Success')
      .reduce((acc, t) => acc + (t.basePrice || 0), 0);

    const totalGst = transactions
      .filter((t) => t.status === 'Success')
      .reduce((acc, t) => acc + (t.gstAmount || 0), 0);

    const uniqueCompaniesCount = new Set(
      transactions.map((t) => (t.company?._id || t.company)?.toString()).filter(Boolean)
    ).size;

    res.json({
      success: true,
      count: transactions.length,
      periodLabel,
      activePeriod: period,
      transactions,
      stats: {
        totalTransactions: transactions.length,
        successfulCount: transactions.filter((t) => t.status === 'Success').length,
        totalRevenue,
        totalTaxable,
        totalGst,
        cgst: Math.round(totalGst / 2),
        sgst: Math.round(totalGst / 2),
        payingCompaniesCount: uniqueCompaniesCount,
      },
    });
  } catch (error) {
    console.error('Error fetching platform transactions:', error);
    res.status(500).json({ message: error.message || 'Error fetching platform transactions' });
  }
};

module.exports = {
  getCompanies,
  getCompany,
  registerOffice,
  publicOnboardOffice,
  getMyTransactions,
  getTransactionInvoice,
  updateCompany,
  updateSubscription,
  deleteCompany,
  getPlatformStats,
  createCheckoutOrder,
  purchaseExtraUsers,
  upgradeCompanyPlan,
  getAllPlatformTransactions,
};
