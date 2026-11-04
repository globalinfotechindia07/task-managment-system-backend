const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Customer = require('../models/Customer');

// Helper to extract companyId from request
const getCompanyId = (req) => {
  return (req.user?.company?._id || req.user?.company || req.companyId)?.toString();
};

// ===================== CRM STATS & OVERVIEW =====================
exports.getCRMStats = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'Company context required' });
    }

    const [leads, deals, customers] = await Promise.all([
      Lead.find({ company: companyId }),
      Deal.find({ company: companyId }),
      Customer.find({ company: companyId }),
    ]);

    // Calculate Leads Stats
    const totalLeads = leads.length;
    const leadsByStatus = {
      New: leads.filter((l) => l.status === 'New').length,
      Contacted: leads.filter((l) => l.status === 'Contacted').length,
      Qualified: leads.filter((l) => l.status === 'Qualified').length,
      Proposal: leads.filter((l) => l.status === 'Proposal').length,
      Negotiation: leads.filter((l) => l.status === 'Negotiation').length,
      Won: leads.filter((l) => l.status === 'Won').length,
      Lost: leads.filter((l) => l.status === 'Lost').length,
    };

    // Leads by source breakdown
    const leadsBySource = leads.reduce((acc, lead) => {
      const src = lead.source || 'Other';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {});

    // Calculate Deals & Pipeline Stats
    const totalDeals = deals.length;
    const activePipelineDeals = deals.filter(
      (d) => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost'
    );
    const activePipelineValue = activePipelineDeals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    const wonDeals = deals.filter((d) => d.stage === 'Closed Won');
    const wonRevenue = wonDeals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const winRate = totalDeals > 0 ? Math.round((wonDeals.length / totalDeals) * 100) : 0;

    const dealsByStage = {
      Discovery: deals.filter((d) => d.stage === 'Discovery'),
      Proposal: deals.filter((d) => d.stage === 'Proposal'),
      Negotiation: deals.filter((d) => d.stage === 'Negotiation'),
      'Closed Won': wonDeals,
      'Closed Lost': deals.filter((d) => d.stage === 'Closed Lost'),
    };

    // Calculate Total Customer Accounts
    const totalCustomers = customers.length;
    const totalCustomerLTV = customers.reduce((sum, c) => sum + (Number(c.totalSpend) || 0), 0) + wonRevenue;

    res.json({
      success: true,
      stats: {
        totalLeads,
        leadsByStatus,
        leadsBySource,
        totalDeals,
        activeDealsCount: activePipelineDeals.length,
        activePipelineValue,
        wonDealsCount: wonDeals.length,
        wonRevenue,
        winRate,
        totalCustomers,
        totalCustomerLTV,
      },
      stageCounts: {
        Discovery: dealsByStage.Discovery.length,
        Proposal: dealsByStage.Proposal.length,
        Negotiation: dealsByStage.Negotiation.length,
        'Closed Won': dealsByStage['Closed Won'].length,
        'Closed Lost': dealsByStage['Closed Lost'].length,
      },
    });
  } catch (err) {
    console.error('Error fetching CRM stats:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch CRM analytics' });
  }
};

// ===================== LEADS CONTROLLERS =====================
exports.getLeads = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const { status, source, priority, search } = req.query;
    const query = { company: companyId };

    if (status && status !== 'ALL') query.status = status;
    if (source && source !== 'ALL') query.source = source;
    if (priority && priority !== 'ALL') query.priority = priority;

    let leads = await Lead.find(query)
      .populate('assignedTo', 'name email designation')
      .populate('convertedToDeal', 'title amount stage')
      .populate('convertedToCustomer', 'name contactPerson')
      .sort({ createdAt: -1 });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      leads = leads.filter(
        (l) =>
          l.name?.toLowerCase().includes(term) ||
          l.companyName?.toLowerCase().includes(term) ||
          l.email?.toLowerCase().includes(term) ||
          l.phone?.toLowerCase().includes(term) ||
          l.title?.toLowerCase().includes(term)
      );
    }

    res.json(leads);
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch leads' });
  }
};

