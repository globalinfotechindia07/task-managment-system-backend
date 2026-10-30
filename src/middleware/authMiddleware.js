const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getUserPermissions } = require('../utils/roleDefaults');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
      req.user = await User.findById(decoded.id).select('-password').populate('company');
      if (!req.user) {
        return res.status(401).json({ message: 'User not found, please log in again' });
      }
      req.companyId = req.user.company?._id || req.user.company || null;
      req.user.permissions = await getUserPermissions(req.user);
      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Not authorized, token expired' });
      }
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Super Admin and Admin always have full system access
    if (req.user.role === 'Super Admin' || req.user.role === 'Admin') {
      return next();
    }

    if (roles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({ 
      message: `User role '${req.user.role}' is not authorized to access this route` 
    });
  };
};

const authorizePermission = (moduleName, action = 'view') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Super Admin and Admin always have full system access
    if (req.user.role === 'Super Admin' || req.user.role === 'Admin') {
      return next();
    }

    const modulePerms = req.user.permissions?.[moduleName];
    if (modulePerms && modulePerms[action]) {
      return next();
    }

    return res.status(403).json({
      message: `Access Denied: You do not have '${action}' permission for '${moduleName}'`
    });
  };
};

module.exports = { protect, authorizeRoles, authorizePermission };
