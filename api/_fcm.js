// /api/_fcm.js — Shared FCM helper used by every API endpoint that
// needs to fire a push notification to Super Admin's PWA.
//
// Uses firebase-admin to:
//   (1) Query Firestore (with admin creds) for the fcmToken on every
//       profile where role='super_admin'
//   (2) Send a Web Push notification to each token via FCM HTTP v1
//
// Cached across warm invocations so we don't re-init firebase-admin
// on every call. notifySuperAdmins() is a no-op (logs a warning) when
// FIREBASE_SERVICE_ACCOUNT_JSON env var isn't set, so the chat and
// leads flows still work even before push is configured.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const APP_NAME = 'fcm-notifier';
let _ready = null;

function init() {
  if (_ready) return _ready;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    _ready = { configured: false };
    return _ready;
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (err) {
    console.error('[fcm] FIREBASE_SERVICE_ACCOUNT_JSON not valid JSON:', err);
    _ready = { configured: false };
    return _ready;
  }
  const existing = getApps().find((a) => a.name === APP_NAME);
  const app = existing || initializeApp({ credential: cert(serviceAccount) }, APP_NAME);
  _ready = {
    configured: true,
    db: getFirestore(app),
    messaging: getMessaging(app),
  };
  return _ready;
}

/**
 * Send a push to every super_admin profile that has an fcmToken.
 * Best-effort: returns { sent, failed }, never throws.
 *
 * @param {string} title  Notification title (short).
 * @param {string} body   Notification body.
 * @param {object} data   Optional data payload. Use `url` to
 *                        deep-link the SW notificationclick handler,
 *                        and `tag` to dedupe / group on the OS side.
 */
export async function notifySuperAdmins(title, body, data = {}) {
  const ctx = init();
  if (!ctx.configured) {
    console.warn('[fcm] notifySuperAdmins skipped — FIREBASE_SERVICE_ACCOUNT_JSON missing');
    return { sent: 0, failed: 0, skipped: true };
  }
  let tokens = [];
  try {
    const snap = await ctx.db.collection('profiles').where('role', '==', 'super_admin').get();
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (typeof d.fcmToken === 'string' && d.fcmToken.length > 10) tokens.push(d.fcmToken);
    });
  } catch (err) {
    console.error('[fcm] could not query super_admin profiles:', err);
    return { sent: 0, failed: 0, error: 'firestore' };
  }
  if (tokens.length === 0) {
    console.info('[fcm] no super_admin fcmTokens registered yet');
    return { sent: 0, failed: 0, empty: true };
  }

  const link = data.url || 'https://app.traxn.in/super-admin';
  const tag = data.tag || 'super-admin-alert';

  const results = await Promise.allSettled(
    tokens.map((token) =>
      ctx.messaging.send({
        token,
        notification: { title, body },
        data: {
          url: link,
          tag,
          ...Object.fromEntries(
            Object.entries(data).filter(([k]) => k !== 'url' && k !== 'tag')
          ),
        },
        webpush: {
          fcmOptions: { link },
          headers: { Urgency: 'high' },
        },
      })
    )
  );
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - sent;
  if (failed) {
    // Log failures but don't fail the caller — push is best-effort.
    results.forEach((r) => {
      if (r.status === 'rejected') console.warn('[fcm] send failed:', r.reason && r.reason.message);
    });
  }
  return { sent, failed };
}