exports.createLead = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const {
      name,
      companyName,
      email,
      phone,
      title,
      value,
      status = 'New',
      source = 'Website',
      priority = 'Medium',
      assignedTo,
      notes,
      followUpDate,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Lead contact person name is required' });
    }

    const lead = await Lead.create({
      company: companyId,
      name: name.trim(),
      companyName: companyName?.trim() || '',
      email: email?.trim() || '',
      phone: phone?.trim() || '',
      title: title?.trim() || '',
      value: Number(value) || 0,
      status,
      source,
      priority,
      assignedTo: assignedTo || req.user._id,
      notes: notes?.trim() || '',
      followUpDate: followUpDate || null,
    });

    const populatedLead = await Lead.findById(lead._id).populate('assignedTo', 'name email designation');
    res.status(201).json(populatedLead);
  } catch (err) {
    console.error('Error creating lead:', err);
    res.status(500).json({ message: err.message || 'Failed to create lead' });
  }
};

exports.updateLead = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const lead = await Lead.findOne({ _id: req.params.id, company: companyId });

    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const allowedFields = [
      'name',
      'companyName',
      'email',
      'phone',
      'title',
      'value',
      'status',
      'source',
      'priority',
      'assignedTo',
      'notes',
      'followUpDate',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        lead[field] = req.body[field];
      }
    });

    await lead.save();
    const updatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email designation')
      .populate('convertedToDeal')
      .populate('convertedToCustomer');

    res.json(updatedLead);
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(500).json({ message: err.message || 'Failed to update lead' });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, company: companyId });

    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (err) {
    console.error('Error deleting lead:', err);
    res.status(500).json({ message: err.message || 'Failed to delete lead' });
  }
};

// Convert Lead into Deal & Customer
exports.convertLead = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const lead = await Lead.findOne({ _id: req.params.id, company: companyId });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const {
      dealTitle,
      dealAmount,
      dealStage = 'Proposal',
      createCustomer = true,
      notes,
    } = req.body;

    let customerId = lead.convertedToCustomer;

    // Create Customer account if not exists
    if (createCustomer && !customerId) {
      const customer = await Customer.create({
        company: companyId,
        name: lead.companyName || lead.name,
        contactPerson: lead.name,
        email: lead.email,
        phone: lead.phone,
        status: 'Lead Converted',
        notes: `Converted from lead ${lead.name}`,
      });
      customerId = customer._id;
    }

    // Create Deal
    const deal = await Deal.create({
      company: companyId,
      title: dealTitle || lead.title || `${lead.companyName || lead.name} Deal`,
      clientName: lead.name,
      clientCompany: lead.companyName || '',
      clientEmail: lead.email || '',
      clientPhone: lead.phone || '',
      amount: Number(dealAmount !== undefined ? dealAmount : lead.value) || 0,
      stage: dealStage,
      probability: dealStage === 'Closed Won' ? 100 : dealStage === 'Negotiation' ? 80 : 50,
      lead: lead._id,
      assignedTo: lead.assignedTo || req.user._id,
      notes: notes || lead.notes || '',
    });

    // Update lead conversion state
    lead.status = dealStage === 'Closed Won' ? 'Won' : 'Qualified';
    lead.isConverted = true;
    lead.convertedToDeal = deal._id;
    if (customerId) lead.convertedToCustomer = customerId;
    await lead.save();

    res.json({
      success: true,
      message: 'Lead converted successfully!',
      deal,
      customerId,
      lead,
    });
  } catch (err) {
    console.error('Error converting lead:', err);
    res.status(500).json({ message: err.message || 'Failed to convert lead' });
  }
};

// ===================== DEALS & PIPELINE CONTROLLERS =====================
exports.getDeals = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const { stage, search } = req.query;
    const query = { company: companyId };
    if (stage && stage !== 'ALL') query.stage = stage;

    let deals = await Deal.find(query)
      .populate('assignedTo', 'name email designation')
      .populate('lead', 'name companyName email source')
      .sort({ createdAt: -1 });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      deals = deals.filter(
        (d) =>
          d.title?.toLowerCase().includes(term) ||
          d.clientName?.toLowerCase().includes(term) ||
          d.clientCompany?.toLowerCase().includes(term) ||
          d.clientEmail?.toLowerCase().includes(term)
      );
    }

    res.json(deals);
  } catch (err) {
    console.error('Error fetching deals:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch deals' });
  }
};

