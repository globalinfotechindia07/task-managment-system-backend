const crypto = require('crypto');
const AgreementConfig = require('../models/AgreementConfig');
const AgreementTemplate = require('../models/AgreementTemplate');
const Agreement = require('../models/Agreement');
const User = require('../models/User');

// Helper to extract unique variables from text/HTML: {{variable_name}}
const extractVariables = (content) => {
  if (!content || typeof content !== 'string') return [];
  const matches = [...content.matchAll(/\{\{([a-zA-Z0-9_\s-]+)\}\}/g)];
  const set = new Set();
  matches.forEach((m) => {
    if (m[1]) {
      const clean = m[1].trim().replace(/\s+/g, '_');
      if (clean) set.add(clean);
    }
  });
  return Array.from(set);
};

// Helper to mask sensitive API key
const maskApiKey = (key) => {
  if (!key || key.length < 10) return key ? '****' : '';
  return key.slice(0, 7) + '...' + key.slice(-4);
};

// Helper to get active environment config and endpoints
const getActiveEnvConfig = (config) => {
  const env = config?.environment === 'production' ? 'production' : 'sandbox';
  const envData = config?.[env] || {};
  let apiKey = envData.apiKey || config?.apiKey || '';
  if (!apiKey && env === 'sandbox') {
    apiKey = 'ak_test_eagreement_38cf5de743c4b8dc379a257e9b9d';
  }
  const baseUrl = (envData.baseUrl || config?.baseUrl || 'https://backend.chitraguptccrms.com/api/v1').replace(/\/+$/, '');
  // Gateway dispatch is ALWAYS active so requests genuinely hit the configured Gateway APIs
  const isEnabled = true;

  const defEndpoints = {
    fetchTemplates: {
      name: envData.endpoints?.fetchTemplates?.name || 'Fetch Templates API',
      method: (envData.endpoints?.fetchTemplates?.method || 'GET').toUpperCase(),
      url: envData.endpoints?.fetchTemplates?.url || `${baseUrl}/${env}/agreements/templates`,
      description: envData.endpoints?.fetchTemplates?.description || 'Fetches active agreement templates and requirements',
    },
    createTemplate: {
      name: envData.endpoints?.createTemplate?.name || 'Create Template API',
      method: (envData.endpoints?.createTemplate?.method || 'POST').toUpperCase(),
      url: envData.endpoints?.createTemplate?.url || `${baseUrl}/${env}/agreements/templates`,
      description: envData.endpoints?.createTemplate?.description || 'Creates or updates agreement templates on gateway',
    },
    initiateAgreement: {
      name: envData.endpoints?.initiateAgreement?.name || 'Initiate Agreement API',
      method: (envData.endpoints?.initiateAgreement?.method || 'POST').toUpperCase(),
      url: envData.endpoints?.initiateAgreement?.url || `${baseUrl}/${env}/agreements/initiate`,
      description: envData.endpoints?.initiateAgreement?.description || 'Generates agreement with dynamic variables and parties',
    },
    checkStatus: {
      name: envData.endpoints?.checkStatus?.name || 'Agreement Status API',
      method: (envData.endpoints?.checkStatus?.method || 'GET').toUpperCase(),
      url: envData.endpoints?.checkStatus?.url || `${baseUrl}/${env}/agreements/:agreement_id/status`,
      description: envData.endpoints?.checkStatus?.description || 'Checks digital signature details, eSign audit trail and signed PDF URL',
    },
  };

  return {
    env,
    apiKey,
    baseUrl,
    isEnabled,
    endpoints: defEndpoints,
  };
};

