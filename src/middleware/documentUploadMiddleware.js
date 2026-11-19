const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads and uploads/documents directory exists
const uploadDir = path.join(__dirname, '../../uploads');
const documentsDir = path.join(uploadDir, 'documents');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, documentsDir);
  },
  filename: function (req, file, cb) {
    const cleanExt = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, cleanExt).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `doc_${cleanBase}_${uniqueSuffix}${cleanExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExts = /\.(pdf|jpg|jpeg|png|webp|doc|docx)$/i;
  const isExtValid = allowedExts.test(path.extname(file.originalname).toLowerCase());
  
  if (isExtValid) {
    return cb(null, true);
  }
  return cb(new Error('Only PDF, JPG, PNG, WEBP, and DOC files are permitted for documents.'));
};

const documentUpload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB limit
  },
  fileFilter,
});

module.exports = {
  documentUpload,
  documentsDir,
};
