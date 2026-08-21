const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', {
    expiresIn: '30d',
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
  const { email, password } = req.body;
  
  console.log(`\n--- Login Attempt ---`);
  console.log(`Email provided: ${email}`);

  try {
    const user = await User.findOne({ email });
    console.log(`User found in DB: ${user ? 'Yes' : 'No'}`);

    if (user && (await user.matchPassword(password))) {
      console.log(`Password matched for user: ${email}`);
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        designation: user.designation,
        profilePicture: user.profilePicture,
        requiresPasswordChange: user.requiresPasswordChange,
        token: generateToken(user._id),
      });
    } else {
      console.log(`Password match failed or user not found`);
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(`Error during login:`, error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation,
      phone: user.phone,
      profilePicture: user.profilePicture,
      requiresPasswordChange: user.requiresPasswordChange,
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Force password change
// @route   PUT /api/auth/force-password-change
// @access  Private
const forcePasswordChange = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    if (req.body.password) {
      user.password = req.body.password;
      user.requiresPasswordChange = false;
      const updatedUser = await user.save();
      
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        designation: updatedUser.designation,
        profilePicture: updatedUser.profilePicture,
        requiresPasswordChange: updatedUser.requiresPasswordChange,
        token: generateToken(updatedUser._id),
      });
    } else {
      res.status(400).json({ message: 'Please provide a new password' });
    }
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.phone = req.body.phone || user.phone;
    
    if (req.body.password) {
      if (!req.body.oldPassword) {
         return res.status(400).json({ message: 'Please provide current password to change it' });
      }
      const isMatch = await user.matchPassword(req.body.oldPassword);
      if (!isMatch) {
         return res.status(401).json({ message: 'Invalid current password' });
      }
      user.password = req.body.password;
    }

    if (req.file) {
      user.profilePicture = `/uploads/${req.file.filename}`;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      designation: updatedUser.designation,
      phone: updatedUser.phone,
      profilePicture: updatedUser.profilePicture,
      requiresPasswordChange: updatedUser.requiresPasswordChange,
      token: generateToken(updatedUser._id),
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

module.exports = { authUser, getUserProfile, forcePasswordChange, updateUserProfile };
