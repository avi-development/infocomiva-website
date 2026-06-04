// /api/notify-lead — fire a push notification when a lead lands via
// the home-page contact form. The form writes the lead doc directly
// to Firestore from the browser (existing behaviour), then calls this
// endpoint to fan out FCM pushes to Super Admin.
//
// Unauthenticated by design (the form is on a public page). Naive
// per-IP rate limit guards against spam.

import { notifySuperAdmins } from './_fcm.js';

const ipHits = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 6) return false;
  arr.push(now);
  ipHits.set(ip, arr);
  return true;
}

function clean(v, max) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Rate limited' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const name    = clean(body.name, 120);
  const phone   = clean(body.phone, 40);
  const message = clean(body.message, 200);
  const source  = clean(body.source, 60);

  if (!name && !phone) return res.status(400).json({ error: 'Nothing to notify on.' });

  try {
    const summary = `${name || 'Someone'} (${phone || 'no phone'})` +
      (message ? ` — ${message.slice(0, 80)}` : '') +
      (source ? ` [${source}]` : '');
    await notifySuperAdmins(
      '🆕 New lead',
      summary,
      { url: 'https://app.traxn.in/super-admin', tag: 'new-lead' },
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[notify-lead] failed:', err);
    return res.status(500).json({ error: 'Notify failed' });
  }
}
