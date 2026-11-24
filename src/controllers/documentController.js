const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const EmployeeDocument = require('../models/EmployeeDocument');
const DocumentFieldConfig = require('../models/DocumentFieldConfig');
const User = require('../models/User');
const { documentsDir } = require('../middleware/documentUploadMiddleware');
const { logAudit } = require('../utils/auditLogger');

/**
 * Default templates helper to initialize standard Indian KYC documents
 */
const getDefaultDocumentTemplates = (companyId, userId) => [
  {
    company: companyId,
    name: 'Aadhaar Card',
    category: 'Identity Proof',
    description: '12-digit Unique Identification Authority of India (UIDAI) Card',
    isRequired: true,
    order: 1,
    subFields: [
      {
        key: 'aadhaarNumber',
        label: 'Aadhaar Number',
        type: 'text',
        required: true,
        validationType: 'numeric',
        minLength: 12,
        maxLength: 12,
        placeholder: '1234 5678 9012 (12 digits)',
        errorMessage: 'Aadhaar Number must be exactly 12 numeric digits',
      },
      {
        key: 'fullNameAsPerAadhaar',
        label: 'Name as per Aadhaar',
        type: 'text',
        required: false,
        validationType: 'any',
        placeholder: 'Full name printed on Aadhaar',
      },
    ],
    fileUpload: {
      enabled: true,
      required: true,
      allowedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      maxSizeMB: 10,
      label: 'Upload Aadhaar Card (Front / Back / PDF)',
    },
    createdBy: userId,
  },
  {
    company: companyId,
    name: 'PAN Card',
    category: 'Financial',
    description: '10-character Permanent Account Number issued by Income Tax Department',
    isRequired: true,
    order: 2,
    subFields: [
      {
        key: 'panNumber',
        label: 'PAN Card Number',
        type: 'text',
        required: true,
        validationType: 'alphanumeric',
        minLength: 10,
        maxLength: 10,
        placeholder: 'e.g. ABCDE1234F',
        errorMessage: 'PAN must be exactly 10 alphanumeric characters (e.g. ABCDE1234F)',
      },
      {
        key: 'fatherName',
        label: "Father's Name (as on PAN)",
        type: 'text',
        required: false,
        validationType: 'any',
        placeholder: 'Father name',
      },
    ],
    fileUpload: {
      enabled: true,
      required: true,
      allowedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      maxSizeMB: 10,
      label: 'Upload PAN Card Photo / PDF',
    },
    createdBy: userId,
  },
  {
    company: companyId,
    name: 'Bank Passbook / Cancelled Cheque',
    category: 'Financial',
    description: 'Bank verification for salary credit and payroll account setup',
    isRequired: true,
    order: 3,
    subFields: [
      {
        key: 'bankName',
        label: 'Bank Name',
        type: 'text',
        required: true,
        validationType: 'any',
        placeholder: 'e.g. HDFC Bank / ICICI / SBI',
      },
      {
        key: 'accountNumber',
        label: 'Bank Account Number',
        type: 'text',
        required: true,
        validationType: 'numeric',
        placeholder: 'e.g. 50100012345678',
        errorMessage: 'Account number must contain only numeric digits',
      },
      {
        key: 'ifscCode',
        label: 'Bank IFSC Code',
        type: 'text',
        required: true,
        validationType: 'alphanumeric',
        minLength: 11,
        maxLength: 11,
        placeholder: 'e.g. HDFC0001234',
        errorMessage: 'IFSC code must be exactly 11 characters',
      },
    ],
    fileUpload: {
      enabled: true,
      required: true,
      allowedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      maxSizeMB: 10,
      label: 'Upload Cancelled Cheque / Passbook Copy',
    },
    createdBy: userId,
  },
  {
    company: companyId,
    name: 'Highest Educational Degree / Certificate',
    category: 'Academic',
    description: 'Graduation, Post-Graduation or highest qualifying educational degree',
    isRequired: false,
    order: 4,
    subFields: [
      {
        key: 'degreeName',
        label: 'Degree / Course Name',
        type: 'text',
        required: true,
        validationType: 'any',
        placeholder: 'e.g. B.Tech Computer Science / MBA',
      },
      {
        key: 'universityName',
        label: 'University / Institute Name',
        type: 'text',
        required: false,
        validationType: 'any',
        placeholder: 'University or College name',
      },
      {
        key: 'passingYear',
        label: 'Year of Passing',
        type: 'number',
        required: false,
        validationType: 'numeric',
        minLength: 4,
        maxLength: 4,
        placeholder: 'e.g. 2023',
        errorMessage: 'Year must be a 4-digit number',
      },
    ],
    fileUpload: {
      enabled: true,
      required: true,
      allowedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      maxSizeMB: 10,
      label: 'Upload Degree Certificate / Final Marksheet',
    },
    createdBy: userId,
  },
  {
    company: companyId,
    name: 'Resume / CV',
    category: 'Experience',
    description: 'Updated professional curriculum vitae',
    isRequired: false,
    order: 5,
    subFields: [],
    fileUpload: {
      enabled: true,
      required: true,
      allowedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
      maxSizeMB: 10,
      label: 'Upload Resume PDF',
    },
    createdBy: userId,
  },
];