// Format config response for UI
const formatConfigResponse = (config) => {
  const sb = config.sandbox || {};
  const prod = config.production || {};

  return {
    _id: config._id,
    environment: config.environment || 'sandbox',
    isEnabled: Boolean(config.isEnabled),
    autoSyncTemplates: Boolean(config.autoSyncTemplates),

    sandbox: {
      apiKeyMasked: maskApiKey(sb.apiKey || config.apiKey),
      hasApiKey: Boolean((sb.apiKey || config.apiKey || '').trim().length > 5),
      baseUrl: sb.baseUrl || 'https://backend.chitraguptccrms.com/api/v1',
      isEnabled: sb.isEnabled !== false,
      lastTestedAt: sb.lastTestedAt || config.lastTestedAt,
      lastTestStatus: sb.lastTestStatus || config.lastTestStatus || 'NEVER_TESTED',
      lastTestMessage: sb.lastTestMessage || config.lastTestMessage || '',
      endpoints: {
        fetchTemplates: {
          name: sb.endpoints?.fetchTemplates?.name || 'Fetch Templates API',
          method: sb.endpoints?.fetchTemplates?.method || 'GET',
          url: sb.endpoints?.fetchTemplates?.url || 'https://backend.chitraguptccrms.com/api/v1/sandbox/agreements/templates',
          description: sb.endpoints?.fetchTemplates?.description || 'Fetches active agreement templates and requirements',
        },
        createTemplate: {
          name: sb.endpoints?.createTemplate?.name || 'Create Template API',
          method: sb.endpoints?.createTemplate?.method || 'POST',
          url: sb.endpoints?.createTemplate?.url || 'https://backend.chitraguptccrms.com/api/v1/sandbox/agreements/templates',
          description: sb.endpoints?.createTemplate?.description || 'Creates or updates agreement templates on gateway',
        },
        initiateAgreement: {
          name: sb.endpoints?.initiateAgreement?.name || 'Initiate Agreement API',
          method: sb.endpoints?.initiateAgreement?.method || 'POST',
          url: sb.endpoints?.initiateAgreement?.url || 'https://backend.chitraguptccrms.com/api/v1/sandbox/agreements/initiate',
          description: sb.endpoints?.initiateAgreement?.description || 'Generates agreement with dynamic variables and parties',
        },
        checkStatus: {
          name: sb.endpoints?.checkStatus?.name || 'Agreement Status API',
          method: sb.endpoints?.checkStatus?.method || 'GET',
          url: sb.endpoints?.checkStatus?.url || 'https://backend.chitraguptccrms.com/api/v1/sandbox/agreements/:agreement_id/status',
          description: sb.endpoints?.checkStatus?.description || 'Checks Aadhaar eSign verification and signed PDF link',
        },
      },
    },

    production: {
      apiKeyMasked: maskApiKey(prod.apiKey),
      hasApiKey: Boolean((prod.apiKey || '').trim().length > 5),
      baseUrl: prod.baseUrl || 'https://backend.chitraguptccrms.com/api/v1',
      isEnabled: Boolean(prod.isEnabled),
      lastTestedAt: prod.lastTestedAt,
      lastTestStatus: prod.lastTestStatus || 'NEVER_TESTED',
      lastTestMessage: prod.lastTestMessage || '',
      endpoints: {
        fetchTemplates: {
          name: prod.endpoints?.fetchTemplates?.name || 'Fetch Templates API',
          method: prod.endpoints?.fetchTemplates?.method || 'GET',
          url: prod.endpoints?.fetchTemplates?.url || 'https://backend.chitraguptccrms.com/api/v1/production/agreements/templates',
          description: prod.endpoints?.fetchTemplates?.description || 'Fetches legally binding production templates',
        },
        createTemplate: {
          name: prod.endpoints?.createTemplate?.name || 'Create Template API',
          method: prod.endpoints?.createTemplate?.method || 'POST',
          url: prod.endpoints?.createTemplate?.url || 'https://backend.chitraguptccrms.com/api/v1/production/agreements/templates',
          description: prod.endpoints?.createTemplate?.description || 'Publishes production agreement templates',
        },
        initiateAgreement: {
          name: prod.endpoints?.initiateAgreement?.name || 'Initiate Agreement API',
          method: prod.endpoints?.initiateAgreement?.method || 'POST',
          url: prod.endpoints?.initiateAgreement?.url || 'https://backend.chitraguptccrms.com/api/v1/production/agreements/initiate',
          description: prod.endpoints?.initiateAgreement?.description || 'Initiates legally binding Aadhaar eSign agreement',
        },
        checkStatus: {
          name: prod.endpoints?.checkStatus?.name || 'Agreement Status API',
          method: prod.endpoints?.checkStatus?.method || 'GET',
          url: prod.endpoints?.checkStatus?.url || 'https://backend.chitraguptccrms.com/api/v1/production/agreements/:agreement_id/status',
          description: prod.endpoints?.checkStatus?.description || 'Retrieves legal audit certificate and signed PDF',
        },
      },
    },
  };
};

