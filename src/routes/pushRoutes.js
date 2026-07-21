const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { publicVapidKey } = require('../utils/pushService');

// Usually we'd want to protect this with authentication middleware
// But we'll trust the user ID sent from the frontend for this demo if auth isn't applied yet
router.post('/subscribe', async (req, res) => {
  try {
    const { userId, subscription } = req.body;

    if (!userId || !subscription) {
      return res.status(400).json({ message: 'User ID and subscription object are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if subscription already exists to avoid duplicates
    const existingSub = user.pushSubscriptions.find(sub => sub.endpoint === subscription.endpoint);
    
    if (!existingSub) {
      user.pushSubscriptions.push(subscription);
      await user.save();
    }

    res.status(201).json({ message: 'Subscribed to push notifications successfully' });
  } catch (error) {
    console.error('Error subscribing to push:', error);
    res.status(500).json({ message: 'Server error during subscription' });
  }
});

router.get('/vapidPublicKey', (req, res) => {
  res.json({ publicKey: publicVapidKey });
});

module.exports = router;