/**
 * @desc Get all documents uploaded by logged-in employee
 * @route GET /api/documents/my
 * @access Private (All authenticated users)
 */
const getMyDocuments = async (req, res) => {
  try {
    const documents = await EmployeeDocument.find({ user: req.user._id })
      .populate('reviewedBy', 'name email role')
      .populate('documentConfig')
      .sort({ createdAt: -1 });

    const stats = {
      total: documents.length,
      approved: documents.filter((d) => d.status === 'Approved').length,
      pending: documents.filter((d) => d.status === 'Pending').length,
      rejected: documents.filter((d) => d.status === 'Rejected').length,
    };

    res.json({
      success: true,
      data: documents,
      stats,
    });
  } catch (error) {
    console.error('Error fetching employee documents:', error);
    res.status(500).json({ message: 'Failed to fetch personal documents', error: error.message });
  }
};

/**
 * @desc Upload a document by logged-in employee with dynamic subfields validation
 * @route POST /api/documents/my
 * @access Private (All authenticated users)
 */
const uploadMyDocument = async (req, res) => {
  try {
    const {
      documentConfigId,
      documentType,
      customTitle,
      documentNumber,
      notes,
      expiryDate,
    } = req.body;

    let subFieldValues = {};
    if (req.body.subFieldValues) {
      if (typeof req.body.subFieldValues === 'string') {
        try {
          subFieldValues = JSON.parse(req.body.subFieldValues);
        } catch (e) {
          subFieldValues = {};
        }
      } else {
        subFieldValues = req.body.subFieldValues;
      }
    }

    let config = null;
    let finalDocType = (documentType || '').trim();

    if (documentConfigId) {
      config = await DocumentFieldConfig.findById(documentConfigId);
      if (config) {
        finalDocType = config.name;

        // Validate subFields according to admin config
        if (Array.isArray(config.subFields)) {
          for (const sf of config.subFields) {
            const rawVal = subFieldValues[sf.key];
            const val = rawVal != null ? String(rawVal).trim() : '';

            // 1. Required check
            if (sf.required && !val) {
              return res.status(400).json({
                message: `Field "${sf.label}" is required.`,
              });
            }

            if (val) {
              // 2. Validation Type checks
              if (sf.validationType === 'numeric') {
                if (!/^\d+$/.test(val)) {
                  return res.status(400).json({
                    message: sf.errorMessage || `Field "${sf.label}" must contain numbers only (digits 0-9).`,
                  });
                }
              } else if (sf.validationType === 'alphanumeric') {
                if (!/^[a-zA-Z0-9]+$/.test(val)) {
                  return res.status(400).json({
                    message: sf.errorMessage || `Field "${sf.label}" must be alphanumeric (letters and numbers only).`,
                  });
                }
              } else if (sf.validationType === 'pan') {
                if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(val)) {
                  return res.status(400).json({
                    message: sf.errorMessage || 'Invalid PAN Card format. Expected 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).',
                  });
                }
              } else if (sf.validationType === 'aadhaar') {
                const cleanAadhaar = val.replace(/\s+/g, '');
                if (!/^\d{12}$/.test(cleanAadhaar)) {
                  return res.status(400).json({
                    message: sf.errorMessage || 'Aadhaar Number must be exactly 12 numeric digits.',
                  });
                }
              } else if (sf.validationType === 'regex' && sf.pattern) {
                try {
                  const reg = new RegExp(sf.pattern);
                  if (!reg.test(val)) {
                    return res.status(400).json({
                      message: sf.errorMessage || `Field "${sf.label}" does not match the required format.`,
                    });
                  }
                } catch (e) {
                  // ignore invalid regex
                }
              }

              // 3. Length checks
              if (sf.minLength && val.length < sf.minLength) {
                return res.status(400).json({
                  message: sf.errorMessage || `Field "${sf.label}" must be at least ${sf.minLength} characters long.`,
                });
              }
              if (sf.maxLength && val.length > sf.maxLength) {
                return res.status(400).json({
                  message: sf.errorMessage || `Field "${sf.label}" cannot exceed ${sf.maxLength} characters.`,
                });
              }
            }
          }
        }

        // Check if file upload is required
        if (config.fileUpload?.enabled && config.fileUpload?.required && !req.file) {
          return res.status(400).json({
            message: `Please upload the file/photo for "${config.name}".`,
          });
        }
      }
    } else {
      // Fallback if no config selected
      if (!req.file) {
        return res.status(400).json({ message: 'Please select a file to upload.' });
      }
    }

    // Determine primary documentNumber
    let primaryDocNumber = (documentNumber || '').trim();
    if (!primaryDocNumber && Object.keys(subFieldValues).length > 0) {
      primaryDocNumber =
        subFieldValues.aadhaarNumber ||
        subFieldValues.panNumber ||
        subFieldValues.documentNumber ||
        subFieldValues.accountNumber ||
        Object.values(subFieldValues)[0] ||
        '';
    }

    const fileUrl = req.file ? `/uploads/documents/${req.file.filename}` : '';
    const fileName = req.file ? req.file.filename : '';
    const originalFileName = req.file ? req.file.originalname : '';
    const fileType = req.file ? req.file.mimetype : 'application/octet-stream';
    const fileSize = req.file ? req.file.size : 0;

    const newDocument = await EmployeeDocument.create({
      user: req.user._id,
      company: req.user.company?._id || req.user.company || null,
      documentConfig: config ? config._id : null,
      documentType: finalDocType || 'Other Document',
      customTitle: customTitle || '',
      documentNumber: primaryDocNumber,
      subFieldValues,
      fileUrl,
      fileName,
      originalFileName,
      fileType,
      fileSize,
      status: 'Pending',
      notes: notes || '',
      expiryDate: expiryDate ? new Date(expiryDate) : null,
    });

    logAudit({
      req,
      action: 'DOCUMENT_UPLOADED',
      category: 'USER',
      status: 'SUCCESS',
      statusCode: 201,
      targetUser: req.user._id,
      details: {
        documentId: newDocument._id,
        documentType: newDocument.documentType,
        fileName: req.file ? req.file.originalname : 'Details Submitted',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully and submitted for verification.',
      data: newDocument,
    });
  } catch (error) {
    console.error('Error uploading employee document:', error);
    res.status(500).json({ message: 'Failed to upload document', error: error.message });
  }
};

