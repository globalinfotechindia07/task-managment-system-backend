const express = require('express');
const router = express.Router();
const {
  getOfferLetters,
  getOfferLetterById,
  createOfferLetter,
  updateOfferLetter,
  deleteOfferLetter,
  updateOfferLetterStatus,
  sendOfferLetterEmail,
} = require('../controllers/offerLetterController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// Allow Admin, CTO, Super Admin, HR Manager, or anyone with users/payroll permissions
const authorizeOfferLetterAccess = (req, res, next) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'Not authorized' });

  const role = user.role || '';
  const r = role.toLowerCase();
  if (
    role === 'Super Admin' ||
    role === 'Admin' ||
    role === 'CTO' ||
    r.includes('hr') ||
    r.includes('human resource')
  ) {
    return next();
  }

  const perms = user.permissions || {};
  if (perms.users?.view || perms.payroll?.view || perms.users?.edit) {
    return next();
  }

  return res.status(403).json({ message: 'Access denied: You do not have permission to manage offer letters' });
};

router.use(authorizeOfferLetterAccess);

router.route('/')
  .get(getOfferLetters)
  .post(createOfferLetter);

router.route('/:id')
  .get(getOfferLetterById)
  .put(updateOfferLetter)
  .delete(deleteOfferLetter);

router.patch('/:id/status', updateOfferLetterStatus);
router.post('/:id/send-email', sendOfferLetterEmail);

module.exports = router;
