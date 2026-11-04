const crypto = require('crypto');
const IntegrationConfig = require('../models/IntegrationConfig');
const ContactEnquiry = require('../models/ContactEnquiry');
const ExternalAppointment = require('../models/ExternalAppointment');
const CareerApplication = require('../models/CareerApplication');
const Lead = require('../models/Lead');
const { logAudit } = require('../utils/auditLogger');

// Helper to get company ID safely
const getCompanyId = (req) => {
  return req.companyId || req.user?.company?._id || req.user?.company;
};

// Helper to make outbound HTTP requests to external website API
const fetchFromExternalEndpoint = async (url, config) => {
  if (!url || !url.startsWith('http')) {
    throw new Error('Invalid endpoint URL. Must start with http:// or https://');
  }

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'CompanyManagementSystem-FeedSync/1.0',
  };

  if (config.authType === 'Bearer Token' && config.authToken) {
    headers['Authorization'] = `Bearer ${config.authToken.trim()}`;
  } else if (config.authType === 'API Key Header' && config.authToken) {
    const headerName = config.apiKeyHeaderName?.trim() || 'x-api-key';
    headers[headerName] = config.authToken.trim();
  } else if (config.authType === 'Custom Header' && config.authToken) {
    const headerName = config.apiKeyHeaderName?.trim() || 'Authorization';
    headers[headerName] = config.authToken.trim();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errText.substring(0, 150)}`);
    }

    const json = await response.json();
    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out after 12 seconds.');
    }
    throw err;
  }
};

// ===================== CONFIGURATION CONTROLLERS =====================

exports.getConfig = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'Company context required.' });
    }

    let config = await IntegrationConfig.findOne({ company: companyId });
    if (!config) {
      config = await IntegrationConfig.create({
        company: companyId,
        createdBy: req.user._id,
      });
    }

    // Counts for stats
    const [enquiryCount, appointmentCount, careerCount] = await Promise.all([
      ContactEnquiry.countDocuments({ company: companyId }),
      ExternalAppointment.countDocuments({ company: companyId }),
      CareerApplication.countDocuments({ company: companyId }),
    ]);

    res.json({
      config,
      stats: {
        enquiries: enquiryCount,
        appointments: appointmentCount,
        careers: careerCount,
      },
    });
  } catch (error) {
    console.error('getConfig error:', error);
    res.status(500).json({ message: 'Failed to load configuration' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'Company context required.' });
    }

    const {
      websiteUrl,
      contactUsEndpoint,
      appointmentsEndpoint,
      careersEndpoint,
      authType,
      authToken,
      apiKeyHeaderName,
      autoSyncEnabled,
    } = req.body;

    let config = await IntegrationConfig.findOne({ company: companyId });
    if (!config) {
      config = new IntegrationConfig({ company: companyId, createdBy: req.user._id });
    }

    if (websiteUrl !== undefined) config.websiteUrl = websiteUrl.trim();
    if (contactUsEndpoint !== undefined) config.contactUsEndpoint = contactUsEndpoint.trim();
    if (appointmentsEndpoint !== undefined) config.appointmentsEndpoint = appointmentsEndpoint.trim();
    if (careersEndpoint !== undefined) config.careersEndpoint = careersEndpoint.trim();
    if (authType !== undefined) config.authType = authType;
    if (authToken !== undefined) config.authToken = authToken.trim();
    if (apiKeyHeaderName !== undefined) config.apiKeyHeaderName = apiKeyHeaderName.trim();
    if (autoSyncEnabled !== undefined) config.autoSyncEnabled = Boolean(autoSyncEnabled);
    config.updatedBy = req.user._id;

    await config.save();

    logAudit({
      user: req.user,
      action: 'UPDATE_INTEGRATION_CONFIG',
      category: 'SETTINGS',
      status: 'SUCCESS',
      details: { websiteUrl: config.websiteUrl },
      req,
    });

    res.json({ message: 'Configuration saved successfully', config });
  } catch (error) {
    console.error('updateConfig error:', error);
    res.status(500).json({ message: 'Failed to update configuration' });
  }
};

exports.regenerateInboundKey = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    let config = await IntegrationConfig.findOne({ company: companyId });
    if (!config) {
      config = new IntegrationConfig({ company: companyId, createdBy: req.user._id });
    }

    config.inboundApiKey = 'whk_' + crypto.randomBytes(16).toString('hex');
    config.updatedBy = req.user._id;
    await config.save();

    res.json({ message: 'Inbound API Key regenerated', inboundApiKey: config.inboundApiKey });
  } catch (error) {
    console.error('regenerateInboundKey error:', error);
    res.status(500).json({ message: 'Failed to regenerate API key' });
  }
};

exports.testEndpoint = async (req, res) => {
  try {
    const { url, authType, authToken, apiKeyHeaderName } = req.body;
    if (!url) {
      return res.status(400).json({ message: 'Endpoint URL is required' });
    }

    const testConfig = {
      authType: authType || 'None',
      authToken: authToken || '',
      apiKeyHeaderName: apiKeyHeaderName || 'Authorization',
    };

    const startTime = Date.now();
    const data = await fetchFromExternalEndpoint(url, testConfig);
    const latencyMs = Date.now() - startTime;

    // Validate expected structure
    const isStandardEnvelope = data && typeof data === 'object' && ('data' in data || Array.isArray(data));
    const itemsCount = Array.isArray(data) ? data.length : Array.isArray(data?.data) ? data.data.length : 0;

    res.json({
      success: true,
      latencyMs,
      itemsCount,
      isStandardEnvelope,
      sampleResponse: data,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Connection failed',
    });
  }
};

// ===================== SYNC EXECUTION CONTROLLER =====================

exports.syncExternalFeed = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { feed = 'all' } = req.body; // 'all' | 'contact-us' | 'appointments' | 'careers'

    const config = await IntegrationConfig.findOne({ company: companyId });
    if (!config) {
      return res.status(400).json({ message: 'Please configure your API endpoints first.' });
    }

    const results = {
      contactUs: { attempted: false, count: 0, status: 'skipped', error: null },
      appointments: { attempted: false, count: 0, status: 'skipped', error: null },
      careers: { attempted: false, count: 0, status: 'skipped', error: null },
    };

    const now = new Date();

    // 1. Sync Contact Us
    if ((feed === 'all' || feed === 'contact-us') && config.contactUsEndpoint) {
      results.contactUs.attempted = true;
      try {
        const fullUrl = config.contactUsEndpoint.startsWith('http')
          ? config.contactUsEndpoint
          : `${config.websiteUrl?.replace(/\/$/, '')}/${config.contactUsEndpoint.replace(/^\//, '')}`;

        const responseData = await fetchFromExternalEndpoint(fullUrl, config);
        const items = Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.data)
          ? responseData.data
          : [];

        let savedCount = 0;
        for (const item of items) {
          if (!item.name && !item.email && !item.mobile) continue;

          const extId = String(item.id || item.external_id || '').trim();
          const filter = extId
            ? { company: companyId, externalId: extId }
            : { company: companyId, email: item.email?.trim().toLowerCase(), name: item.name?.trim() };

          await ContactEnquiry.findOneAndUpdate(
            filter,
            {
              company: companyId,
              externalId: extId || undefined,
              name: item.name?.trim() || 'Anonymous User',
              email: item.email?.trim() || '',
              mobile: item.mobile?.trim() || '',
              subject: item.subject?.trim() || 'Website Enquiry',
              message: item.message?.trim() || '',
              status: ['pending', 'contacted', 'in_progress', 'resolved', 'spam'].includes(item.status)
                ? item.status
                : 'pending',
              source: 'Website API Sync',
              externalCreatedAt: item.created_at || item.createdAt || now.toISOString(),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          savedCount++;
        }

        results.contactUs.count = savedCount;
        results.contactUs.status = 'success';
        config.lastSync.contactUs = {
          lastAttemptAt: now,
          lastSuccessAt: now,
          status: 'success',
          count: savedCount,
          message: `Synced ${savedCount} contact enquiries successfully`,
        };
      } catch (err) {
        results.contactUs.status = 'failed';
        results.contactUs.error = err.message;
        config.lastSync.contactUs = {
          lastAttemptAt: now,
          status: 'failed',
          count: 0,
          message: err.message,
        };
      }
    }

    // 2. Sync Appointments
    if ((feed === 'all' || feed === 'appointments') && config.appointmentsEndpoint) {
      results.appointments.attempted = true;
      try {
        const fullUrl = config.appointmentsEndpoint.startsWith('http')
          ? config.appointmentsEndpoint
          : `${config.websiteUrl?.replace(/\/$/, '')}/${config.appointmentsEndpoint.replace(/^\//, '')}`;

        const responseData = await fetchFromExternalEndpoint(fullUrl, config);
        const items = Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.data)
          ? responseData.data
          : [];

        let savedCount = 0;
        for (const item of items) {
          if (!item.name && !item.email && !item.mobile) continue;

          const aptId = item.appointment_id || item.appointmentId || '';
          const extId = String(item.id || item.external_id || '').trim();

          const filter = aptId
            ? { company: companyId, appointmentId: aptId }
            : extId
            ? { company: companyId, externalId: extId }
            : { company: companyId, email: item.email?.trim().toLowerCase(), appointmentDate: item.appointment_date };

          await ExternalAppointment.findOneAndUpdate(
            filter,
            {
              company: companyId,
              externalId: extId || undefined,
              appointmentId: aptId || undefined,
              name: item.name?.trim() || 'Guest Client',
              email: item.email?.trim() || '',
              mobile: item.mobile?.trim() || '',
              service: item.service?.trim() || 'General Consultation',
              appointmentDate: item.appointment_date || item.appointmentDate || '',
              appointmentTime: item.appointment_time || item.appointmentTime || '',
              status: ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'].includes(item.status)
                ? item.status
                : 'pending',
              source: 'Website API Sync',
              externalCreatedAt: item.created_at || item.createdAt || now.toISOString(),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          savedCount++;
        }

        results.appointments.count = savedCount;
        results.appointments.status = 'success';
        config.lastSync.appointments = {
          lastAttemptAt: now,
          lastSuccessAt: now,
          status: 'success',
          count: savedCount,
          message: `Synced ${savedCount} appointments successfully`,
        };
      } catch (err) {
        results.appointments.status = 'failed';
        results.appointments.error = err.message;
        config.lastSync.appointments = {
          lastAttemptAt: now,
          status: 'failed',
          count: 0,
          message: err.message,
        };
      }
    }

    // 3. Sync Career Applications
    if ((feed === 'all' || feed === 'careers') && config.careersEndpoint) {
      results.careers.attempted = true;
      try {
        const fullUrl = config.careersEndpoint.startsWith('http')
          ? config.careersEndpoint
          : `${config.websiteUrl?.replace(/\/$/, '')}/${config.careersEndpoint.replace(/^\//, '')}`;

        const responseData = await fetchFromExternalEndpoint(fullUrl, config);
        const items = Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.data)
          ? responseData.data
          : [];

        let savedCount = 0;
        for (const item of items) {
          if (!item.name && !item.email && !item.mobile) continue;

          const appId = item.application_id || item.applicationId || '';
          const extId = String(item.id || item.external_id || '').trim();

          const filter = appId
            ? { company: companyId, applicationId: appId }
            : extId
            ? { company: companyId, externalId: extId }
            : { company: companyId, email: item.email?.trim().toLowerCase(), position: item.position };

          await CareerApplication.findOneAndUpdate(
            filter,
            {
              company: companyId,
              externalId: extId || undefined,
              applicationId: appId || undefined,
              name: item.name?.trim() || 'Job Applicant',
              email: item.email?.trim() || '',
              mobile: item.mobile?.trim() || '',
              position: item.position?.trim() || 'General Position',
              experience: item.experience || '',
              currentLocation: item.current_location || item.currentLocation || '',
              currentCtc: item.current_ctc || item.currentCtc || '',
              expectedCtc: item.expected_ctc || item.expectedCtc || '',
              noticePeriod: item.notice_period || item.noticePeriod || '',
              resumeUrl: item.resume_url || item.resumeUrl || '',
              status: ['received', 'under_review', 'shortlisted', 'interview_scheduled', 'rejected', 'hired'].includes(item.status)
                ? item.status
                : 'received',
              source: 'Website API Sync',
              externalCreatedAt: item.created_at || item.createdAt || now.toISOString(),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          savedCount++;
        }

        results.careers.count = savedCount;
        results.careers.status = 'success';
        config.lastSync.careers = {
          lastAttemptAt: now,
          lastSuccessAt: now,
          status: 'success',
          count: savedCount,
          message: `Synced ${savedCount} career applications successfully`,
        };
      } catch (err) {
        results.careers.status = 'failed';
        results.careers.error = err.message;
        config.lastSync.careers = {
          lastAttemptAt: now,
          status: 'failed',
          count: 0,
          message: err.message,
        };
      }
    }

    await config.save();

    res.json({
      message: 'Sync process completed',
      results,
      config,
    });
  } catch (error) {
    console.error('syncExternalFeed error:', error);
    res.status(500).json({ message: 'Sync failed: ' + error.message });
  }
};

// ===================== CONTACT ENQUIRIES CRUD =====================

exports.getContactEnquiries = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { status, search, page = 1, limit = 25 } = req.query;

    const query = { company: companyId };
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [enquiries, total] = await Promise.all([
      ContactEnquiry.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      ContactEnquiry.countDocuments(query),
    ]);

    // Status counts
    const statusCounts = await ContactEnquiry.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({
      enquiries,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('getContactEnquiries error:', error);
    res.status(500).json({ message: 'Failed to fetch contact enquiries' });
  }
};

exports.updateContactEnquiry = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { status, internalNotes } = req.body;

    const enquiry = await ContactEnquiry.findOne({ _id: id, company: companyId });
    if (!enquiry) {
      return res.status(404).json({ message: 'Enquiry not found' });
    }

    if (status) enquiry.status = status;
    if (internalNotes !== undefined) enquiry.internalNotes = internalNotes;
    await enquiry.save();

    res.json({ message: 'Enquiry updated successfully', enquiry });
  } catch (error) {
    console.error('updateContactEnquiry error:', error);
    res.status(500).json({ message: 'Failed to update enquiry' });
  }
};

