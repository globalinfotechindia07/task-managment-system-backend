const webpush = require('web-push');

// Generate VAPID keys using `npx web-push generate-vapid-keys`
// For production, these should be in environment variables
const publicVapidKey = 'BFZaVCTynePxl1Spa6qCOLOxjaN4Q1btCAcQuwelS65yyYzjX9L0wOoKsLxK0sj-wnLH2jtZ8e2akd0a4CbFqZk';
const privateVapidKey = '5OpSOo4sIU95Ajwd-M0IsoOrVj9MTRc_wQksJYNOa7M';

webpush.setVapidDetails(
  'mailto:globalinfotechindia07@gmail.com',
  publicVapidKey,
  privateVapidKey
);

/**
 * Send push notification to a specific user
 * @param {Object} user - The user object from database
 * @param {Object} payload - { title, body, url }
 */
const sendNotificationToUser = async (user, payload) => {
  if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
    return;
  }

  const notificationPayload = JSON.stringify(payload);

  const notifications = user.pushSubscriptions.map(sub => 
    webpush.sendNotification(sub, notificationPayload).catch(error => {
      console.error('Error sending push notification:', error);
    })
  );

  await Promise.allSettled(notifications);
};

module.exports = {
  sendNotificationToUser,
  publicVapidKey
};
