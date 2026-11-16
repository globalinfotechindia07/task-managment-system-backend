const ClientInvoice = require('../models/ClientInvoice');
const ClientPayment = require('../models/ClientPayment');
const Project = require('../models/Project');
const User = require('../models/User');
const Company = require('../models/Company');
const { sendRealTimeNotification } = require('../utils/socketService');
const { logAudit } = require('../utils/auditLogger');

// Helper to get company ID from authenticated user
const getUserCompanyId = (user) => {
  if (!user) return null;
  return user.company?._id || user.company;
};

// ============================================================
// 1. FINANCIAL DASHBOARD & OVERVIEW FOR ACCOUNTANT
// ============================================================

// @desc    Get complete financial summary for accountant client billing
// @route   GET /api/accountant/summary
// @access  Private (Accountant, Admin, CTO, Finance)
const getAccountantSummary = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const [invoices, payments, companyDoc] = await Promise.all([
      ClientInvoice.find({ company: companyId }).sort({ invoiceDate: -1 }),
      ClientPayment.find({ company: companyId }).sort({ paymentDate: -1 }),
      Company.findById(companyId).select('name gstNumber address phone contactEmail registrationNumber'),
    ]);

    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalTds = 0;
    let totalOutstanding = 0;
    let totalTaxLiability = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    let draftCount = 0;
    let sentCount = 0;
    let partiallyPaidCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let cancelledCount = 0;

    const now = new Date();
    const clientBalances = {};

    invoices.forEach((inv) => {
      if (inv.status === 'Cancelled') {
        cancelledCount += 1;
        return;
      }

      totalInvoiced += Number(inv.totalAmount) || 0;
      totalPaid += Number(inv.paidAmount) || 0;
      totalTds += Number(inv.tdsDeducted) || 0;
      totalTaxLiability += Number(inv.totalTax) || 0;
      cgstTotal += Number(inv.cgstAmount) || 0;
      sgstTotal += Number(inv.sgstAmount) || 0;
      igstTotal += Number(inv.igstAmount) || 0;

      const due = Number(inv.balanceDue) || 0;
      totalOutstanding += due;

      // Check overdue
      const isPastDue = inv.dueDate && new Date(inv.dueDate) < now && due > 0;
      if (isPastDue && inv.status !== 'Paid') {
        overdueCount += 1;
      }

      if (inv.status === 'Draft') draftCount += 1;
      else if (inv.status === 'Sent') sentCount += 1;
      else if (inv.status === 'Partially Paid') partiallyPaidCount += 1;
      else if (inv.status === 'Paid') paidCount += 1;

      // Group by client
      const cName = inv.clientCompany || inv.clientName || 'General Client';
      if (!clientBalances[cName]) {
        clientBalances[cName] = {
          clientName: inv.clientName,
          clientCompany: inv.clientCompany,
          clientEmail: inv.clientEmail,
          totalInvoiced: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          invoicesCount: 0,
        };
      }
      clientBalances[cName].totalInvoiced += Number(inv.totalAmount) || 0;
      clientBalances[cName].totalPaid += Number(inv.paidAmount) || 0;
      clientBalances[cName].totalOutstanding += due;
      clientBalances[cName].invoicesCount += 1;
    });

    // Top clients with outstanding balance
    const topDebtors = Object.values(clientBalances)
      .filter((c) => c.totalOutstanding > 0)
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .slice(0, 5);

    // Monthly breakdown for last 6 months
    const monthlyStats = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      let billedInMonth = 0;
      let collectedInMonth = 0;

      invoices.forEach((inv) => {
        if (inv.status !== 'Cancelled' && inv.invoiceDate >= monthStart && inv.invoiceDate <= monthEnd) {
          billedInMonth += Number(inv.totalAmount) || 0;
        }
      });

      payments.forEach((pay) => {
        if (pay.paymentDate >= monthStart && pay.paymentDate <= monthEnd) {
          collectedInMonth += Number(pay.amountPaid) || 0;
        }
      });

      monthlyStats.push({
        month: monthLabel,
        billed: billedInMonth,
        collected: collectedInMonth,
      });
    }

    const collectionRate =
      totalInvoiced > 0 ? Math.min(100, Math.round((totalPaid / totalInvoiced) * 100)) : 0;

    res.json({
      success: true,
      company: companyDoc,
      summary: {
        totalInvoiced,
        totalPaid,
        totalTds,
        totalOutstanding: Math.max(0, totalOutstanding),
        collectionRate,
        totalTaxLiability,
        cgstTotal,
        sgstTotal,
        igstTotal,
        invoiceCounts: {
          total: invoices.length,
          draft: draftCount,
          sent: sentCount,
          partiallyPaid: partiallyPaidCount,
          paid: paidCount,
          overdue: overdueCount,
          cancelled: cancelledCount,
        },
      },
      monthlyStats,
      topDebtors,
      recentInvoices: invoices.slice(0, 5),
      recentPayments: payments.slice(0, 5),
    });
  } catch (error) {
    console.error('Error in getAccountantSummary:', error);
    res.status(500).json({ message: 'Failed to fetch accountant summary', error: error.message });
  }
};