exports.createDeal = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const {
      title,
      clientName,
      clientCompany,
      clientEmail,
      clientPhone,
      amount,
      stage = 'Discovery',
      probability,
      expectedCloseDate,
      assignedTo,
      notes,
    } = req.body;

    if (!title || !clientName) {
      return res.status(400).json({ message: 'Deal title and client name are required' });
    }

    const defaultProbMap = {
      Discovery: 20,
      Proposal: 50,
      Negotiation: 80,
      'Closed Won': 100,
      'Closed Lost': 0,
    };

    const deal = await Deal.create({
      company: companyId,
      title: title.trim(),
      clientName: clientName.trim(),
      clientCompany: clientCompany?.trim() || '',
      clientEmail: clientEmail?.trim() || '',
      clientPhone: clientPhone?.trim() || '',
      amount: Number(amount) || 0,
      stage,
      probability: probability !== undefined ? Number(probability) : (defaultProbMap[stage] || 20),
      expectedCloseDate: expectedCloseDate || null,
      assignedTo: assignedTo || req.user._id,
      notes: notes?.trim() || '',
    });

    const populatedDeal = await Deal.findById(deal._id).populate('assignedTo', 'name email designation');
    res.status(201).json(populatedDeal);
  } catch (err) {
    console.error('Error creating deal:', err);
    res.status(500).json({ message: err.message || 'Failed to create deal' });
  }
};

exports.updateDeal = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const deal = await Deal.findOne({ _id: req.params.id, company: companyId });
    if (!deal) return res.status(404).json({ message: 'Deal not found' });

    const allowedFields = [
      'title',
      'clientName',
      'clientCompany',
      'clientEmail',
      'clientPhone',
      'amount',
      'stage',
      'probability',
      'expectedCloseDate',
      'assignedTo',
      'notes',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        deal[field] = req.body[field];
      }
    });

    // Auto adjust probability when stage changes if not explicitly overridden
    if (req.body.stage && req.body.probability === undefined) {
      if (req.body.stage === 'Closed Won') deal.probability = 100;
      else if (req.body.stage === 'Closed Lost') deal.probability = 0;
      else if (req.body.stage === 'Negotiation') deal.probability = 80;
      else if (req.body.stage === 'Proposal') deal.probability = 50;
      else if (req.body.stage === 'Discovery') deal.probability = 20;
    }

    await deal.save();
    const updatedDeal = await Deal.findById(deal._id).populate('assignedTo', 'name email designation');
    res.json(updatedDeal);
  } catch (err) {
    console.error('Error updating deal:', err);
    res.status(500).json({ message: err.message || 'Failed to update deal' });
  }
};

exports.deleteDeal = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const deal = await Deal.findOneAndDelete({ _id: req.params.id, company: companyId });
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    res.json({ success: true, message: 'Deal deleted successfully' });
  } catch (err) {
    console.error('Error deleting deal:', err);
    res.status(500).json({ message: err.message || 'Failed to delete deal' });
  }
};

// ===================== CUSTOMERS / ACCOUNTS CONTROLLERS =====================
exports.getCustomers = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const { status, search } = req.query;
    const query = { company: companyId };
    if (status && status !== 'ALL') query.status = status;

    let customers = await Customer.find(query).sort({ createdAt: -1 });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      customers = customers.filter(
        (c) =>
          c.name?.toLowerCase().includes(term) ||
          c.contactPerson?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term) ||
          c.phone?.toLowerCase().includes(term) ||
          c.industry?.toLowerCase().includes(term)
      );
    }

    res.json(customers);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch customers' });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const {
      name,
      contactPerson,
      email,
      phone,
      industry,
      website,
      address,
      totalSpend,
      status = 'Active',
      notes,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Customer name is required' });
    }

    const customer = await Customer.create({
      company: companyId,
      name: name.trim(),
      contactPerson: contactPerson?.trim() || '',
      email: email?.trim() || '',
      phone: phone?.trim() || '',
      industry: industry?.trim() || 'General',
      website: website?.trim() || '',
      address: address?.trim() || '',
      totalSpend: Number(totalSpend) || 0,
      status,
      notes: notes?.trim() || '',
    });

    res.status(201).json(customer);
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ message: err.message || 'Failed to create customer' });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const customer = await Customer.findOne({ _id: req.params.id, company: companyId });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const allowedFields = [
      'name',
      'contactPerson',
      'email',
      'phone',
      'industry',
      'website',
      'address',
      'totalSpend',
      'status',
      'notes',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        customer[field] = req.body[field];
      }
    });

    await customer.save();
    res.json(customer);
  } catch (err) {
    console.error('Error updating customer:', err);
    res.status(500).json({ message: err.message || 'Failed to update customer' });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const customer = await Customer.findOneAndDelete({ _id: req.params.id, company: companyId });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (err) {
    console.error('Error deleting customer:', err);
    res.status(500).json({ message: err.message || 'Failed to delete customer' });
  }
};

