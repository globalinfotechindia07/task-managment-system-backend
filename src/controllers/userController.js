const User = require('../models/User');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'Team Head') {
      filter.teamHead = req.user._id;
    } else if (req.user.role === 'HR Manager') {
      filter.role = { $ne: 'Admin' };
    }

    const users = await User.find(filter).select('-password').populate('teamHead', 'name email');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new user (Add User)
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res) => {
  const { name, email, password, role, designation, status, department, teamHead } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      password, // Password will be hashed by pre-save hook
      role,
      designation,
      status,
      department: role === 'User' ? department : undefined,
      teamHead: role === 'User' ? (req.user.role === 'Team Head' ? req.user._id : teamHead) : undefined,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        designation: user.designation,
        status: user.status,
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

    if (user) {
      // Check if Team Head is updating someone else's user
      if (req.user.role === 'Team Head' && user.teamHead?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to update this user' });
      }

      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      if (req.body.password) {
        user.password = req.body.password;
      }
      user.role = req.body.role || user.role;
      user.designation = req.body.designation || user.designation;
      user.status = req.body.status || user.status;
      
      
      if (user.role === 'User') {
        user.department = req.body.department || user.department || 'IT';
        
        // Handle teamHead if it's sent as a populated object
        let th = req.body.teamHead;
        if (th && typeof th === 'object' && th._id) {
            th = th._id;
        }
        user.teamHead = th || user.teamHead || req.user._id;
      } else {
        user.department = undefined;
        user.teamHead = undefined;
      }

      const updatedUser = await user.save();
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        designation: updatedUser.designation,
        status: updatedUser.status,
        department: updatedUser.department,
        teamHead: updatedUser.teamHead,
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
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

    if (user) {
      if (user.role === 'Admin') {
        return res.status(403).json({ message: 'Cannot delete an Admin user' });
      }
      
      await User.findByIdAndDelete(req.params.id);
      res.json({ message: 'User removed successfully' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
