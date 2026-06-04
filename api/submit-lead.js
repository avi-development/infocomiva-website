// /api/submit-lead — Vercel serverless function
//
// Verifies the session token issued by /api/verify-otp, then writes
// the captured chat fields to Firestore /leads via the REST API.
// No firebase npm dependency — just fetch + crypto. Cold starts are
// ~10x faster than the Web SDK approach and we don't hit the gRPC /
// WebSocket transport headaches that the SDK can run into inside
// Lambda. The /leads collection already allows public create per the
// existing Firestore rules (same path the home-page contact form
// uses from the browser).

import crypto from 'node:crypto';

const PROJECT_ID = 'cargologic-saas';
// Public web API key — same one shipped in every HTML page's Firebase
// config. The Firestore REST API requires SOME form of project
// identification: either an Authorization: Bearer token (Firebase Auth
// ID token or Google service account) or the web API key on the query
// string. Without it the request is rejected as "Missing or
// insufficient permissions" before the security rules even run.
// Safe to commit because:
//   - It's already in every public page's HTML
//   - Firestore security rules are the actual auth layer; the API
//     key only identifies the project so rules can apply
const PUBLIC_API_KEY = 'AIzaSyAmJKD3Saep17Ij4jWN2vgZSypk17VjuZg';
const FIRESTORE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/leads?key=${PUBLIC_API_KEY}`;

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;
  let payloadRaw;
  try { payloadRaw = b64urlDecode(payloadB64).toString('utf8'); } catch { return null; }
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadRaw).digest();
  let providedSig;
  try { providedSig = b64urlDecode(sigB64); } catch { return null; }
  if (expectedSig.length !== providedSig.length) return null;
  if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;
  try { return JSON.parse(payloadRaw); } catch { return null; }
}

function clean(v, max) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

// Firestore REST API field encoding. Each field is wrapped in a typed
// object: { stringValue, booleanValue, timestampValue, ... }. We do
// only the types we need; extend if you add more fields.
function f(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  return { stringValue: String(value) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const SECRET = process.env.OTP_SECRET;
  if (!SECRET || SECRET.length < 32) {
    console.error('[submit-lead] OTP_SECRET missing');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const sessionToken = body && body.sessionToken;
  const payload = verifyToken(sessionToken, SECRET);
  if (!payload || !payload.v) {
    return res.status(401).json({ error: 'Verify your email first.' });
  }
  if (typeof payload.x !== 'number' || Math.floor(Date.now() / 1000) > payload.x) {
    return res.status(401).json({ error: 'Session expired. Verify your email again.' });
  }

  const email        = clean(payload.e, 200);
  const businessName = clean(body.businessName, 200);
  const phone        = clean(body.phone, 40);
  const businessType = clean(body.businessType, 200);
  const projectDesc  = clean(body.projectDesc, 2000);
  const escalate     = !!body.escalate;
  const sourcePath   = clean(body.sourcePath || '/estimator/', 300);

  if (!businessName || !phone) {
    return res.status(400).json({ error: 'Business name and phone are required.' });
  }

  // Mirror the schema the home-page form already writes so Super Admin
  // renders these identically. fleetSize column reused for businessType
  // since chats don't ask for fleet size.
  const document = {
    fields: {
      name:            f(businessName),
      company:         f(businessName),
      phone:           f(phone),
      email:           f(email),
      message:         f(projectDesc),
      fleetSize:       f(businessType),
      escalateToOwner: f(escalate),
      emailVerified:   f(true),
      source:          f('infocomiva.live' + sourcePath + ' [chat-otp]'),
      status:          f('new'),
      createdAt:       f(new Date()),
    },
  };

  try {
    const fsRes = await fetch(FIRESTORE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(document),
    });
    if (!fsRes.ok) {
      const errText = await fsRes.text().catch(() => '<unreadable>');
      console.error('[submit-lead] Firestore REST failed', fsRes.status, errText);
      // Surface the real error in the response for now — pull this
      // back to a generic message once write is reliably succeeding.
      let detail = errText;
      try {
        const parsed = JSON.parse(errText);
        detail = (parsed.error && (parsed.error.message || parsed.error.status)) || errText;
      } catch { /* leave as-is */ }
      return res.status(500).json({
        error: 'Could not save your details (' + String(detail).slice(0, 220) + '). Please WhatsApp +91 89188 97474.',
      });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[submit-lead] write threw:', err);
    return res.status(500).json({
      error: 'Network error saving your details (' + (err && err.message || String(err)).slice(0, 200) + '). Please WhatsApp +91 89188 97474.',
    });
  }
}