// ============================================================
// 2. CLIENT INVOICE MANAGEMENT
// ============================================================

// @desc    Get all client invoices with filtering
// @route   GET /api/accountant/invoices
// @access  Private (Accountant, Admin, CTO, Finance)
const getClientInvoices = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { status, client, project, search, startDate, endDate } = req.query;

    const query = { company: companyId };

    if (status && status !== 'ALL') {
      if (status === 'Overdue') {
        query.status = { $ne: 'Paid' };
        query.dueDate = { $lt: new Date() };
        query.balanceDue = { $gt: 0 };
      } else {
        query.status = status;
      }
    }

    if (client && client !== 'ALL') {
      query.$or = [{ client }, { clientName: new RegExp(client, 'i') }];
    }

    if (project && project !== 'ALL') {
      query.project = project;
    }

    if (search) {
      const term = search.trim();
      query.$or = [
        { invoiceNumber: new RegExp(term, 'i') },
        { clientName: new RegExp(term, 'i') },
        { clientCompany: new RegExp(term, 'i') },
        { projectName: new RegExp(term, 'i') },
      ];
    }

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    const invoices = await ClientInvoice.find(query)
      .populate('project', 'name progress')
      .populate('client', 'name email phone')
      .sort({ invoiceDate: -1, createdAt: -1 });

    res.json({ success: true, count: invoices.length, invoices });
  } catch (error) {
    console.error('Error fetching client invoices:', error);
    res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
  }
};

// @desc    Get single invoice by ID
// @route   GET /api/accountant/invoices/:id
// @access  Private
const getClientInvoiceById = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const invoice = await ClientInvoice.findOne({ _id: req.params.id, company: companyId })
      .populate('project', 'name progress clientName clientEmail')
      .populate('client', 'name email phone company')
      .populate('createdBy', 'name email role');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const company = await Company.findById(companyId);

    // Also fetch payment receipts linked to this invoice
    const payments = await ClientPayment.find({ invoice: invoice._id }).sort({ paymentDate: -1 });

    res.json({ success: true, invoice, company, payments });
  } catch (error) {
    console.error('Error fetching invoice by ID:', error);
    res.status(500).json({ message: 'Failed to fetch invoice', error: error.message });
  }
};

