const User = require('../models/User');
const Company = require('../models/Company');
const Role = require('../models/Role');

// @desc    Get all users (Scoped to tenant office, or all if Super Admin)
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    const filter = {};

    // 1. Strict Multi-Tenant Scoping:
    // If not Super Admin, strictly filter by logged-in user's company
    if (req.user.role !== 'Super Admin') {
      const companyId = req.companyId || req.user.company?._id || req.user.company;
      if (!companyId) {
        return res.json([]);
      }
      filter.company = companyId;

      // 2. Role-specific scoping inside the office:
      if (req.user.role === 'Admin' || req.user.role === 'CTO') {
        // Office Admin manages all staff positions in their company
        if (req.query.role && !['Admin', 'Super Admin'].includes(req.query.role)) {
          filter.role = req.query.role;
        } else {
          // Exclude other platform/office admins from employee list
          filter.role = { $nin: ['Admin', 'Super Admin'] };
        }
      } else if (req.user.role === 'HR Manager' || req.user.role === 'HR') {
        // HR only monitors staff under their office. Admins are strictly excluded
        if (req.query.role && !['Admin', 'Super Admin'].includes(req.query.role)) {
          filter.role = req.query.role;
        } else {
          filter.role = { $nin: ['Admin', 'Super Admin'] };
        }
      } else if (req.user.role === 'Team Head' || req.user.role === 'Team Lead') {
        filter.$or = [
          { teamHead: req.user._id },
          { _id: req.user._id }
        ];
      } else if (req.user.role === 'User' || req.user.role === 'Employee') {
        filter._id = req.user._id;
      } else {
        // Custom roles with 'users.view' permission
        filter.role = { $nin: ['Admin', 'Super Admin'] };
      }
    } else if (req.query.company) {
      // Super Admin can filter by specific company if requested
      filter.company = req.query.company;
      if (req.query.role) filter.role = req.query.role;
    } else if (req.query.role) {
      filter.role = req.query.role;
    }

    const users = await User.find(filter)
      .select('-password')
      .populate('teamHead', 'name email')
      .populate('company', 'name companyCode status')
      .populate('roleRef', 'name displayName permissions');

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new user (Scoped to company + Employee Limit check)
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res) => {
  const { name, email, password, role, designation, status, department, teamHead, companyId } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Role validation: Non-Super Admin cannot create another Admin or Super Admin
    if (req.user.role !== 'Super Admin') {
      if (['Admin', 'Super Admin'].includes(role)) {
        return res.status(403).json({ message: 'Cannot create Administrator or Super Admin accounts' });
      }
    }

    // Determine target company:
    const targetCompanyId = req.user.role === 'Super Admin' 
      ? (companyId || req.companyId || req.user.company?._id || req.user.company) 
      : (req.companyId || req.user.company?._id || req.user.company);

    if (!targetCompanyId && req.user.role !== 'Super Admin') {
      return res.status(400).json({ message: 'User must belong to a company/office' });
    }

    // Check Company Subscription employee limit
    if (targetCompanyId) {
      const company = await Company.findById(targetCompanyId);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      if (company.status === 'Suspended') {
        return res.status(403).json({ message: 'Company account is suspended' });
      }

      const currentCount = await User.countDocuments({ company: targetCompanyId });
      const maxLimit = company.subscription?.maxEmployees || 20;

      if (maxLimit > 0 && currentCount >= maxLimit) {
        return res.status(403).json({
          message: `Employee limit of ${maxLimit} reached for this office plan. Please contact Super Admin to upgrade your subscription.`
        });
      }
    }

    // Find matching role document to attach roleRef
    let roleRefId = req.body.roleRef;
    if (!roleRefId && role && targetCompanyId) {
      const foundRole = await Role.findOne({
        company: targetCompanyId,
        $or: [{ name: role }, { displayName: role }]
      });
      if (foundRole) {
        roleRefId = foundRole._id;
      }
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      roleRef: roleRefId,
      designation: designation || 'Staff',
      status: status || 'Active',
      company: targetCompanyId,
      createdBy: req.user._id,
      department: department || undefined,
      teamHead: teamHead ? (typeof teamHead === 'object' ? teamHead._id : teamHead) : (req.user.role === 'Team Head' ? req.user._id : undefined),
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleRef: user.roleRef,
        designation: user.designation,
        status: user.status,
        company: user.company,
        department: user.department,
        teamHead: user.teamHead,
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Ensure non-super admin cannot edit users of another company
    const currentCompanyId = (req.companyId || req.user.company?._id || req.user.company || '').toString();
    const userCompanyId = (user.company?._id || user.company || '').toString();

    if (req.user.role !== 'Super Admin') {
      if (userCompanyId !== currentCompanyId) {
        return res.status(403).json({ message: 'Not authorized to edit a user from another office' });
      }

      // Non-Super Admin cannot elevate any user to Admin or Super Admin
      if (['Admin', 'Super Admin', 'CTO'].includes(req.body.role)) {
        return res.status(403).json({ message: 'Not authorized to set this administrative role' });
      }

      // Non-Super Admin cannot modify an Admin user
      if (['Admin', 'Super Admin'].includes(user.role)) {
        return res.status(403).json({ message: 'Cannot edit Office Admin or Super Admin' });
      }
    }

    // Check if Team Head is updating someone else's user
    if (req.user.role === 'Team Head' && user.teamHead?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this user' });
    }

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    if (req.body.password) {
      user.password = req.body.password;
    }

    if (req.body.role) {
      user.role = req.body.role;
      if (req.body.roleRef) {
        user.roleRef = req.body.roleRef;
      } else {
        const foundRole = await Role.findOne({
          company: user.company,
          $or: [{ name: req.body.role }, { displayName: req.body.role }]
        });
        if (foundRole) {
          user.roleRef = foundRole._id;
        }
      }
    }

    user.designation = req.body.designation || user.designation;
    user.status = req.body.status || user.status;

    if (req.body.department !== undefined) {
      user.department = req.body.department;
    }
    if (req.body.teamHead !== undefined) {
      let th = req.body.teamHead;
      if (th && typeof th === 'object' && th._id) {
        th = th._id;
      }
      user.teamHead = th || undefined;
    }

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      designation: updatedUser.designation,
      status: updatedUser.status,
      company: updatedUser.company,
      department: updatedUser.department,
      teamHead: updatedUser.teamHead,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentCompanyId = (req.companyId || req.user.company?._id || req.user.company || '').toString();
    const userCompanyId = (user.company?._id || user.company || '').toString();

    // Prevent non-super admin from deleting users of another company
    if (req.user.role !== 'Super Admin') {
      if (userCompanyId !== currentCompanyId) {
        return res.status(403).json({ message: 'Not authorized to delete a user from another office' });
      }

      if (['Admin', 'Super Admin'].includes(user.role)) {
        return res.status(403).json({ message: 'Only Super Admin can delete an Office Admin user' });
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