exports.convertEnquiryToLead = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const enquiry = await ContactEnquiry.findOne({ _id: id, company: companyId });
    if (!enquiry) {
      return res.status(404).json({ message: 'Enquiry not found' });
    }

    // Check if Lead model exists and create Lead
    const lead = await Lead.create({
      company: companyId,
      name: enquiry.name,
      email: enquiry.email,
      phone: enquiry.mobile,
      source: 'Website Contact Form',
      status: 'New',
      notes: `Subject: ${enquiry.subject}\nMessage: ${enquiry.message}`,
      createdBy: req.user._id,
    });

    enquiry.convertedToLeadId = lead._id;
    enquiry.status = 'in_progress';
    await enquiry.save();

    res.json({ message: 'Converted to CRM Lead successfully', lead, enquiry });
  } catch (error) {
    console.error('convertEnquiryToLead error:', error);
    res.status(500).json({ message: 'Failed to convert enquiry to lead' });
  }
};

exports.deleteContactEnquiry = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    await ContactEnquiry.findOneAndDelete({ _id: id, company: companyId });
    res.json({ message: 'Enquiry deleted' });
  } catch (error) {
    console.error('deleteContactEnquiry error:', error);
    res.status(500).json({ message: 'Failed to delete enquiry' });
  }
};