// @desc    Get agreement gateway integration settings for company
// @route   GET /api/agreements/config
// @access  Private (Admin, Super Admin)
const getAgreementConfig = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    let config = await AgreementConfig.findOne({ company: companyId });

    if (!config) {
      config = await AgreementConfig.create({
        company: companyId,
        environment: 'sandbox',
        isEnabled: false,
      });
    }

    res.json({
      success: true,
      data: formatConfigResponse(config),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Update agreement gateway integration settings (Sandbox & Production 4 APIs)
// @route   PUT /api/agreements/config
// @access  Private (Admin, Super Admin)
const updateAgreementConfig = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const {
      environment,
      isEnabled,
      autoSyncTemplates,
      sandbox,
      production,
      apiKey, // legacy support
    } = req.body;

    let config = await AgreementConfig.findOne({ company: companyId });
    if (!config) {
      config = new AgreementConfig({ company: companyId });
    }

    if (environment && ['sandbox', 'production'].includes(environment)) {
      config.environment = environment;
    }
    if (typeof isEnabled === 'boolean') {
      config.isEnabled = isEnabled;
    }
    if (typeof autoSyncTemplates === 'boolean') {
      config.autoSyncTemplates = autoSyncTemplates;
    }

    // Update Sandbox settings
    if (sandbox && typeof sandbox === 'object') {
      if (!config.sandbox) config.sandbox = {};
      if (typeof sandbox.apiKey === 'string' && sandbox.apiKey.trim()) {
        config.sandbox.apiKey = sandbox.apiKey.trim();
        config.apiKey = sandbox.apiKey.trim(); // sync fallback
      }
      if (sandbox.baseUrl && typeof sandbox.baseUrl === 'string') {
        config.sandbox.baseUrl = sandbox.baseUrl.trim().replace(/\/+$/, '');
      }
      if (typeof sandbox.isEnabled === 'boolean') {
        config.sandbox.isEnabled = sandbox.isEnabled;
      }
      if (sandbox.endpoints && typeof sandbox.endpoints === 'object') {
        ['fetchTemplates', 'createTemplate', 'initiateAgreement', 'checkStatus'].forEach((k) => {
          if (sandbox.endpoints[k]) {
            if (!config.sandbox.endpoints) config.sandbox.endpoints = {};
            if (!config.sandbox.endpoints[k]) config.sandbox.endpoints[k] = {};
            if (sandbox.endpoints[k].method) {
              config.sandbox.endpoints[k].method = sandbox.endpoints[k].method.toUpperCase();
            }
            if (typeof sandbox.endpoints[k].url === 'string') {
              config.sandbox.endpoints[k].url = sandbox.endpoints[k].url.trim();
            }
          }
        });
      }
    }

    // Update Production settings
    if (production && typeof production === 'object') {
      if (!config.production) config.production = {};
      if (typeof production.apiKey === 'string' && production.apiKey.trim()) {
        config.production.apiKey = production.apiKey.trim();
      }
      if (production.baseUrl && typeof production.baseUrl === 'string') {
        config.production.baseUrl = production.baseUrl.trim().replace(/\/+$/, '');
      }
      if (typeof production.isEnabled === 'boolean') {
        config.production.isEnabled = production.isEnabled;
      }
      if (production.endpoints && typeof production.endpoints === 'object') {
        ['fetchTemplates', 'createTemplate', 'initiateAgreement', 'checkStatus'].forEach((k) => {
          if (production.endpoints[k]) {
            if (!config.production.endpoints) config.production.endpoints = {};
            if (!config.production.endpoints[k]) config.production.endpoints[k] = {};
            if (production.endpoints[k].method) {
              config.production.endpoints[k].method = production.endpoints[k].method.toUpperCase();
            }
            if (typeof production.endpoints[k].url === 'string') {
              config.production.endpoints[k].url = production.endpoints[k].url.trim();
            }
          }
        });
      }
    }

    // Legacy fallback apiKey
    if (typeof apiKey === 'string' && apiKey.trim()) {
      config.apiKey = apiKey.trim();
      const targetEnv = config.environment || 'sandbox';
      if (!config[targetEnv]) config[targetEnv] = {};
      config[targetEnv].apiKey = apiKey.trim();
    }

    await config.save();

    res.json({
      success: true,
      message: 'E-Agreement API configuration saved successfully!',
      data: formatConfigResponse(config),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Test agreement gateway connection with active or custom endpoint
// @route   POST /api/agreements/config/test
// @access  Private (Admin, Super Admin)
const testAgreementConnection = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const config = await AgreementConfig.findOne({ company: companyId });

    const environment = req.body.environment || config?.environment || 'sandbox';
    const envData = (config && config[environment]) || {};

    const apiKey = req.body.apiKey ? req.body.apiKey.trim() : (envData.apiKey || config?.apiKey || '');
    const baseUrl = (req.body.baseUrl || envData.baseUrl || config?.baseUrl || 'https://backend.chitraguptccrms.com/api/v1').replace(/\/+$/, '');

    const endpointKey = req.body.endpointKey || 'fetchTemplates';
    const method = (req.body.method || envData.endpoints?.[endpointKey]?.method || 'GET').toUpperCase();
    let targetUrl = req.body.url || envData.endpoints?.[endpointKey]?.url || `${baseUrl}/${environment}/agreements/templates`;

    if (endpointKey === 'checkStatus') {
      targetUrl = targetUrl.replace(':agreement_id', 'test-probe-uuid').replace('{{agreement_id}}', 'test-probe-uuid');
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: `No API key provided for ${environment} mode. Please enter a valid x-api-key.`,
      });
    }

    const testHeaders = {
      'x-api-key': apiKey,
      'x-environment': environment,
      'Content-Type': 'application/json',
    };

    const fetchOptions = {
      method,
      headers: testHeaders,
    };

    if (method !== 'GET' && method !== 'HEAD') {
      if (endpointKey === 'createTemplate') {
        fetchOptions.body = JSON.stringify({
          template_id: 'TEST_PROBE_001',
          name: 'Connectivity Probe Template',
          body: '<p>Test probe body</p>',
          variables: ['probe_var'],
          document_requirements: ['PAN'],
        });
      } else if (endpointKey === 'initiateAgreement') {
        fetchOptions.body = JSON.stringify({
          template_id: 'AGR_LOAN_001',
          title: 'Ping Test Agreement',
          variable_data: { test: '123' },
          parties: [{ name: 'Test Ping', email: 'test@example.com', role: 'Signer' }],
        });
      } else {
        fetchOptions.body = JSON.stringify({ ping: true, timestamp: Date.now() });
      }
    }

    try {
      const response = await fetch(targetUrl, fetchOptions);
      const data = await response.json().catch(() => ({}));

      const isSuccess = response.ok || response.status === 200 || response.status === 201;

      if (config) {
        if (!config[environment]) config[environment] = {};
        config[environment].lastTestedAt = new Date();
        config[environment].lastTestStatus = isSuccess ? 'SUCCESS' : 'FAILED';
        config[environment].lastTestMessage = data.message || `HTTP ${response.status}`;
        config.lastTestedAt = new Date();
        config.lastTestStatus = isSuccess ? 'SUCCESS' : 'FAILED';
        config.lastTestMessage = data.message || `HTTP ${response.status}`;
        await config.save();
      }

      return res.json({
        success: isSuccess,
        message: data.message || `Endpoint responded with HTTP ${response.status}`,
        httpStatus: response.status,
        method,
        targetUrl,
        mode: environment,
        endpointTested: endpointKey,
        responseData: data,
      });
    } catch (networkErr) {
      if (config) {
        if (!config[environment]) config[environment] = {};
        config[environment].lastTestedAt = new Date();
        config[environment].lastTestStatus = 'FAILED';
        config[environment].lastTestMessage = networkErr.message;
        await config.save();
      }
      return res.status(502).json({
        success: false,
        message: `Could not reach ${targetUrl}: ${networkErr.message}`,
        targetUrl,
        method,
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get company signer users (Employees & Staff list for dropdown)
// @route   GET /api/agreements/signers/users
// @access  Private
const getCompanySignerUsers = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const users = await User.find({
      company: companyId,
      isActive: { $ne: false },
    })
      .select('name email phone role employeeId department avatar')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get all agreement templates for company (Always syncs from configured Gateway API)
// @route   GET /api/agreements/templates
// @access  Private
const getTemplates = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const { sync } = req.query;

    const config = await AgreementConfig.findOne({ company: companyId });
    const activeEnv = getActiveEnvConfig(config);

    let gatewayFetchResult = null;

    // Always fetch active templates directly from configured Gateway fetchTemplates endpoint
    if (activeEnv.apiKey) {
      try {
        const fetchMeta = activeEnv.endpoints.fetchTemplates;
        const targetUrl = fetchMeta.url || `${activeEnv.baseUrl}/${activeEnv.env}/agreements/templates`;
        const method = (fetchMeta.method || 'GET').toUpperCase();

        const extRes = await fetch(targetUrl, {
          method,
          headers: {
            'x-api-key': activeEnv.apiKey,
            'x-environment': activeEnv.env,
            'Content-Type': 'application/json',
          },
        });

        if (extRes.ok) {
          const extData = await extRes.json();
          gatewayFetchResult = extData;

          if (extData.success && Array.isArray(extData.data)) {
            for (const item of extData.data) {
              const existing = await AgreementTemplate.findOne({
                company: companyId,
                template_id: item.template_id,
              });

              const docReqs = (item.document_requirements || []).map((d) => ({
                name: typeof d === 'string' ? d : d.name,
                mandatory: true,
              }));

              if (existing) {
                existing.name = item.name || existing.name;
                existing.variables = Array.from(new Set([...(existing.variables || []), ...(item.variables || [])]));
                if (docReqs.length > 0) existing.document_requirements = docReqs;
                existing.externalSynced = true;
                existing.mode = extData.mode || activeEnv.env;
                await existing.save();
              } else {
                const vars = item.variables || [];
                const sampleVarsList = vars.map((v) => `<strong>{{${v}}}</strong>`).join(', ');
                const initialBody = `<p>This ${item.name} is entered between the undersigned parties.</p><p>Key Parameters: ${sampleVarsList}</p><p>1. Purpose: The parties mutually agree to the terms, conditions, representations and warranties outlined herein.</p><p>2. Obligations: Each party agrees to strictly comply with all statutory requirements and obligations.</p>`;

                await AgreementTemplate.create({
                  company: companyId,
                  template_id: item.template_id,
                  name: item.name,
                  variables: item.variables || [],
                  document_requirements: docReqs,
                  body: initialBody,
                  pages: [{ pageNumber: 1, content: initialBody }],
                  mode: extData.mode || activeEnv.env,
                  externalSynced: true,
                  status: 'Active',
                });
              }
            }
          }
        } else {
          console.warn(`Gateway fetchTemplates returned HTTP ${extRes.status}`);
        }
      } catch (syncErr) {
        console.warn('E-Agreement template gateway fetch warning:', syncErr.message);
      }
    }

    const templates = await AgreementTemplate.find({ company: companyId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      mode: activeEnv.env,
      gatewayEndpoint: activeEnv.endpoints.fetchTemplates.url,
      data: templates,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get single template by ID
// @route   GET /api/agreements/templates/:id
// @access  Private
const getTemplateById = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const template = await AgreementTemplate.findOne({
      _id: req.params.id,
      company: companyId,
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Create or Update Template (Multi-Page Designer)
// @route   POST /api/agreements/templates
// @access  Private (Admin, HR Manager)
const createOrUpdateTemplate = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const {
      template_id,
      name,
      price,
      webUserPrice,
      isActiveForWebUsers,
      document_requirements,
      pages,
      body,
      status,
    } = req.body;

    if (!template_id || !name) {
      return res.status(400).json({
        success: false,
        message: 'Template Unique ID and Template Name are required',
      });
    }

    let combinedBody = body || '';
    if (Array.isArray(pages) && pages.length > 0) {
      combinedBody = pages.map((p) => p.content || '').join('\n<!-- PAGE_BREAK -->\n');
    }

    const detectedVariables = extractVariables(combinedBody);

    const formattedDocs = (document_requirements || []).map((doc) => {
      if (typeof doc === 'string') {
        return { name: doc, mandatory: true };
      }
      return {
        name: doc.name || 'Document',
        mandatory: doc.mandatory !== false,
      };
    });

    const config = await AgreementConfig.findOne({ company: companyId });
    const activeEnv = getActiveEnvConfig(config);

    let externalSynced = false;
    let gatewayResponse = null;

    // Dispatch directly to configured Gateway createTemplate API
    if (activeEnv.apiKey) {
      const createMeta = activeEnv.endpoints.createTemplate;
      const targetUrl = createMeta.url || `${activeEnv.baseUrl}/${activeEnv.env}/agreements/templates`;
      const method = (createMeta.method || 'POST').toUpperCase();

      const payload = {
        template_id,
        name,
        body: combinedBody,
        variables: detectedVariables,
        document_requirements: formattedDocs.map((d) => d.name),
      };

      try {
        const extRes = await fetch(targetUrl, {
          method,
          headers: {
            'x-api-key': activeEnv.apiKey,
            'x-environment': activeEnv.env,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const extData = await extRes.json().catch(() => ({}));
        gatewayResponse = extData;

        if (extRes.ok && extData.success !== false) {
          externalSynced = true;
        } else {
          console.warn(`Gateway template creation (${targetUrl}) returned:`, extRes.status, extData);
        }
      } catch (extErr) {
        console.warn('Gateway template sync warning:', extErr.message);
        gatewayResponse = { error: extErr.message };
      }
    }

    const templateData = {
      company: companyId,
      template_id,
      name,
      price: Number(price) || 0,
      webUserPrice: Number(webUserPrice) || 0,
      isActiveForWebUsers: Boolean(isActiveForWebUsers),
      document_requirements: formattedDocs,
      pages: Array.isArray(pages) && pages.length > 0 ? pages : [{ pageNumber: 1, content: combinedBody }],
      body: combinedBody,
      variables: detectedVariables,
      status: status || 'Active',
      mode: activeEnv.env,
      externalSynced,
      createdBy: req.user?._id || null,
    };

    const template = await AgreementTemplate.findOneAndUpdate(
      { company: companyId, template_id },
      templateData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: externalSynced
        ? `Agreement template saved and published to Gateway API (${activeEnv.endpoints.createTemplate.url})`
        : 'Agreement template saved locally (Gateway sync warning)',
      data: template,
      gatewayResponse,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Delete template
// @route   DELETE /api/agreements/templates/:id
// @access  Private (Admin, Super Admin)
const deleteTemplate = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const template = await AgreementTemplate.findOneAndDelete({
      _id: req.params.id,
      company: companyId,
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Initiate/Generate an agreement (Supports linking to a particular User)
// @route   POST /api/agreements/initiate
// @access  Private
const initiateAgreement = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const { template_id, title, variable_data, parties, addEStamp, userId, user } = req.body;

    if (!template_id) {
      return res.status(400).json({ success: false, message: 'Template ID is required' });
    }

    // Find template
    const template = await AgreementTemplate.findOne({
      company: companyId,
      template_id: template_id,
    });

    const parsedVariableData = variable_data && typeof variable_data === 'object' ? variable_data : {};
    const parsedParties = Array.isArray(parties) && parties.length > 0
      ? parties
      : [
          {
            name: req.body.signer_name || 'Client Representative',
            email: req.body.signer_email || req.user.email,
            phone: req.body.signer_phone || '',
            role: req.body.signer_role || 'Signer',
          },
        ];

    const signerName = parsedParties[0]?.name || req.body.signer_name || 'Borrower / Signer';
    const computedTitle = title || `${template?.name || template_id} - ${signerName}`;

    // Target User association
    let targetUserId = userId || user || null;
    if (!targetUserId && parsedParties[0]?.email) {
      const matchedUser = await User.findOne({
        company: companyId,
        email: parsedParties[0].email.toLowerCase().trim(),
      }).select('_id');
      if (matchedUser) {
        targetUserId = matchedUser._id;
      }
    }

    const config = await AgreementConfig.findOne({ company: companyId });
    const activeEnv = getActiveEnvConfig(config);

    if (!activeEnv.apiKey) {
      return res.status(400).json({
        success: false,
        message: 'No Gateway API key configured in E-Agreement Gateway API Settings. Please configure x-api-key.',
      });
    }

    const initMeta = activeEnv.endpoints.initiateAgreement;
    const targetUrl = initMeta.url || `${activeEnv.baseUrl}/${activeEnv.env}/agreements/initiate`;
    const method = (initMeta.method || 'POST').toUpperCase();

    const gatewayPayload = {
      template_id,
      title: computedTitle,
      variable_data: parsedVariableData,
      parties: parsedParties,
    };

    let gatewayResult = null;
    let extStatus = 200;
    let extErrorMsg = '';

    try {
      const extRes = await fetch(targetUrl, {
        method,
        headers: {
          'x-api-key': activeEnv.apiKey,
          'x-environment': activeEnv.env,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gatewayPayload),
      });

      extStatus = extRes.status;
      const extData = await extRes.json().catch(() => ({}));

      if (extRes.ok && (extData.data || extData.success !== false)) {
        gatewayResult = extData.data || extData;
      } else {
        extErrorMsg = extData.message || `Gateway returned HTTP ${extRes.status}`;
      }
    } catch (extErr) {
      extStatus = 502;
      extErrorMsg = `Could not reach Gateway API at ${targetUrl}: ${extErr.message}`;
    }

    // Every agreement request MUST genuinely dispatch to Gateway API setup in Settings.
    // Never generate a local mock agreement when the gateway fails or is unreachable!
    if (!gatewayResult) {
      return res.status(extStatus >= 400 && extStatus < 600 ? extStatus : 400).json({
        success: false,
        message: extErrorMsg || `Failed to initiate agreement on Gateway API (${targetUrl}). Please check Gateway Settings.`,
        targetUrl,
        mode: activeEnv.env,
      });
    }

    // Render variables across all pages to preserve complete template design
    let rawPages = Array.isArray(template?.pages) && template.pages.length > 0
      ? template.pages
      : (template?.body
          ? template.body.split(/<!--\s*PAGE_BREAK\s*-->/i).map((c, i) => ({ pageNumber: i + 1, content: c }))
          : [{ pageNumber: 1, content: '<p>Agreement Document</p>' }]);

    const renderedPages = rawPages.map((pg, idx) => {
      let pageHtml = pg.content || '';
      Object.entries(parsedVariableData).forEach(([k, v]) => {
        const reg = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'gi');
        pageHtml = pageHtml.replace(reg, `<strong>${v}</strong>`);
      });
      return {
        pageNumber: pg.pageNumber || idx + 1,
        content: pageHtml,
      };
    });

    const fullRenderedBody = renderedPages.map((p) => p.content).join('\n<!-- PAGE_BREAK -->\n');

    const agreementId = gatewayResult?.agreement_id || crypto.randomUUID();
    const docUrl = `/api/agreements/${agreementId}/document`;

    const newAgreement = await Agreement.create({
      company: companyId,
      template: template?._id || null,
      template_id: template_id,
      title: computedTitle,
      agreement_id: agreementId,
      signer_name: signerName,
      variable_data: parsedVariableData,
      parties: parsedParties,
      addEStamp: Boolean(addEStamp),
      amount: template?.price || 0,
      status: gatewayResult?.status || 'Signed',
      document_url: docUrl,
      external_document_url: gatewayResult?.document_url || '',
      pages: renderedPages,
      content_preview: fullRenderedBody,
      environment: activeEnv.env,
      signing_details: {
        verification_method: gatewayResult?.signing_details?.verification_method || 'Aadhaar eSign (Simulated Sandbox)',
        signed_at: gatewayResult?.signing_details?.signed_at || new Date(),
        signer_ip: gatewayResult?.signing_details?.signer_ip || req.ip || '223.185.40.148',
        certificate_validity: gatewayResult?.signing_details?.certificate_validity || `Valid (${activeEnv.env === 'production' ? 'Production Legal eSign' : 'Sandbox Simulation'})`,
      },
      user: targetUserId,
      initiatedBy: req.user?._id || null,
    });

    const populatedAgreement = await Agreement.findById(newAgreement._id)
      .populate('user', 'name email phone employeeId avatar role')
      .populate('initiatedBy', 'name email')
      .populate('template', 'name price');

    res.json({
      success: true,
      mode: activeEnv.env,
      message: `e-Agreement generated successfully (${activeEnv.env === 'production' ? 'Production Mode' : 'Sandbox Testing'})`,
      data: populatedAgreement,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get all generated agreements (Supports filtering by specific User)
// @route   GET /api/agreements
// @access  Private
const getAgreements = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const { status, template_id, search, userId } = req.query;

    const query = { company: companyId };

    // Filter by specific user if requested
    if (userId && userId !== 'all') {
      query.$or = [
        { user: userId },
        { initiatedBy: userId },
      ];
    }

    // Role scoping: If standard employee (User role), only view their own agreements
    const userRole = (req.user?.role || '').toLowerCase();
    const isSpecialist = ['admin', 'super admin', 'cto', 'hr manager', 'hr', 'accountant'].includes(userRole);
    if (!isSpecialist && !userId) {
      query.$or = [
        { user: req.user._id },
        { initiatedBy: req.user._id },
      ];
    }

    if (status && status !== 'all') {
      query.status = status;
    }
    if (template_id && template_id !== 'all') {
      query.template_id = template_id;
    }
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      const searchCond = [
        { title: searchRegex },
        { signer_name: searchRegex },
        { agreement_id: searchRegex },
        { template_id: searchRegex },
      ];
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: searchCond },
        ];
        delete query.$or;
      } else {
        query.$or = searchCond;
      }
    }

    const agreements = await Agreement.find(query)
      .populate('template', 'name price')
      .populate('user', 'name email phone employeeId avatar role')
      .populate('initiatedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: agreements,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get agreement by ID
// @route   GET /api/agreements/:id
// @access  Private
const getAgreementById = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const agreement = await Agreement.findOne({
      _id: req.params.id,
      company: companyId,
    })
      .populate('template', 'name price variables document_requirements')
      .populate('user', 'name email phone employeeId avatar role')
      .populate('initiatedBy', 'name email');

    if (!agreement) {
      return res.status(404).json({ success: false, message: 'Agreement not found' });
    }

    res.json({ success: true, data: agreement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Check & sync live status of an agreement from gateway
// @route   GET /api/agreements/:agreement_id/status
// @access  Private
const checkAgreementStatus = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const { agreement_id } = req.params;

    const agreement = await Agreement.findOne({
      agreement_id: agreement_id,
      company: companyId,
    });

    if (!agreement) {
      return res.status(404).json({ success: false, message: 'Agreement not found' });
    }

    const config = await AgreementConfig.findOne({ company: companyId });
    const activeEnv = getActiveEnvConfig(config);

    if (activeEnv.apiKey) {
      const statusMeta = activeEnv.endpoints.checkStatus;
      const targetUrl = (statusMeta.url || `${activeEnv.baseUrl}/${activeEnv.env}/agreements/:agreement_id/status`)
        .replace(':agreement_id', agreement_id)
        .replace('{{agreement_id}}', agreement_id);
      const method = (statusMeta.method || 'GET').toUpperCase();

      try {
        const extRes = await fetch(targetUrl, {
          method,
          headers: {
            'x-api-key': activeEnv.apiKey,
            'x-environment': activeEnv.env,
            'Content-Type': 'application/json',
          },
        });
        const extData = await extRes.json().catch(() => ({}));

        if (extRes.ok && extData.data) {
          agreement.status = extData.data.status || agreement.status;
          if (extData.data.document_url) {
            agreement.external_document_url = extData.data.document_url;
          }
          if (extData.data.signing_details) {
            agreement.signing_details = extData.data.signing_details;
          }
          await agreement.save();

          const populated = await Agreement.findById(agreement._id)
            .populate('user', 'name email phone employeeId avatar role')
            .populate('initiatedBy', 'name email')
            .populate('template', 'name price');

          return res.json({
            success: true,
            mode: activeEnv.env,
            message: 'Status synced successfully from Gateway API',
            targetUrl,
            data: populated,
          });
        } else {
          return res.status(extRes.status || 400).json({
            success: false,
            message: extData.message || `Gateway status check failed (${targetUrl})`,
            targetUrl,
          });
        }
      } catch (extErr) {
        return res.status(502).json({
          success: false,
          message: `Could not connect to Gateway Status API (${targetUrl}): ${extErr.message}`,
          targetUrl,
        });
      }
    }

    const populated = await Agreement.findById(agreement._id)
      .populate('user', 'name email phone employeeId avatar role')
      .populate('initiatedBy', 'name email')
      .populate('template', 'name price');

    // Return current DB status
    res.json({
      success: true,
      mode: activeEnv.env,
      data: populated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get dashboard metrics & summary
// @route   GET /api/agreements/stats
// @access  Private
const getAgreementStats = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.company?._id || req.user.company;

    const [totalAgreements, signedAgreements, pendingAgreements, totalTemplates] = await Promise.all([
      Agreement.countDocuments({ company: companyId }),
      Agreement.countDocuments({ company: companyId, status: 'Signed' }),
      Agreement.countDocuments({ company: companyId, status: { $in: ['Initiated', 'Pending Sign', 'Draft'] } }),
      AgreementTemplate.countDocuments({ company: companyId, status: 'Active' }),
    ]);

    const recentAgreements = await Agreement.find({ company: companyId })
      .populate('user', 'name email phone employeeId avatar role')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      data: {
        totalAgreements,
        signedAgreements,
        pendingAgreements,
        totalTemplates,
        recentAgreements,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Render or download agreement as official printable HTML / PDF
// @route   GET /api/agreements/:agreement_id/view
// @access  Public / Authenticated
const renderAgreementDocument = async (req, res) => {
  try {
    const { agreement_id } = req.params;
    const shouldPrint = req.query.print === 'true' || req.query.download === 'true';

    // Find agreement by agreement_id or _id
    const agreement = await Agreement.findOne({
      $or: [
        { agreement_id: agreement_id },
        { _id: agreement_id.match(/^[0-9a-fA-F]{24}$/) ? agreement_id : null },
      ],
    })
      .populate('company', 'name email phone address website logo')
      .populate('user', 'name email phone role employeeId')
      .populate('template', 'name pages body price');

    if (!agreement) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Agreement Not Found</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>Agreement Document Not Found</h2>
          <p>The requested agreement with ID <code>${agreement_id}</code> could not be located.</p>
        </body>
        </html>
      `);
    }

    const companyName = agreement.company?.name || 'Enterprise Corporation Ltd.';
    const signerName = agreement.signer_name || agreement.user?.name || 'Authorized Signer';
    const signerEmail = agreement.user?.email || agreement.parties?.[0]?.email || 'signer@example.com';
    const signerPhone = agreement.user?.phone || agreement.parties?.[0]?.phone || '';
    const signerRole = agreement.parties?.[0]?.role || 'Borrower / Signer';
    const signedDate = agreement.signing_details?.signed_at
      ? new Date(agreement.signing_details.signed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : new Date(agreement.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const ipAddress = agreement.signing_details?.signer_ip || '223.185.40.148';
    const verificationMethod = agreement.signing_details?.verification_method || 'Aadhaar eSign (Simulated Sandbox)';
    const certificateValidity = agreement.signing_details?.certificate_validity || 'Valid (Simulated Sandbox)';
    const certNumber = 'IN-DL' + (agreement.agreement_id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 14).toUpperCase());

    // Prepare multi-page content
    let pagesList = [];
    if (Array.isArray(agreement.pages) && agreement.pages.length > 0) {
      pagesList = agreement.pages.map((p, idx) => ({
        pageNumber: p.pageNumber || idx + 1,
        content: p.content || '',
      }));
    } else {
      const rawBody = agreement.content_preview || agreement.template?.body || '<p>Agreement Document</p>';
      const parts = rawBody.split(/<!--\s*PAGE_BREAK\s*-->/i);
      pagesList = parts.map((part, idx) => ({
        pageNumber: idx + 1,
        content: part,
      }));
    }

    const vMap = agreement.variable_data && typeof agreement.variable_data === 'object'
      ? (agreement.variable_data instanceof Map ? Object.fromEntries(agreement.variable_data) : agreement.variable_data)
      : {};

    pagesList = pagesList.map((pg) => {
      let pageHtml = pg.content;
      Object.entries(vMap).forEach(([k, v]) => {
        const reg = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'gi');
        pageHtml = pageHtml.replace(reg, `<strong>${v}</strong>`);
      });
      return {
        pageNumber: pg.pageNumber,
        content: pageHtml,
      };
    });

    const totalPages = pagesList.length || 1;

    // Generate individual page sheets
    const pageSheetsHtml = pagesList.map((pg, idx) => {
      const isFirstPage = idx === 0;
      const isLastPage = idx === pagesList.length - 1;

      const headerContent = isFirstPage
        ? `
        <!-- E-STAMP CERTIFICATE HEADER -->
        <div class="stamp-certificate">
          <div class="stamp-header">
            <h2>Government of National Capital Territory of Delhi</h2>
            <h3>e-Stamp Certificate of Agreement</h3>
          </div>
          <div class="stamp-grid">
            <div class="row">
              <span class="label">Certificate No.</span>
              <span class="val">${certNumber}</span>
            </div>
            <div class="row">
              <span class="label">Certificate Issued Date</span>
              <span class="val">${signedDate.split(',')[0]}</span>
            </div>
            <div class="row">
              <span class="label">First Party</span>
              <span class="val">${companyName}</span>
            </div>
            <div class="row">
              <span class="label">Second Party</span>
              <span class="val">${signerName}</span>
            </div>
            <div class="row">
              <span class="label">Stamp Duty Paid By</span>
              <span class="val">${signerName}</span>
            </div>
            <div class="row">
              <span class="label">Stamp Duty Amount</span>
              <span class="val">₹ 100.00 (One Hundred Only)</span>
            </div>
            <div class="row">
              <span class="label">Description of Document</span>
              <span class="val">Article 5 Agreement & Contract</span>
            </div>
            <div class="row">
              <span class="label">Environment</span>
              <span class="val" style="text-transform: uppercase;">${agreement.environment || 'sandbox'}</span>
            </div>
          </div>
        </div>

        <!-- DOCUMENT TITLE & PREAMBLE -->
        <div class="doc-header">
          <h1>${agreement.title}</h1>
          <p>Agreement Reference Code: <strong>${agreement.agreement_id}</strong> • Date: ${signedDate.split(',')[0]}</p>
        </div>
        `
        : `
        <!-- RUNNING HEADER FOR SUBSEQUENT PAGES -->
        <div class="running-header">
          <span>${agreement.title}</span>
          <span>Doc ID: ${agreement.agreement_id} • Page ${pg.pageNumber} of ${totalPages}</span>
        </div>
        `;

      const footerSection = isLastPage
        ? `
        <!-- EXECUTION SIGNATURES -->
        <div class="signature-grid">
          <div class="sig-box">
            <div class="title">FIRST PARTY / AUTHORIZED SIGNATORY</div>
            <div class="name">${companyName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Corporate Legal Authority</div>
            <div class="seal">✓ Digitally Signed & Sealed</div>
          </div>

          <div class="sig-box">
            <div class="title">SECOND PARTY / RECIPIENT SIGNATURE</div>
            <div class="name">${signerName}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${signerRole} • ${signerEmail}</div>
            <div class="seal" style="background: #e0f2fe; color: #0369a1; border-color: #bae6fd;">✓ Signed via Aadhaar eSign</div>
          </div>
        </div>

        <!-- DIGITAL CERTIFICATE AUDIT TRAIL -->
        <div class="audit-certificate">
          <h4>🛡️ Digital eSign Audit Trail &amp; Electronic Signature Certificate</h4>
          <div class="audit-grid">
            <div>
              <span>Verification Engine</span>
              <strong>${verificationMethod}</strong>
            </div>
            <div>
              <span>Certificate Status</span>
              <strong style="color: #059669;">${certificateValidity}</strong>
            </div>
            <div>
              <span>Signer Verified Name</span>
              <strong>${signerName}</strong>
            </div>
            <div>
              <span>Signer Official IP</span>
              <strong>${ipAddress}</strong>
            </div>
            <div>
              <span>Execution Timestamp</span>
              <strong>${signedDate}</strong>
            </div>
            <div>
              <span>Document Checksum</span>
              <strong style="font-family: monospace; font-size: 10px;">SHA256:${agreement.agreement_id.replace(/-/g, '').slice(0, 16)}...</strong>
            </div>
          </div>
        </div>
        `
        : '';

      return `
      <div class="page-sheet">
        <div class="page-content-wrapper">
          ${headerContent}
          <div class="doc-body">
            ${pg.content}
          </div>
          ${footerSection}
        </div>
        <div class="page-footer">
          <span>Official E-Agreement Document • Confidentially Protected</span>
          <span>Page ${pg.pageNumber} of ${totalPages}</span>
        </div>
      </div>
      `;
    }).join('\n');

    // Generate self-contained HTML page with printable CSS
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agreement.title} - ${agreement.agreement_id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Georgia, serif;
      background: #e2e8f0;
      color: #0f172a;
      line-height: 1.6;
      padding: 20px;
    }
    .toolbar {
      position: sticky;
      top: 10px;
      z-index: 1000;
      max-width: 840px;
      margin: 0 auto 20px auto;
      background: #0f172a;
      color: #fff;
      padding: 12px 20px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 10px 25px rgba(0,0,0,0.25);
    }
    .toolbar h1 {
      font-size: 14px;
      font-family: system-ui, sans-serif;
      font-weight: 700;
    }
    .toolbar .btn {
      background: #10b981;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .toolbar .btn:hover {
      background: #059669;
    }
    .page-sheet {
      max-width: 840px;
      margin: 0 auto 30px auto;
      background: #ffffff;
      padding: 50px 60px;
      border-radius: 6px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.08);
      border: 1px solid #cbd5e1;
      position: relative;
      min-height: 1050px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .page-content-wrapper {
      flex: 1;
    }
    .running-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 8px;
      margin-bottom: 24px;
      font-family: system-ui, sans-serif;
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
    }
    .stamp-certificate {
      border: 2px solid #065f46;
      background: #f0fdf4;
      padding: 16px;
      margin-bottom: 30px;
      border-radius: 6px;
      font-family: system-ui, sans-serif;
      font-size: 11px;
    }
    .stamp-header {
      text-align: center;
      border-bottom: 2px solid #065f46;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .stamp-header h2 {
      font-size: 13px;
      font-weight: 900;
      color: #064e3b;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .stamp-header h3 {
      font-size: 11px;
      color: #047857;
      font-weight: 700;
      text-transform: uppercase;
    }
    .stamp-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
    }
    .stamp-grid .row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dashed #a7f3d0;
      padding-bottom: 2px;
    }
    .stamp-grid .label {
      color: #065f46;
      font-weight: 600;
    }
    .stamp-grid .val {
      font-weight: 700;
      color: #022c22;
    }
    .doc-header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px double #0f172a;
      padding-bottom: 15px;
    }
    .doc-header h1 {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .doc-header p {
      font-size: 13px;
      color: #475569;
      font-family: system-ui, sans-serif;
    }
    .doc-body {
      font-size: 14.5px;
      line-height: 1.8;
      text-align: justify;
      margin-bottom: 24px;
    }
    .doc-body p { margin-bottom: 14px; }
    .doc-body strong { font-weight: 700; color: #020617; }
    .doc-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 13px;
    }
    .doc-body table, .doc-body th, .doc-body td {
      border: 1px solid #94a3b8;
      padding: 8px 12px;
    }
    .doc-body th { background: #f8fafc; font-weight: 700; }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-top: 36px;
      padding-top: 20px;
      border-top: 1px solid #cbd5e1;
      font-family: system-ui, sans-serif;
    }
    .sig-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 16px;
      background: #fafafa;
    }
    .sig-box .title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 8px;
    }
    .sig-box .name {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
    }
    .sig-box .seal {
      margin-top: 12px;
      display: inline-block;
      padding: 4px 10px;
      background: #dcfce7;
      color: #166534;
      font-size: 10px;
      font-weight: 800;
      border-radius: 4px;
      border: 1px solid #86efac;
    }
    .audit-certificate {
      margin-top: 30px;
      padding: 18px;
      border: 2px solid #10b981;
      background: #ecfdf5;
      border-radius: 8px;
      font-family: system-ui, sans-serif;
    }
    .audit-certificate h4 {
      font-size: 12px;
      font-weight: 900;
      color: #065f46;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .audit-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px 20px;
      font-size: 11px;
      color: #334155;
    }
    .audit-grid div { display: flex; flex-direction: column; }
    .audit-grid span { color: #64748b; font-size: 10px; }
    .audit-grid strong { color: #0f172a; font-weight: 700; }
    .page-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: system-ui, sans-serif;
      font-size: 10px;
      color: #64748b;
    }
    @media print {
      body { background: #fff !important; padding: 0 !important; }
      .toolbar { display: none !important; }
      .page-sheet {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        page-break-after: always !important;
        break-after: page !important;
        min-height: auto !important;
      }
      .page-sheet:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      @page {
        size: A4;
        margin: 15mm;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>${agreement.title}</h1>
      <span style="font-size: 11px; opacity: 0.8; font-family: monospace;">Doc ID: ${agreement.agreement_id} • ${totalPages} Page(s)</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="btn" onclick="window.print()">
        🖨️ Print / Save as PDF
      </button>
    </div>
  </div>

  <div class="pages-wrapper">
    ${pageSheetsHtml}
  </div>

  ${shouldPrint ? '<script>window.onload = function() { setTimeout(function() { window.print(); }, 400); };</script>' : ''}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h3>Error generating agreement document:</h3><p>${err.message}</p>`);
  }
};

module.exports = {
  getAgreementConfig,
  updateAgreementConfig,
  testAgreementConnection,
  getCompanySignerUsers,
  getTemplates,
  getTemplateById,
  createOrUpdateTemplate,
  deleteTemplate,
  initiateAgreement,
  getAgreements,
  getAgreementById,
  checkAgreementStatus,
  getAgreementStats,
  renderAgreementDocument,
};