/**
 * @desc Delete personal document (Only if Pending or Rejected)
 * @route DELETE /api/documents/my/:id
 * @access Private (All authenticated users)
 */
const deleteMyDocument = async (req, res) => {
  try {
    const document = await EmployeeDocument.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found or unauthorized.' });
    }

    if (document.status === 'Approved') {
      return res.status(400).json({
        message: 'Verified & Approved documents cannot be deleted directly. Please contact HR or Admin.',
      });
    }

    // Attempt to remove physical file
    const filePath = path.join(documentsDir, document.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('Warning: Could not unlink file:', filePath, err.message);
      }
    }

    await EmployeeDocument.deleteOne({ _id: document._id });

    res.json({
      success: true,
      message: 'Document deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting employee document:', error);
    res.status(500).json({ message: 'Failed to delete document', error: error.message });
  }
};

/**
 * @desc Get all employee documents (Admin / HR / Accountant)
 * @route GET /api/documents/admin/all
 * @access Private (Admin, CTO, or users with documents.view permission)
 */
const getAllDocuments = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin';
    const companyId = req.user.company?._id || req.user.company;
    const { userId, status, documentType, department, search } = req.query;

    const query = {};
    if (!isSuperAdmin && companyId) {
      query.$or = [{ company: companyId }, { company: null }, { company: { $exists: false } }];
    } else if (req.query.companyId) {
      query.company = req.query.companyId;
    }

    if (userId) {
      query.user = userId;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (documentType && documentType !== 'All') {
      query.documentType = documentType;
    }

    let documents = await EmployeeDocument.find(query)
      .populate('user', 'name email department designation profilePicture phone company')
      .populate('reviewedBy', 'name email role')
      .populate('documentConfig')
      .sort({ createdAt: -1 });

    // In-memory filter for search / department if user populated
    if (department && department !== 'All') {
      documents = documents.filter((d) => d.user && d.user.department === department);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      documents = documents.filter(
        (d) =>
          (d.user && d.user.name && d.user.name.toLowerCase().includes(q)) ||
          (d.user && d.user.email && d.user.email.toLowerCase().includes(q)) ||
          (d.documentType && d.documentType.toLowerCase().includes(q)) ||
          (d.customTitle && d.customTitle.toLowerCase().includes(q)) ||
          (d.originalFileName && d.originalFileName.toLowerCase().includes(q)) ||
          (d.documentNumber && d.documentNumber.toLowerCase().includes(q)) ||
          (d.subFieldValues && JSON.stringify(d.subFieldValues).toLowerCase().includes(q))
      );
    }

    // Group documents by employee
    const employeeMap = {};
    documents.forEach((doc) => {
      if (!doc.user) return;
      const uid = doc.user._id.toString();
      if (!employeeMap[uid]) {
        employeeMap[uid] = {
          user: doc.user,
          documents: [],
          stats: {
            total: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
          },
        };
      }
      employeeMap[uid].documents.push(doc);
      employeeMap[uid].stats.total += 1;
      if (doc.status === 'Approved') employeeMap[uid].stats.approved += 1;
      else if (doc.status === 'Pending') employeeMap[uid].stats.pending += 1;
      else if (doc.status === 'Rejected') employeeMap[uid].stats.rejected += 1;
    });

    const groupedEmployees = Object.values(employeeMap);

    // Overall summary counts
    const countQuery = !isSuperAdmin && companyId ? { $or: [{ company: companyId }, { company: null }, { company: { $exists: false } }] } : {};
    const allCompanyDocs = await EmployeeDocument.find(countQuery);
    const overallStats = {
      totalDocuments: allCompanyDocs.length,
      approved: allCompanyDocs.filter((d) => d.status === 'Approved').length,
      pending: allCompanyDocs.filter((d) => d.status === 'Pending').length,
      rejected: allCompanyDocs.filter((d) => d.status === 'Rejected').length,
      totalEmployeesWithDocs: Object.keys(employeeMap).length,
    };

    res.json({
      success: true,
      data: documents,
      groupedEmployees,
      stats: overallStats,
    });
  } catch (error) {
    console.error('Error fetching admin employee documents:', error);
    res.status(500).json({ message: 'Failed to retrieve documents', error: error.message });
  }
};

