const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const EmployeeDocument = require('../models/EmployeeDocument');
const User = require('../models/User');
const { documentsDir } = require('../middleware/documentUploadMiddleware');
const { logAudit } = require('../utils/auditLogger');

/**
 * @desc Get all documents uploaded by logged-in employee
 * @route GET /api/documents/my
 * @access Private (All authenticated users)
 */
const getMyDocuments = async (req, res) => {
  try {
    const documents = await EmployeeDocument.find({ user: req.user._id })
      .populate('reviewedBy', 'name email role')
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
 * @desc Upload a document by logged-in employee
 * @route POST /api/documents/my
 * @access Private (All authenticated users)
 */
const uploadMyDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please select a file to upload.' });
    }

    const { documentType, customTitle, documentNumber, notes, expiryDate } = req.body;

    const fileUrl = `/uploads/documents/${req.file.filename}`;

    const newDocument = await EmployeeDocument.create({
      user: req.user._id,
      company: req.user.company?._id || req.user.company || null,
      documentType: documentType || 'Other Document',
      customTitle: customTitle || '',
      documentNumber: documentNumber || '',
      fileUrl,
      fileName: req.file.filename,
      originalFileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
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
        fileName: req.file.originalname,
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
          (d.documentNumber && d.documentNumber.toLowerCase().includes(q))
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

module.exports = {
  getMyDocuments,
  uploadMyDocument,
  deleteMyDocument,
  getAllDocuments,
  reviewDocument,
  adminDeleteDocument,
  downloadUserDocumentsZip,
  downloadSingleDocument,
};
