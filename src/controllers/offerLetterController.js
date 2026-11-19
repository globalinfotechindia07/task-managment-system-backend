const OfferLetter = require('../models/OfferLetter');
const Company = require('../models/Company');
const SalaryStructure = require('../models/SalaryStructure');
const { sendEmail } = require('../utils/emailService');

// Default standard enterprise offer letter terms and conditions
const getDefaultOfferTerms = (companyName = 'the Company') => {
  return `
1. APPOINTMENT & COMMENCEMENT
Your employment will commence on the official joining date specified in this offer letter. You will be based at the location stated herein, subject to transfer or temporary assignment as required by ${companyName} in the ordinary course of business.

2. PROBATION & CONFIRMATION
You will be on probation for a period of 3 to 6 months from the date of joining. Upon successful completion and satisfactory performance assessment, your employment will be confirmed in writing.

3. COMPENSATION & TAXATION
Your Total Cost to Company (CTC) and detailed monthly breakup are set out in Annexure A. All remuneration is subject to statutory deductions including Income Tax (TDS), Provident Fund (PF), and Professional Tax (PT) as applicable under law.

4. WORKING HOURS & CODE OF CONDUCT
You are expected to adhere to the standard operating schedule and attendance policies of ${companyName}. You shall devote your entire working time, skill, and attention exclusively to the business and best interests of the company.

5. CONFIDENTIALITY & INTELLECTUAL PROPERTY
You shall maintain absolute confidentiality with respect to trade secrets, proprietary algorithms, client lists, business strategies, and code repositories. Any invention, code, or intellectual property created during your tenure remains the exclusive property of ${companyName}.

6. TERMINATION & NOTICE PERIOD
During the probation period, either party may terminate the employment contract by providing 15 days written notice or gross salary in lieu thereof. Upon confirmation, the notice period shall be 30 days unless mutually agreed otherwise.

7. BACKGROUND VERIFICATION
This offer of employment is contingent upon satisfactory verification of academic credentials, past employment records, reference checks, and submission of required statutory identification documents (PAN, Aadhaar).
`.trim();
};

// Generate next unique offer letter reference number
const generateOfferNumber = async (companyId) => {
  const year = new Date().getFullYear();
  const count = await OfferLetter.countDocuments({ company: companyId });
  const sequence = String(count + 1).padStart(4, '0');
  return `OL-${year}-${sequence}`;
};

// @desc    Get all offer letters for company
// @route   GET /api/offer-letters
// @access  Private (Admin / HR)
exports.getOfferLetters = async (req, res) => {
  try {
    let companyId = req.companyId || req.user?.company?._id || req.user?.company;
    if (req.user.role === 'Super Admin' && req.query.companyId) {
      companyId = req.query.companyId;
    }

    const { status, search } = req.query;
    const filter = { company: companyId };

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { candidateName: { $regex: q, $options: 'i' } },
        { candidateEmail: { $regex: q, $options: 'i' } },
        { designation: { $regex: q, $options: 'i' } },
        { offerNumber: { $regex: q, $options: 'i' } },
      ];
    }

    const offers = await OfferLetter.find(filter)
      .populate('createdBy', 'name email designation')
      .populate('salaryStructure', 'name code employmentType')
      .sort({ createdAt: -1 });

    // Aggregate statistics
    const allOffersForStats = await OfferLetter.find({ company: companyId }).select('status annualCTC');
    const stats = {
      total: allOffersForStats.length,
      draft: allOffersForStats.filter((o) => o.status === 'Draft').length,
      sent: allOffersForStats.filter((o) => o.status === 'Sent').length,
      accepted: allOffersForStats.filter((o) => o.status === 'Accepted').length,
      rejected: allOffersForStats.filter((o) => o.status === 'Rejected').length,
      totalCTC: allOffersForStats.reduce((sum, o) => sum + (o.annualCTC || 0), 0),
    };

    res.json({ offers, stats });
  } catch (error) {
    console.error('Error fetching offer letters:', error);
    res.status(500).json({ message: 'Failed to fetch offer letters', error: error.message });
  }
};

// @desc    Get single offer letter by ID
// @route   GET /api/offer-letters/:id
// @access  Private
exports.getOfferLetterById = async (req, res) => {
  try {
    const offer = await OfferLetter.findById(req.params.id)
      .populate('company')
      .populate('salaryStructure')
      .populate('createdBy', 'name email designation');

    if (!offer) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    // Verify company scope
    if (req.user.role !== 'Super Admin' && offer.company?._id?.toString() !== req.companyId?.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this offer letter' });
    }

    res.json(offer);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving offer letter', error: error.message });
  }
};