// Helper: Calculate invoice line items and tax totals
const computeInvoiceTotals = (items = [], discount = 0, isInterstate = false) => {
  let subtotal = 0;
  let totalTax = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const processedItems = items.map((item) => {
    const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const rate = Number(item.rate) || 0;
    const amount = Math.round(qty * rate * 100) / 100;
    const gstRate = Number(item.gstRate) >= 0 ? Number(item.gstRate) : 18;
    const gstAmount = Math.round(((amount * gstRate) / 100) * 100) / 100;
    const total = amount + gstAmount;

    subtotal += amount;
    totalTax += gstAmount;

    if (isInterstate) {
      igstTotal += gstAmount;
    } else {
      cgstTotal += gstAmount / 2;
      sgstTotal += gstAmount / 2;
    }

    return {
      description: item.description,
      sacHsnCode: item.sacHsnCode || '998314',
      quantity: qty,
      unit: item.unit || 'Milestone',
      rate,
      amount,
      gstRate,
      gstAmount,
      total,
    };
  });

  const disc = Number(discount) >= 0 ? Number(discount) : 0;
  const totalAmount = Math.max(0, subtotal - disc + totalTax);

  return {
    items: processedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    discount: disc,
    isInterstate,
    cgstAmount: Math.round(cgstTotal * 100) / 100,
    sgstAmount: Math.round(sgstTotal * 100) / 100,
    igstAmount: Math.round(igstTotal * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
};

// @desc    Create a new Client Tax / Proforma Invoice
// @route   POST /api/accountant/invoices
// @access  Private (Accountant, Admin, CTO, Finance)
const createClientInvoice = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const {
      invoiceNumber,
      invoiceType = 'Tax Invoice',
      clientId,
      clientName,
      clientCompany,
      clientEmail,
      clientPhone,
      clientGstin,
      clientAddress,
      projectId,
      milestoneId,
      invoiceDate = new Date(),
      dueDate,
      currency = 'INR',
      items = [],
      discount = 0,
      isInterstate = false,
      bankDetails,
      termsAndConditions,
      notes,
      status = 'Sent',
    } = req.body;

    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ message: 'Client name is required' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'At least one line item is required' });
    }

    if (!dueDate) {
      return res.status(400).json({ message: 'Invoice due date is required' });
    }

    // Auto-generate invoice number if not provided
    let finalInvoiceNumber = invoiceNumber ? invoiceNumber.trim().toUpperCase() : '';
    if (!finalInvoiceNumber) {
      const year = new Date(invoiceDate).getFullYear();
      const count = await ClientInvoice.countDocuments({ company: companyId });
      finalInvoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    // Check duplicate invoice number
    const existing = await ClientInvoice.findOne({ company: companyId, invoiceNumber: finalInvoiceNumber });
    if (existing) {
      return res.status(400).json({ message: `Invoice number "${finalInvoiceNumber}" already exists.` });
    }

    // Compute totals
    const computed = computeInvoiceTotals(items, discount, isInterstate);

    // Get project details if linked
    let projectName = '';
    let projectDoc = null;
    if (projectId) {
      projectDoc = await Project.findOne({ _id: projectId, company: companyId });
      if (projectDoc) {
        projectName = projectDoc.name;
      }
    }

    const newInvoice = new ClientInvoice({
      company: companyId,
      invoiceNumber: finalInvoiceNumber,
      invoiceType,
      client: clientId || null,
      clientName: clientName.trim(),
      clientCompany: clientCompany ? clientCompany.trim() : '',
      clientEmail: clientEmail ? clientEmail.trim().toLowerCase() : '',
      clientPhone: clientPhone ? clientPhone.trim() : '',
      clientGstin: clientGstin ? clientGstin.trim().toUpperCase() : '',
      clientAddress: clientAddress || {},
      project: projectId || null,
      projectName,
      milestoneId: milestoneId || '',
      invoiceDate,
      dueDate,
      currency,
      items: computed.items,
      subtotal: computed.subtotal,
      discount: computed.discount,
      isInterstate: computed.isInterstate,
      cgstRate: isInterstate ? 0 : 9,
      cgstAmount: computed.cgstAmount,
      sgstRate: isInterstate ? 0 : 9,
      sgstAmount: computed.sgstAmount,
      igstRate: isInterstate ? 18 : 0,
      igstAmount: computed.igstAmount,
      totalTax: computed.totalTax,
      totalAmount: computed.totalAmount,
      paidAmount: 0,
      tdsDeducted: 0,
      balanceDue: computed.totalAmount,
      status,
      bankDetails: bankDetails || {},
      termsAndConditions: termsAndConditions || undefined,
      notes: notes || undefined,
      createdBy: req.user._id,
      createdByName: req.user.name,
    });

    await newInvoice.save();

    // If milestoneId and project linked, sync with project milestone
    if (projectDoc && milestoneId) {
      const milestone = projectDoc.billingMilestones.id(milestoneId);
      if (milestone) {
        milestone.invoiceNumber = finalInvoiceNumber;
        milestone.invoiceDate = invoiceDate;
        milestone.amount = computed.totalAmount;
        await projectDoc.save();
      }
    }

    // Real-time notification if client user is linked
    if (clientId) {
      sendRealTimeNotification(clientId, {
        title: `New Invoice Generated: ${finalInvoiceNumber}`,
        message: `An invoice of ${currency} ${computed.totalAmount} has been generated for your project.`,
        type: 'billing',
        link: '/client/invoices',
      });
    }

    logAudit({
      req,
      action: 'CLIENT_INVOICE_CREATED',
      category: 'FINANCE',
      status: 'SUCCESS',
      details: { invoiceNumber: finalInvoiceNumber, totalAmount: computed.totalAmount },
    });

    res.status(201).json({
      success: true,
      message: `Invoice ${finalInvoiceNumber} created successfully.`,
      invoice: newInvoice,
    });
  } catch (error) {
    console.error('Error creating client invoice:', error);
    res.status(500).json({ message: 'Failed to create invoice', error: error.message });
  }
};