// ===================== APPOINTMENTS CRUD =====================

exports.getAppointments = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { status, search, date, page = 1, limit = 25 } = req.query;

    const query = { company: companyId };
    if (status && status !== 'all') {
      query.status = status;
    }
    if (date) {
      query.appointmentDate = date;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { service: { $regex: search, $options: 'i' } },
        { appointmentId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [appointments, total] = await Promise.all([
      ExternalAppointment.find(query).sort({ appointmentDate: -1, createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      ExternalAppointment.countDocuments(query),
    ]);

    const statusCounts = await ExternalAppointment.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({
      appointments,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('getAppointments error:', error);
    res.status(500).json({ message: 'Failed to fetch appointments' });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { status, internalNotes, appointmentDate, appointmentTime } = req.body;

    const apt = await ExternalAppointment.findOne({ _id: id, company: companyId });
    if (!apt) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (status) apt.status = status;
    if (internalNotes !== undefined) apt.internalNotes = internalNotes;
    if (appointmentDate) apt.appointmentDate = appointmentDate;
    if (appointmentTime) apt.appointmentTime = appointmentTime;
    await apt.save();

    res.json({ message: 'Appointment updated successfully', appointment: apt });
  } catch (error) {
    console.error('updateAppointment error:', error);
    res.status(500).json({ message: 'Failed to update appointment' });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    await ExternalAppointment.findOneAndDelete({ _id: id, company: companyId });
    res.json({ message: 'Appointment deleted' });
  } catch (error) {
    console.error('deleteAppointment error:', error);
    res.status(500).json({ message: 'Failed to delete appointment' });
  }
};

// ===================== CAREER APPLICATIONS CRUD =====================

exports.getCareerApplications = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { status, position, search, page = 1, limit = 25 } = req.query;

    const query = { company: companyId };
    if (status && status !== 'all') {
      query.status = status;
    }
    if (position && position !== 'all') {
      query.position = position;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } },
        { currentLocation: { $regex: search, $options: 'i' } },
        { applicationId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [applications, total, positions] = await Promise.all([
      CareerApplication.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      CareerApplication.countDocuments(query),
      CareerApplication.distinct('position', { company: companyId }),
    ]);

    const statusCounts = await CareerApplication.aggregate([
      { $match: { company: companyId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({
      applications,
      total,
      positions,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('getCareerApplications error:', error);
    res.status(500).json({ message: 'Failed to fetch career applications' });
  }
};

exports.updateCareerApplication = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { status, internalNotes } = req.body;

    const app = await CareerApplication.findOne({ _id: id, company: companyId });
    if (!app) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (status) app.status = status;
    if (internalNotes !== undefined) app.internalNotes = internalNotes;
    await app.save();

    res.json({ message: 'Application updated successfully', application: app });
  } catch (error) {
    console.error('updateCareerApplication error:', error);
    res.status(500).json({ message: 'Failed to update application' });
  }
};

exports.deleteCareerApplication = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    await CareerApplication.findOneAndDelete({ _id: id, company: companyId });
    res.json({ message: 'Application deleted' });
  } catch (error) {
    console.error('deleteCareerApplication error:', error);
    res.status(500).json({ message: 'Failed to delete application' });
  }
};

// ===================== INBOUND WEBHOOK CONTROLLER =====================
// Allows external official website to directly push (POST) form submissions to this system
exports.inboundWebhook = async (req, res) => {
  try {
    const { feedType } = req.params; // 'contact-us' | 'appointments' | 'careers'
    const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.query.key;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'Missing Inbound API Key in x-api-key header or ?apiKey= query parameter.',
      });
    }

    const config = await IntegrationConfig.findOne({ inboundApiKey: apiKey });
    if (!config) {
      return res.status(403).json({
        success: false,
        message: 'Invalid API Key.',
      });
    }

    const companyId = config.company;
    const body = req.body;
    const items = Array.isArray(body)
      ? body
      : Array.isArray(body?.data)
      ? body.data
      : [body];

    const now = new Date();
    let processed = 0;

    if (feedType === 'contact-us') {
      for (const item of items) {
        if (!item.name && !item.email && !item.mobile) continue;
        await ContactEnquiry.create({
          company: companyId,
          externalId: item.id ? String(item.id) : undefined,
          name: item.name || 'Anonymous User',
          email: item.email || '',
          mobile: item.mobile || '',
          subject: item.subject || 'Website Enquiry',
          message: item.message || '',
          status: item.status || 'pending',
          source: 'Website Webhook Push',
          externalCreatedAt: item.created_at || now.toISOString(),
        });
        processed++;
      }
    } else if (feedType === 'appointments') {
      for (const item of items) {
        if (!item.name && !item.email && !item.mobile) continue;
        await ExternalAppointment.create({
          company: companyId,
          externalId: item.id ? String(item.id) : undefined,
          appointmentId: item.appointment_id || undefined,
          name: item.name || 'Guest Client',
          email: item.email || '',
          mobile: item.mobile || '',
          service: item.service || 'General Consultation',
          appointmentDate: item.appointment_date || '',
          appointmentTime: item.appointment_time || '',
          status: item.status || 'pending',
          source: 'Website Webhook Push',
          externalCreatedAt: item.created_at || now.toISOString(),
        });
        processed++;
      }
    } else if (feedType === 'careers' || feedType === 'career-applications') {
      for (const item of items) {
        if (!item.name && !item.email && !item.mobile) continue;
        await CareerApplication.create({
          company: companyId,
          externalId: item.id ? String(item.id) : undefined,
          applicationId: item.application_id || undefined,
          name: item.name || 'Job Applicant',
          email: item.email || '',
          mobile: item.mobile || '',
          position: item.position || 'General Position',
          experience: item.experience || '',
          currentLocation: item.current_location || '',
          currentCtc: item.current_ctc || '',
          expectedCtc: item.expected_ctc || '',
          noticePeriod: item.notice_period || '',
          resumeUrl: item.resume_url || '',
          status: item.status || 'received',
          source: 'Website Webhook Push',
          externalCreatedAt: item.created_at || now.toISOString(),
        });
        processed++;
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unknown feedType. Supported: contact-us, appointments, careers',
      });
    }

    res.status(201).json({
      success: true,
      message: `Successfully received and recorded ${processed} item(s).`,
      feedType,
      processed,
    });
  } catch (error) {
    console.error('inboundWebhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook: ' + error.message,
    });
  }
};