// @desc    Create new offer letter
// @route   POST /api/offer-letters
// @access  Private (Admin / HR)
exports.createOfferLetter = async (req, res) => {
  try {
    let companyId = req.companyId || req.user?.company?._id || req.user?.company;
    if (req.user.role === 'Super Admin' && req.body.companyId) {
      companyId = req.body.companyId;
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const {
      candidateName,
      candidateEmail,
      candidatePhone,
      candidateAddress,
      designation,
      department,
      employmentType,
      workLocation,
      joiningDate,
      expiryDate,
      probationPeriodMonths,
      salaryStructure,
      annualCTC,
      monthlyGross,
      netMonthlyTakeHome,
      salaryBreakup,
      termsAndConditions,
      customNotes,
      useLetterhead,
      includeSignAndSeal,
      status,
    } = req.body;

    if (!candidateName || !candidateEmail || !designation || !joiningDate) {
      return res.status(400).json({ message: 'Candidate name, email, designation, and joining date are required' });
    }

    const offerNumber = await generateOfferNumber(companyId);

    const defaultTerms =
      termsAndConditions && termsAndConditions.trim()
        ? termsAndConditions
        : company.letterhead?.defaultOfferTerms || getDefaultOfferTerms(company.name);

    const newOffer = await OfferLetter.create({
      company: companyId,
      offerNumber,
      candidateName: candidateName.trim(),
      candidateEmail: candidateEmail.trim().toLowerCase(),
      candidatePhone: candidatePhone || '',
      candidateAddress: candidateAddress || '',
      designation: designation.trim(),
      department: department || 'General',
      employmentType: employmentType || 'Full-Time',
      workLocation: workLocation || 'Office - Headquarters',
      joiningDate,
      expiryDate: expiryDate || null,
      probationPeriodMonths: probationPeriodMonths !== undefined ? Number(probationPeriodMonths) : 3,
      salaryStructure: salaryStructure || null,
      annualCTC: Number(annualCTC) || 0,
      monthlyGross: Number(monthlyGross) || Math.round((Number(annualCTC) || 0) / 12),
      netMonthlyTakeHome: Number(netMonthlyTakeHome) || 0,
      salaryBreakup: Array.isArray(salaryBreakup) ? salaryBreakup : [],
      termsAndConditions: defaultTerms,
      customNotes: customNotes || '',
      useLetterhead: useLetterhead !== undefined ? useLetterhead : true,
      includeSignAndSeal: includeSignAndSeal !== undefined ? includeSignAndSeal : true,
      status: status || 'Draft',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const populatedOffer = await OfferLetter.findById(newOffer._id)
      .populate('salaryStructure', 'name code employmentType')
      .populate('createdBy', 'name email designation');

    res.status(201).json({
      message: 'Offer letter created successfully',
      offer: populatedOffer,
    });
  } catch (error) {
    console.error('Error creating offer letter:', error);
    res.status(500).json({ message: 'Failed to create offer letter', error: error.message });
  }
};

// @desc    Update existing offer letter
// @route   PUT /api/offer-letters/:id
// @access  Private (Admin / HR)
exports.updateOfferLetter = async (req, res) => {
  try {
    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    if (req.user.role !== 'Super Admin' && offer.company?.toString() !== req.companyId?.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this offer letter' });
    }

    const {
      candidateName,
      candidateEmail,
      candidatePhone,
      candidateAddress,
      designation,
      department,
      employmentType,
      workLocation,
      joiningDate,
      expiryDate,
      probationPeriodMonths,
      salaryStructure,
      annualCTC,
      monthlyGross,
      netMonthlyTakeHome,
      salaryBreakup,
      termsAndConditions,
      customNotes,
      useLetterhead,
      includeSignAndSeal,
      status,
    } = req.body;

    if (candidateName !== undefined) offer.candidateName = candidateName.trim();
    if (candidateEmail !== undefined) offer.candidateEmail = candidateEmail.trim().toLowerCase();
    if (candidatePhone !== undefined) offer.candidatePhone = candidatePhone;
    if (candidateAddress !== undefined) offer.candidateAddress = candidateAddress;
    if (designation !== undefined) offer.designation = designation.trim();
    if (department !== undefined) offer.department = department;
    if (employmentType !== undefined) offer.employmentType = employmentType;
    if (workLocation !== undefined) offer.workLocation = workLocation;
    if (joiningDate !== undefined) offer.joiningDate = joiningDate;
    if (expiryDate !== undefined) offer.expiryDate = expiryDate;
    if (probationPeriodMonths !== undefined) offer.probationPeriodMonths = Number(probationPeriodMonths);
    if (salaryStructure !== undefined) offer.salaryStructure = salaryStructure || null;
    if (annualCTC !== undefined) offer.annualCTC = Number(annualCTC);
    if (monthlyGross !== undefined) offer.monthlyGross = Number(monthlyGross);
    if (netMonthlyTakeHome !== undefined) offer.netMonthlyTakeHome = Number(netMonthlyTakeHome);
    if (salaryBreakup !== undefined) offer.salaryBreakup = salaryBreakup;
    if (termsAndConditions !== undefined) offer.termsAndConditions = termsAndConditions;
    if (customNotes !== undefined) offer.customNotes = customNotes;
    if (useLetterhead !== undefined) offer.useLetterhead = useLetterhead;
    if (includeSignAndSeal !== undefined) offer.includeSignAndSeal = includeSignAndSeal;
    if (status !== undefined) {
      offer.status = status;
      if (status === 'Sent' && !offer.sentAt) offer.sentAt = new Date();
      if ((status === 'Accepted' || status === 'Rejected') && !offer.respondedAt) {
        offer.respondedAt = new Date();
      }
    }

    offer.updatedBy = req.user._id;
    await offer.save();

    const populatedOffer = await OfferLetter.findById(offer._id)
      .populate('company')
      .populate('salaryStructure', 'name code employmentType')
      .populate('createdBy', 'name email designation');

    res.json({
      message: 'Offer letter updated successfully',
      offer: populatedOffer,
    });
  } catch (error) {
    console.error('Error updating offer letter:', error);
    res.status(500).json({ message: 'Failed to update offer letter', error: error.message });
  }
};

// @desc    Quick update status (e.g. Draft -> Sent -> Accepted -> Rejected)
// @route   PATCH /api/offer-letters/:id/status
// @access  Private (Admin / HR)
exports.updateOfferLetterStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['Draft', 'Sent', 'Accepted', 'Rejected', 'Revoked'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status provided' });
    }

    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    if (req.user.role !== 'Super Admin' && offer.company?.toString() !== req.companyId?.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    offer.status = status;
    if (status === 'Sent') offer.sentAt = new Date();
    if (status === 'Accepted' || status === 'Rejected') offer.respondedAt = new Date();
    offer.updatedBy = req.user._id;

    await offer.save();

    res.json({
      message: `Offer status changed to ${status}`,
      offer,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating status', error: error.message });
  }
};

// @desc    Delete offer letter
// @route   DELETE /api/offer-letters/:id
// @access  Private (Admin / HR)
exports.deleteOfferLetter = async (req, res) => {
  try {
    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    if (req.user.role !== 'Super Admin' && offer.company?.toString() !== req.companyId?.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this offer letter' });
    }

    await OfferLetter.findByIdAndDelete(req.params.id);
    res.json({ message: 'Offer letter deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete offer letter', error: error.message });
  }
};

// @desc    Send offer letter to candidate via email (using company's SMTP)
// @route   POST /api/offer-letters/:id/send-email
// @access  Private (Admin / HR)
exports.sendOfferLetterEmail = async (req, res) => {
  try {
    const offer = await OfferLetter.findById(req.params.id)
      .populate('company')
      .populate('salaryStructure');

    if (!offer) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    if (req.user.role !== 'Super Admin' && offer.company?._id?.toString() !== req.companyId?.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const companyName = offer.company?.name || 'Our Company';
    const candidateName = offer.candidateName;
    const designation = offer.designation;
    const joiningDateStr = new Date(offer.joiningDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const ctcFormatted = (offer.annualCTC || 0).toLocaleString('en-IN');

    const subject = `Offer of Employment: ${designation} at ${companyName} (${offer.offerNumber})`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #1e1b4b; margin: 0; font-size: 22px;">${companyName}</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Official Offer of Employment • Ref: ${offer.offerNumber}</p>
        </div>

        <p>Dear <strong>${candidateName}</strong>,</p>

        <p>We are thrilled to extend this formal offer of employment for the position of <strong>${designation}</strong> in the <strong>${offer.department}</strong> department at <strong>${companyName}</strong>.</p>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h4 style="margin: 0 0 12px 0; color: #334155; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Offer Highlights</h4>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; width: 40%;">Position:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${designation}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Employment Type:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${offer.employmentType}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Annual CTC:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #16a34a; font-size: 16px;">₹${ctcFormatted}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Date of Joining:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${joiningDateStr}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Work Location:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${offer.workLocation}</td>
            </tr>
          </table>
        </div>

        <p>Your complete, signed appointment document and Annexure A salary breakdown are officially issued on company letterhead. Please review and confirm your acceptance by replying to this email or contacting our HR team.</p>

        <p style="margin-top: 24px;">Welcome aboard! We look forward to achieving great milestones together.</p>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
          <p style="margin: 0; font-weight: bold; color: #334155;">Human Resources Department</p>
          <p style="margin: 2px 0 0 0;">${companyName}</p>
          ${offer.company?.contactEmail ? `<p style="margin: 2px 0 0 0;">Email: ${offer.company.contactEmail}</p>` : ''}
        </div>
      </div>
    `;

    const emailResult = await sendEmail(
      offer.candidateEmail,
      subject,
      emailHtml,
      { companyId: offer.company?._id }
    );

    offer.status = 'Sent';
    offer.sentAt = new Date();
    offer.updatedBy = req.user._id;
    await offer.save();

    res.json({
      message: `Offer letter successfully dispatched to ${offer.candidateEmail}`,
      senderType: emailResult.senderType,
      sentAt: offer.sentAt,
    });
  } catch (error) {
    console.error('Error sending offer letter email:', error);
    res.status(500).json({ message: 'Failed to send offer letter email', error: error.message });
  }
};