// @desc    Update client invoice
// @route   PUT /api/accountant/invoices/:id
// @access  Private (Accountant, Admin, CTO, Finance)
const updateClientInvoice = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const invoice = await ClientInvoice.findOne({ _id: req.params.id, company: companyId });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const {
      invoiceType,
      clientName,
      clientCompany,
      clientEmail,
      clientPhone,
      clientGstin,
      clientAddress,
      dueDate,
      items,
      discount,
      isInterstate,
      bankDetails,
      termsAndConditions,
      notes,
      status,
    } = req.body;

    if (clientName) invoice.clientName = clientName.trim();
    if (clientCompany !== undefined) invoice.clientCompany = clientCompany.trim();
    if (clientEmail !== undefined) invoice.clientEmail = clientEmail.trim().toLowerCase();
    if (clientPhone !== undefined) invoice.clientPhone = clientPhone.trim();
    if (clientGstin !== undefined) invoice.clientGstin = clientGstin.trim().toUpperCase();
    if (clientAddress) invoice.clientAddress = clientAddress;
    if (dueDate) invoice.dueDate = dueDate;
    if (invoiceType) invoice.invoiceType = invoiceType;
    if (bankDetails) invoice.bankDetails = bankDetails;
    if (termsAndConditions !== undefined) invoice.termsAndConditions = termsAndConditions;
    if (notes !== undefined) invoice.notes = notes;
    if (status) invoice.status = status;

    if (items && items.length > 0) {
      const computed = computeInvoiceTotals(items, discount !== undefined ? discount : invoice.discount, isInterstate !== undefined ? isInterstate : invoice.isInterstate);
      invoice.items = computed.items;
      invoice.subtotal = computed.subtotal;
      invoice.discount = computed.discount;
      invoice.isInterstate = computed.isInterstate;
      invoice.cgstAmount = computed.cgstAmount;
      invoice.sgstAmount = computed.sgstAmount;
      invoice.igstAmount = computed.igstAmount;
      invoice.totalTax = computed.totalTax;
      invoice.totalAmount = computed.totalAmount;
      invoice.balanceDue = Math.max(0, computed.totalAmount - (invoice.paidAmount || 0) - (invoice.tdsDeducted || 0));

      if (invoice.balanceDue <= 0 && invoice.paidAmount > 0) {
        invoice.status = 'Paid';
      }
    }

    await invoice.save();

    res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} updated successfully.`,
      invoice,
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ message: 'Failed to update invoice', error: error.message });
  }
};

// @desc    Delete client invoice
// @route   DELETE /api/accountant/invoices/:id
// @access  Private (Accountant, Admin, CTO)
const deleteClientInvoice = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const invoice = await ClientInvoice.findOne({ _id: req.params.id, company: companyId });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Check if payments exist against this invoice
    const paymentsCount = await ClientPayment.countDocuments({ invoice: invoice._id });
    if (paymentsCount > 0) {
      return res.status(400).json({
        message: `Cannot delete invoice ${invoice.invoiceNumber} because ${paymentsCount} payment receipt(s) are recorded against it. Cancel the invoice instead.`,
      });
    }

    await ClientInvoice.deleteOne({ _id: invoice._id });

    res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} has been deleted.`,
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ message: 'Failed to delete invoice', error: error.message });
  }
};

// ============================================================
// 3. PAYMENT RECEIPTS & VOUCHERS MANAGEMENT
// ============================================================