/**
 * @desc Review a document (Approve or Reject with reason)
 * @route PUT /api/documents/admin/review/:id
 * @access Private (Admin, CTO, or users with documents.edit permission)
 */
const reviewDocument = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const isSuperAdmin = req.user.role === 'Super Admin';
    const companyId = req.user.company?._id || req.user.company;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be "Approved" or "Rejected".' });
    }

    if (status === 'Rejected' && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({ message: 'Please provide a reason for rejecting the document.' });
    }

    const docQuery = { _id: req.params.id };
    if (!isSuperAdmin && companyId) {
      docQuery.$or = [{ company: companyId }, { company: null }, { company: { $exists: false } }];
    }

    const document = await EmployeeDocument.findOne(docQuery).populate('user', 'name email');

    if (!document) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    document.status = status;
    document.reviewedBy = req.user._id;
    document.reviewedAt = new Date();
    document.rejectionReason = status === 'Rejected' ? rejectionReason.trim() : '';

    await document.save();

    logAudit({
      req,
      action: status === 'Approved' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
      category: 'ADMIN',
      status: 'SUCCESS',
      statusCode: 200,
      targetUser: document.user?._id,
      details: {
        documentId: document._id,
        documentType: document.documentType,
        status,
        rejectionReason: document.rejectionReason,
      },
    });

    res.json({
      success: true,
      message: `Document has been ${status.toLowerCase()} successfully.`,
      data: document,
    });
  } catch (error) {
    console.error('Error reviewing document:', error);
    res.status(500).json({ message: 'Failed to review document', error: error.message });
  }
};

