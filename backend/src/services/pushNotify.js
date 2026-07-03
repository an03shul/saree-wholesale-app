const webpush = require('web-push');
const db = require('../db/database');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@gopiramsarees.in'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendToSubs(subs, payload) {
  const dead = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) dead.push(sub.endpoint);
      else console.error('Push send error:', e.message);
    }
  }
  if (dead.length) {
    const del = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
    dead.forEach(ep => del.run(ep));
  }
}

// Notify every subscribed device.
async function notifyAll(payload) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  await sendToSubs(db.prepare('SELECT * FROM push_subscriptions').all(), payload);
}

// Notify only the given user's devices (used for task assignments so we don't
// spam the whole shop). No-op if the user has no registered subscriptions.
async function notifyUser(userId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !userId) return;
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  await sendToSubs(subs, payload);
}

module.exports = { notifyAll, notifyUser };