// @desc    Get all payment receipt vouchers
// @route   GET /api/accountant/payments
// @access  Private (Accountant, Admin, CTO, Finance)
const getClientPayments = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { invoiceId, client, paymentMethod, startDate, endDate } = req.query;

    const query = { company: companyId };
    if (invoiceId) query.invoice = invoiceId;
    if (paymentMethod && paymentMethod !== 'ALL') query.paymentMethod = paymentMethod;
    if (client) query.$or = [{ client }, { clientName: new RegExp(client, 'i') }];

    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) query.paymentDate.$lte = new Date(endDate);
    }

    const payments = await ClientPayment.find(query)
      .populate('invoice', 'invoiceNumber totalAmount balanceDue')
      .sort({ paymentDate: -1, createdAt: -1 });

    res.json({ success: true, count: payments.length, payments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Failed to fetch payments', error: error.message });
  }
};

// @desc    Record client payment & generate receipt voucher
// @route   POST /api/accountant/payments
// @access  Private (Accountant, Admin, CTO, Finance)
const recordClientPayment = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const {
      invoiceId,
      receiptNumber,
      amountPaid,
      tdsAmount = 0,
      paymentDate = new Date(),
      paymentMethod = 'Bank Transfer / NEFT',
      paymentReference,
      depositedToAccount = 'Primary Bank Account',
      chequeDate,
      chequeClearanceStatus,
      notes,
    } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ message: 'Invoice ID is required' });
    }

    const parsedAmountPaid = Number(amountPaid);
    if (!parsedAmountPaid || parsedAmountPaid <= 0) {
      return res.status(400).json({ message: 'Valid amount paid is required' });
    }

    const parsedTds = Number(tdsAmount) || 0;
    const netReceived = Math.max(0, parsedAmountPaid - parsedTds);

    const invoice = await ClientInvoice.findOne({ _id: invoiceId, company: companyId });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Auto-generate receipt number
    let finalReceiptNumber = receiptNumber ? receiptNumber.trim().toUpperCase() : '';
    if (!finalReceiptNumber) {
      const year = new Date(paymentDate).getFullYear();
      const count = await ClientPayment.countDocuments({ company: companyId });
      finalReceiptNumber = `REC-${year}-${String(count + 1).padStart(4, '0')}`;
    }

    // Create payment receipt voucher
    const payment = new ClientPayment({
      company: companyId,
      receiptNumber: finalReceiptNumber,
      invoice: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      client: invoice.client || null,
      clientName: invoice.clientName,
      clientCompany: invoice.clientCompany,
      amountPaid: parsedAmountPaid,
      tdsAmount: parsedTds,
      netReceived,
      currency: invoice.currency || 'INR',
      paymentDate,
      paymentMethod,
      paymentReference: paymentReference ? paymentReference.trim() : '',
      depositedToAccount: depositedToAccount ? depositedToAccount.trim() : 'Primary Bank Account',
      chequeDate: chequeDate || null,
      chequeClearanceStatus: chequeClearanceStatus || (paymentMethod === 'Cheque' ? 'Uncleared' : 'N/A'),
      notes: notes || '',
      recordedBy: req.user._id,
      recordedByName: req.user.name,
    });

    await payment.save();

    // Update invoice financials
    invoice.paidAmount = (Number(invoice.paidAmount) || 0) + parsedAmountPaid;
    invoice.tdsDeducted = (Number(invoice.tdsDeducted) || 0) + parsedTds;
    invoice.balanceDue = Math.max(0, invoice.totalAmount - invoice.paidAmount - invoice.tdsDeducted);

    if (invoice.balanceDue <= 0) {
      invoice.status = 'Paid';
    } else {
      invoice.status = 'Partially Paid';
    }

    await invoice.save();

    // If invoice is linked to a Project milestone, sync project billing
    if (invoice.project && invoice.milestoneId) {
      const project = await Project.findOne({ _id: invoice.project, company: companyId });
      if (project) {
        const milestone = project.billingMilestones.id(invoice.milestoneId);
        if (milestone) {
          milestone.status = invoice.status;
          milestone.paidAmount = (Number(milestone.paidAmount) || 0) + parsedAmountPaid;
          milestone.paidAt = paymentDate;
          milestone.paymentMethod = paymentMethod;
          milestone.paymentReference = paymentReference;
          await project.save();
        }
      }
    }

    // Real-time socket notification to client
    if (invoice.client) {
      sendRealTimeNotification(invoice.client, {
        title: `Payment Acknowledged: ${finalReceiptNumber}`,
        message: `Your payment of ${invoice.currency || 'INR'} ${parsedAmountPaid} for invoice ${invoice.invoiceNumber} has been received.`,
        type: 'billing',
        link: '/client/invoices',
      });
    }

    logAudit({
      req,
      action: 'CLIENT_PAYMENT_RECORDED',
      category: 'FINANCE',
      status: 'SUCCESS',
      details: { receiptNumber: finalReceiptNumber, invoiceNumber: invoice.invoiceNumber, amountPaid: parsedAmountPaid },
    });

    res.status(201).json({
      success: true,
      message: `Payment of ${invoice.currency} ${parsedAmountPaid} recorded successfully with Receipt #${finalReceiptNumber}.`,
      payment,
      invoice,
    });
  } catch (error) {
    console.error('Error recording client payment:', error);
    res.status(500).json({ message: 'Failed to record payment', error: error.message });
  }
};