/**
 * @desc Admin delete document
 * @route DELETE /api/documents/admin/:id
 * @access Private (Admin, CTO)
 */
const adminDeleteDocument = async (req, res) => {
  try {
    const companyId = req.user.company?._id || req.user.company;
    const document = await EmployeeDocument.findOne({
      _id: req.params.id,
      company: companyId,
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    const filePath = path.join(documentsDir, document.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('Could not unlink file:', filePath, err.message);
      }
    }

    await EmployeeDocument.deleteOne({ _id: document._id });

    res.json({
      success: true,
      message: 'Document permanently deleted by admin.',
    });
  } catch (error) {
    console.error('Error admin deleting document:', error);
    res.status(500).json({ message: 'Failed to delete document', error: error.message });
  }
};

/**
 * @desc Download a specific employee's documents as a single ZIP bundle
 * @route GET /api/documents/admin/download-zip/:userId
 * @route POST /api/documents/admin/download-zip-batch
 * @access Private (Admin, HR, Accountant, authorized roles)
 */
const downloadUserDocumentsZip = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin';
    const companyId = req.user.company?._id || req.user.company;
    const userId = req.params.userId || req.body.userId;
    const selectedDocIds = req.body?.documentIds || (req.query?.documentIds ? req.query.documentIds.split(',') : null);

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required to generate documents zip.' });
    }

    const userQuery = { _id: userId };
    if (!isSuperAdmin && companyId) {
      userQuery.$or = [{ company: companyId }, { company: null }, { company: { $exists: false } }];
    }

    const targetUser = await User.findOne(userQuery);
    if (!targetUser) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const query = { user: userId };
    if (!isSuperAdmin && companyId) {
      query.$or = [{ company: companyId }, { company: null }, { company: { $exists: false } }];
    }
    if (selectedDocIds && selectedDocIds.length > 0) {
      query._id = { $in: selectedDocIds };
    }

    const documents = await EmployeeDocument.find(query);

    if (!documents || documents.length === 0) {
      return res.status(404).json({ message: 'No documents found for this employee to package in ZIP.' });
    }

    // Clean employee name for file naming
    const safeEmpName = targetUser.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const zipFileName = `${safeEmpName}_KYC_Documents_${Date.now()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Archiver warning:', err);
      } else {
        throw err;
      }
    });

    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to generate ZIP archive', error: err.message });
      }
    });

    archive.pipe(res);

    // Track added names to avoid collision in ZIP
    const addedNames = new Set();

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const filePath = path.join(documentsDir, doc.fileName);

      if (fs.existsSync(filePath)) {
        const ext = path.extname(doc.originalFileName || doc.fileName) || '.pdf';
        const cleanType = (doc.documentType || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanTitle = (doc.customTitle || doc.originalFileName || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
        
        let zipEntryName = `${cleanType}${cleanTitle ? '_' + cleanTitle : ''}${ext}`;
        let counter = 1;
        while (addedNames.has(zipEntryName.toLowerCase())) {
          zipEntryName = `${cleanType}_${counter}${ext}`;
          counter++;
        }
        addedNames.add(zipEntryName.toLowerCase());

        archive.file(filePath, { name: zipEntryName });
      }
    }

    await archive.finalize();

    logAudit({
      req,
      action: 'DOCUMENTS_ZIP_DOWNLOADED',
      category: 'ADMIN',
      status: 'SUCCESS',
      statusCode: 200,
      targetUser: targetUser._id,
      details: {
        totalDocumentsArchived: documents.length,
        zipFileName,
      },
    });
  } catch (error) {
    console.error('Error generating documents ZIP:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error generating ZIP bundle', error: error.message });
    }
  }
};

/**
 * @desc Force download a single document file directly to user device (attachment)
 * @route GET /api/documents/download-file/:id
 * @access Private (Owner employee, or Admin/HR/Accountant with view permission)
 */
const downloadSingleDocument = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin';
    const companyId = req.user.company?._id || req.user.company;
    const document = await EmployeeDocument.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const isOwner = document.user.toString() === req.user._id.toString();
    const isSameCompany =
      isSuperAdmin ||
      !companyId ||
      !document.company ||
      document.company.toString() === companyId.toString();

    if (!isOwner && !isSameCompany) {
      return res.status(403).json({ message: 'Unauthorized to download this document' });
    }

    const filePath = path.join(documentsDir, document.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    const ext = path.extname(document.originalFileName || document.fileName) || '.pdf';
    let safeDownloadName = document.originalFileName;
    if (!safeDownloadName) {
      const cleanType = (document.documentType || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanTitle = (document.customTitle || '').replace(/[^a-zA-Z0-9_-]/g, '_');
      safeDownloadName = `${cleanType}${cleanTitle ? '_' + cleanTitle : ''}${ext}`;
    }

    res.download(filePath, safeDownloadName, (err) => {
      if (err && !res.headersSent) {
        console.error('Error in res.download:', err);
        res.status(500).json({ message: 'Failed to download file', error: err.message });
      }
    });
  } catch (error) {
    console.error('Error downloading document file:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error downloading file', error: error.message });
    }
  }
};

/**
 * =========================================================================
 * DOCUMENT FIELD CONFIGURATIONS (ADMIN DYNAMIC FIELDS & VALIDATIONS)
 * =========================================================================
 */

/**
 * @desc Get all document fields configured for current company
 * @route GET /api/documents/fields
 * @access Private (All authenticated users)
 */
const getDocumentFields = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin';
    let companyId = req.user.company?._id || req.user.company;
    if (isSuperAdmin && req.query.companyId) {
      companyId = req.query.companyId;
    }

    const roleName = (req.user.role || '').toLowerCase();
    const isAdminOrHR =
      roleName === 'admin' ||
      roleName === 'super admin' ||
      roleName === 'cto' ||
      roleName === 'hr manager' ||
      roleName === 'hr';

    const filter = {};
    if (companyId) {
      filter.$or = [{ company: companyId }, { company: null }, { company: { $exists: false } }];
    }

    // Employees only see active fields
    if (!isAdminOrHR && req.query.all !== 'true') {
      filter.isActive = true;
    }

    let fields = await DocumentFieldConfig.find(filter).sort({ order: 1, createdAt: 1 });

    // Auto-seed default standard KYC templates if none exist for company
    if (fields.length === 0 && companyId) {
      const templates = getDefaultDocumentTemplates(companyId, req.user._id);
      await DocumentFieldConfig.insertMany(templates);
      fields = await DocumentFieldConfig.find(filter).sort({ order: 1, createdAt: 1 });
    }

    res.json({
      success: true,
      data: fields,
    });
  } catch (error) {
    console.error('Error fetching document fields:', error);
    res.status(500).json({ message: 'Failed to fetch document fields', error: error.message });
  }
};

/**
 * @desc Create a new dynamic document field with subfields and validations
 * @route POST /api/documents/fields
 * @access Private (Admin / HR)
 */
const createDocumentField = async (req, res) => {
  try {
    const companyId = req.user.company?._id || req.user.company;
    const {
      name,
      category,
      description,
      isRequired,
      subFields,
      fileUpload,
      isActive,
      order,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Document Field Name is required.' });
    }

    const cleanName = name.trim();

    // Check duplicate name within company
    const existing = await DocumentFieldConfig.findOne({
      company: companyId,
      name: { $regex: new RegExp(`^${cleanName}$`, 'i') },
    });

    if (existing) {
      return res.status(400).json({
        message: `A document field named "${cleanName}" already exists in your company.`,
      });
    }

    // Clean subfields
    const cleanSubFields = Array.isArray(subFields)
      ? subFields.map((sf, idx) => ({
          key: sf.key ? sf.key.trim().replace(/[^a-zA-Z0-9_]/g, '') : `field_${idx}_${Date.now()}`,
          label: sf.label ? sf.label.trim() : `Field ${idx + 1}`,
          type: ['text', 'number', 'date', 'select'].includes(sf.type) ? sf.type : 'text',
          required: Boolean(sf.required),
          validationType: ['any', 'numeric', 'alphanumeric', 'pan', 'aadhaar', 'regex'].includes(
            sf.validationType
          )
            ? sf.validationType
            : 'any',
          pattern: sf.pattern || '',
          minLength: sf.minLength ? parseInt(sf.minLength, 10) : null,
          maxLength: sf.maxLength ? parseInt(sf.maxLength, 10) : null,
          placeholder: sf.placeholder || '',
          errorMessage: sf.errorMessage || '',
          options: Array.isArray(sf.options) ? sf.options : [],
        }))
      : [];

    const newField = await DocumentFieldConfig.create({
      company: companyId,
      name: cleanName,
      category: category || 'Identity Proof',
      description: description || '',
      isRequired: isRequired !== false,
      subFields: cleanSubFields,
      fileUpload: {
        enabled: fileUpload?.enabled !== false,
        required: fileUpload?.required !== false,
        allowedFormats: fileUpload?.allowedFormats || [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ],
        maxSizeMB: fileUpload?.maxSizeMB || 10,
        label: fileUpload?.label || 'Upload Document / Photo (PDF, PNG, JPG)',
      },
      isActive: isActive !== false,
      order: order || 0,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: `Document field "${cleanName}" created successfully!`,
      data: newField,
    });
  } catch (error) {
    console.error('Error creating document field:', error);
    res.status(500).json({ message: 'Failed to create document field', error: error.message });
  }
};

/**
 * @desc Update a document field configuration
 * @route PUT /api/documents/fields/:id
 * @access Private (Admin / HR)
 */
const updateDocumentField = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin';
    const companyId = req.user.company?._id || req.user.company;
    const {
      name,
      category,
      description,
      isRequired,
      subFields,
      fileUpload,
      isActive,
      order,
    } = req.body;

    const query = { _id: req.params.id };
    if (!isSuperAdmin && companyId) {
      query.$or = [{ company: companyId }, { company: null }, { company: { $exists: false } }];
    }

    const field = await DocumentFieldConfig.findOne(query);
    if (!field) {
      return res.status(404).json({ message: 'Document field configuration not found.' });
    }

    if (name && name.trim()) {
      field.name = name.trim();
    }
    if (category) field.category = category;
    if (description !== undefined) field.description = description;
    if (isRequired !== undefined) field.isRequired = Boolean(isRequired);
    if (isActive !== undefined) field.isActive = Boolean(isActive);
    if (order !== undefined) field.order = parseInt(order, 10);

    if (Array.isArray(subFields)) {
      field.subFields = subFields.map((sf, idx) => ({
        key: sf.key ? sf.key.trim().replace(/[^a-zA-Z0-9_]/g, '') : `field_${idx}_${Date.now()}`,
        label: sf.label ? sf.label.trim() : `Field ${idx + 1}`,
        type: ['text', 'number', 'date', 'select'].includes(sf.type) ? sf.type : 'text',
        required: Boolean(sf.required),
        validationType: ['any', 'numeric', 'alphanumeric', 'pan', 'aadhaar', 'regex'].includes(
          sf.validationType
        )
          ? sf.validationType
          : 'any',
        pattern: sf.pattern || '',
        minLength: sf.minLength ? parseInt(sf.minLength, 10) : null,
        maxLength: sf.maxLength ? parseInt(sf.maxLength, 10) : null,
        placeholder: sf.placeholder || '',
        errorMessage: sf.errorMessage || '',
        options: Array.isArray(sf.options) ? sf.options : [],
      }));
    }

    if (fileUpload) {
      field.fileUpload = {
        enabled: fileUpload.enabled !== false,
        required: fileUpload.required !== false,
        allowedFormats: fileUpload.allowedFormats || field.fileUpload?.allowedFormats || [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ],
        maxSizeMB: fileUpload.maxSizeMB || field.fileUpload?.maxSizeMB || 10,
        label: fileUpload.label || field.fileUpload?.label || 'Upload Document / Photo (PDF, PNG, JPG)',
      };
    }

    field.updatedBy = req.user._id;
    await field.save();

    res.json({
      success: true,
      message: `Document field "${field.name}" updated successfully!`,
      data: field,
    });
  } catch (error) {
    console.error('Error updating document field:', error);
    res.status(500).json({ message: 'Failed to update document field', error: error.message });
  }
};

/**
 * @desc Delete a document field configuration
 * @route DELETE /api/documents/fields/:id
 * @access Private (Admin / HR)
 */
const deleteDocumentField = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin';
    const companyId = req.user.company?._id || req.user.company;

    const query = { _id: req.params.id };
    if (!isSuperAdmin && companyId) {
      query.$or = [{ company: companyId }, { company: null }, { company: { $exists: false } }];
    }

    const field = await DocumentFieldConfig.findOne(query);
    if (!field) {
      return res.status(404).json({ message: 'Document field configuration not found.' });
    }

    await DocumentFieldConfig.deleteOne({ _id: field._id });

    res.json({
      success: true,
      message: `Document field "${field.name}" deleted successfully.`,
    });
  } catch (error) {
    console.error('Error deleting document field:', error);
    res.status(500).json({ message: 'Failed to delete document field', error: error.message });
  }
};

/**
 * @desc Toggle active status of a document field
 * @route PATCH /api/documents/fields/:id/toggle
 * @access Private (Admin / HR)
 */
const toggleDocumentFieldActive = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin';
    const companyId = req.user.company?._id || req.user.company;

    const query = { _id: req.params.id };
    if (!isSuperAdmin && companyId) {
      query.$or = [{ company: companyId }, { company: null }, { company: { $exists: false } }];
    }

    const field = await DocumentFieldConfig.findOne(query);
    if (!field) {
      return res.status(404).json({ message: 'Document field configuration not found.' });
    }

    field.isActive = !field.isActive;
    field.updatedBy = req.user._id;
    await field.save();

    res.json({
      success: true,
      message: `Field "${field.name}" is now ${field.isActive ? 'Active' : 'Disabled'}.`,
      data: field,
    });
  } catch (error) {
    console.error('Error toggling document field:', error);
    res.status(500).json({ message: 'Failed to toggle status', error: error.message });
  }
};

/**
 * @desc Reset / Seed default KYC document templates
 * @route POST /api/documents/fields/seed-defaults
 * @access Private (Admin / HR)
 */
const seedDefaultDocumentFields = async (req, res) => {
  try {
    const companyId = req.user.company?._id || req.user.company;
    if (!companyId) {
      return res.status(400).json({ message: 'Company identification missing.' });
    }

    const templates = getDefaultDocumentTemplates(companyId, req.user._id);

    // Insert only if not already present by name
    let addedCount = 0;
    for (const tpl of templates) {
      const exists = await DocumentFieldConfig.findOne({
        company: companyId,
        name: { $regex: new RegExp(`^${tpl.name}$`, 'i') },
      });
      if (!exists) {
        await DocumentFieldConfig.create(tpl);
        addedCount++;
      }
    }

    const allFields = await DocumentFieldConfig.find({ company: companyId }).sort({ order: 1, createdAt: 1 });

    res.json({
      success: true,
      message: `Seeded ${addedCount} standard KYC document templates.`,
      data: allFields,
    });
  } catch (error) {
    console.error('Error seeding document fields:', error);
    res.status(500).json({ message: 'Failed to seed document fields', error: error.message });
  }
};

module.exports = {
  getMyDocuments,
  uploadMyDocument,
  deleteMyDocument,
  getAllDocuments,
  reviewDocument,
  adminDeleteDocument,
  downloadUserDocumentsZip,
  downloadSingleDocument,
  getDocumentFields,
  createDocumentField,
  updateDocumentField,
  deleteDocumentField,
  toggleDocumentFieldActive,
  seedDefaultDocumentFields,
};
