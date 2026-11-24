const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { documentUpload } = require('../middleware/documentUploadMiddleware');
const {
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
} = require('../controllers/documentController');

// Role & Permission guard for viewing employee documents
const authorizeDocumentView = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const role = (req.user.role || '').toLowerCase();
  if (
    role === 'admin' ||
    role === 'super admin' ||
    role === 'cto' ||
    role === 'hr manager' ||
    role === 'hr' ||
    role === 'accountant'
  ) {
    return next();
  }

  // Check granular permission
  if (req.user.permissions?.documents?.view) {
    return next();
  }

  return res.status(403).json({
    message: 'Access Denied: You do not have permission to view employee documents.',
  });
};

// Role & Permission guard for reviewing (Approve/Reject)
const authorizeDocumentReview = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const role = (req.user.role || '').toLowerCase();
  if (
    role === 'admin' ||
    role === 'super admin' ||
    role === 'cto' ||
    role === 'hr manager' ||
    role === 'hr'
  ) {
    return next();
  }

  // Check granular permission
  if (
    req.user.permissions?.documents?.edit ||
    req.user.permissions?.documents?.create
  ) {
    return next();
  }

  return res.status(403).json({
    message: 'Access Denied: You do not have permission to approve or reject employee documents.',
  });
};

// Role guard for deletion
const authorizeDocumentDelete = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const role = (req.user.role || '').toLowerCase();
  if (role === 'admin' || role === 'super admin' || role === 'cto') {
    return next();
  }

  if (req.user.permissions?.documents?.delete) {
    return next();
  }

  return res.status(403).json({
    message: 'Access Denied: Only Admins can permanently delete verified employee records.',
  });
};

/* ==========================================
   Document Field Configurations (Dynamic Fields)
   ========================================== */
router.get('/fields', protect, getDocumentFields);
router.post('/fields', protect, authorizeDocumentReview, createDocumentField);
router.put('/fields/:id', protect, authorizeDocumentReview, updateDocumentField);
router.delete('/fields/:id', protect, authorizeDocumentReview, deleteDocumentField);
router.patch('/fields/:id/toggle', protect, authorizeDocumentReview, toggleDocumentFieldActive);
router.post('/fields/seed-defaults', protect, authorizeDocumentReview, seedDefaultDocumentFields);

/* ==========================================
   Employee Self-Service Document Routes
   ========================================== */
router.get('/my', protect, getMyDocuments);
router.post('/my', protect, documentUpload.single('file'), uploadMyDocument);
router.delete('/my/:id', protect, deleteMyDocument);

/* ==========================================
   Admin / HR / Accountant Management Routes
   ========================================== */
router.get('/admin/all', protect, authorizeDocumentView, getAllDocuments);
router.put('/admin/review/:id', protect, authorizeDocumentReview, reviewDocument);
router.delete('/admin/:id', protect, authorizeDocumentDelete, adminDeleteDocument);

/* ==========================================
   File Direct Device Download Route
   ========================================== */
router.get('/download-file/:id', protect, downloadSingleDocument);

/* ==========================================
   ZIP Batch Download Routes
   ========================================== */
router.get('/admin/download-zip/:userId', protect, authorizeDocumentView, downloadUserDocumentsZip);
router.post('/admin/download-zip-batch', protect, authorizeDocumentView, downloadUserDocumentsZip);

module.exports = router;