// @desc    Get single receipt voucher by ID
// @route   GET /api/accountant/payments/:id
// @access  Private
const getClientPaymentById = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const payment = await ClientPayment.findOne({ _id: req.params.id, company: companyId })
      .populate('invoice')
      .populate('recordedBy', 'name email role');

    if (!payment) {
      return res.status(404).json({ message: 'Payment receipt not found' });
    }

    const company = await Company.findById(companyId);

    res.json({ success: true, payment, company });
  } catch (error) {
    console.error('Error fetching payment by ID:', error);
    res.status(500).json({ message: 'Failed to fetch payment', error: error.message });
  }
};

// ============================================================
// 4. CLIENT LEDGER & STATEMENT OF ACCOUNTS
// ============================================================

// @desc    Get chronological ledger statement for any client
// @route   GET /api/accountant/ledger
// @access  Private (Accountant, Admin, CTO, Finance)
const getClientLedger = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { clientName, clientId } = req.query;

    if (!clientName && !clientId) {
      return res.status(400).json({ message: 'Please specify clientName or clientId' });
    }

    const invoiceQuery = { company: companyId, status: { $ne: 'Cancelled' } };
    const paymentQuery = { company: companyId };

    if (clientId) {
      invoiceQuery.client = clientId;
      paymentQuery.client = clientId;
    } else {
      const regex = new RegExp(`^${clientName.trim()}$`, 'i');
      invoiceQuery.$or = [{ clientName: regex }, { clientCompany: regex }];
      paymentQuery.$or = [{ clientName: regex }, { clientCompany: regex }];
    }

    const [invoices, payments, companyDoc] = await Promise.all([
      ClientInvoice.find(invoiceQuery).sort({ invoiceDate: 1 }),
      ClientPayment.find(paymentQuery).sort({ paymentDate: 1 }),
      Company.findById(companyId),
    ]);

    // Combine invoices (debit) and payments (credit) into unified chronological ledger
    const transactions = [];

    invoices.forEach((inv) => {
      transactions.push({
        date: inv.invoiceDate,
        type: 'INVOICE',
        refNumber: inv.invoiceNumber,
        particulars: `${inv.invoiceType || 'Tax Invoice'} - ${inv.projectName || inv.items[0]?.description || 'Services'}`,
        debit: Number(inv.totalAmount) || 0,
        credit: 0,
        tds: 0,
        currency: inv.currency || 'INR',
        id: inv._id,
      });
    });

    payments.forEach((pay) => {
      transactions.push({
        date: pay.paymentDate,
        type: 'PAYMENT',
        refNumber: pay.receiptNumber,
        particulars: `Payment Received via ${pay.paymentMethod} (Ref: ${pay.paymentReference || 'N/A'}) for ${pay.invoiceNumber}`,
        debit: 0,
        credit: Number(pay.amountPaid) || 0,
        tds: Number(pay.tdsAmount) || 0,
        currency: pay.currency || 'INR',
        id: pay._id,
      });
    });

    // Sort by date ascending
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance
    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let totalTds = 0;

    const ledgerEntries = transactions.map((t, idx) => {
      totalDebit += t.debit;
      totalCredit += t.credit;
      totalTds += t.tds;
      runningBalance = runningBalance + t.debit - t.credit;

      return {
        ...t,
        sn: idx + 1,
        balance: Math.round(runningBalance * 100) / 100,
      };
    });

    res.json({
      success: true,
      company: companyDoc,
      client: {
        name: clientName || invoices[0]?.clientName || 'Client',
        company: invoices[0]?.clientCompany || '',
        email: invoices[0]?.clientEmail || '',
        phone: invoices[0]?.clientPhone || '',
        gstin: invoices[0]?.clientGstin || '',
      },
      summary: {
        totalInvoiced: Math.round(totalDebit * 100) / 100,
        totalPaid: Math.round(totalCredit * 100) / 100,
        totalTds: Math.round(totalTds * 100) / 100,
        closingBalance: Math.round(runningBalance * 100) / 100,
      },
      ledger: ledgerEntries,
    });
  } catch (error) {
    console.error('Error fetching client ledger:', error);
    res.status(500).json({ message: 'Failed to fetch client ledger', error: error.message });
  }
};

// ============================================================
// 5. GST & TAX REPORT (GSTR-1 SALES REGISTER)
// ============================================================

// @desc    Get GSTR-1 sales register and tax breakdown
// @route   GET /api/accountant/reports/gst
// @access  Private (Accountant, Admin, CTO, Finance)
const getGstTaxReport = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { year, month } = req.query;

    const query = { company: companyId, status: { $ne: 'Cancelled' } };

    if (year) {
      const y = parseInt(year);
      if (month && month !== 'ALL') {
        const m = parseInt(month) - 1;
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0, 23, 59, 59);
        query.invoiceDate = { $gte: start, $lte: end };
      } else {
        const start = new Date(y, 0, 1);
        const end = new Date(y, 11, 31, 23, 59, 59);
        query.invoiceDate = { $gte: start, $lte: end };
      }
    }

    const invoices = await ClientInvoice.find(query).sort({ invoiceDate: -1 });

    let totalTaxableValue = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalInvoiceValue = 0;
    let b2bCount = 0;
    let b2cCount = 0;

    const b2bInvoices = [];
    const b2cInvoices = [];

    invoices.forEach((inv) => {
      const taxable = Number(inv.subtotal) - (Number(inv.discount) || 0);
      totalTaxableValue += taxable;
      totalCgst += Number(inv.cgstAmount) || 0;
      totalSgst += Number(inv.sgstAmount) || 0;
      totalIgst += Number(inv.igstAmount) || 0;
      totalInvoiceValue += Number(inv.totalAmount) || 0;

      const record = {
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        clientName: inv.clientName,
        clientCompany: inv.clientCompany,
        clientGstin: inv.clientGstin,
        taxableValue: taxable,
        cgst: inv.cgstAmount,
        sgst: inv.sgstAmount,
        igst: inv.igstAmount,
        totalTax: inv.totalTax,
        totalAmount: inv.totalAmount,
        status: inv.status,
      };

      if (inv.clientGstin && inv.clientGstin.trim().length >= 10) {
        b2bCount += 1;
        b2bInvoices.push(record);
      } else {
        b2cCount += 1;
        b2cInvoices.push(record);
      }
    });

    res.json({
      success: true,
      summary: {
        totalInvoices: invoices.length,
        b2bCount,
        b2cCount,
        totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
        totalCgst: Math.round(totalCgst * 100) / 100,
        totalSgst: Math.round(totalSgst * 100) / 100,
        totalIgst: Math.round(totalIgst * 100) / 100,
        totalTaxLiability: Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100,
        totalInvoiceValue: Math.round(totalInvoiceValue * 100) / 100,
      },
      b2bInvoices,
      b2cInvoices,
      allInvoices: invoices,
    });
  } catch (error) {
    console.error('Error generating GST tax report:', error);
    res.status(500).json({ message: 'Failed to generate tax report', error: error.message });
  }
};

module.exports = {
  getAccountantSummary,
  getClientInvoices,
  getClientInvoiceById,
  createClientInvoice,
  updateClientInvoice,
  deleteClientInvoice,
  getClientPayments,
  recordClientPayment,
  getClientPaymentById,
  getClientLedger,
  getGstTaxReport,
};

