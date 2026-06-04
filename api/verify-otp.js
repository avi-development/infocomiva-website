// /api/verify-otp — Vercel serverless function
//
// Verifies the HMAC-signed token from /api/send-otp against the OTP
// the user typed. Returns a session token if it matches — the chat UI
// then hands that session token to /api/submit-lead so we know the
// lead was email-verified before being written to Firestore.
//
// Session token is also HMAC-signed (same OTP_SECRET), valid for 1
// hour. Self-contained — no DB.

import crypto from 'node:crypto';

const SESSION_EXP_SECONDS = 60 * 60; // 1 hour to complete the chat

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signPayload(payloadObj, secret) {
  const payload = JSON.stringify(payloadObj);
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  return b64url(payload) + '.' + b64url(sig);
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
  // Constant-time compare to avoid signature-timing leaks.
  if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;
  try { return JSON.parse(payloadRaw); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const SECRET = process.env.OTP_SECRET;
  if (!SECRET || SECRET.length < 32) {
    console.error('[verify-otp] OTP_SECRET missing');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = (body && body.email || '').trim().toLowerCase();
  const otp   = (body && body.otp   || '').toString().trim();
  const token =  body && body.token;

  if (!email || !otp || !token) {
    return res.status(400).json({ error: 'Missing fields.' });
  }

  const payload = verifyToken(token, SECRET);
  if (!payload) return res.status(400).json({ error: 'Invalid or tampered code.' });

  if (typeof payload.x !== 'number' || Math.floor(Date.now() / 1000) > payload.x) {
    return res.status(400).json({ error: 'Code expired. Request a new one.' });
  }
  if (payload.e !== email) {
    return res.status(400).json({ error: 'Email mismatch. Request a new code.' });
  }

  const otpHash = crypto.createHash('sha256').update(otp + '|' + email + '|' + SECRET).digest('hex');
  // Constant-time string compare via timingSafeEqual on equal-length buffers.
  const a = Buffer.from(otpHash, 'hex');
  const b = Buffer.from(payload.h || '', 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(400).json({ error: 'Wrong code. Try again.' });
  }

  // Issue a 1-hour session token the client uses on /api/submit-lead.
  const sessionExp = Math.floor(Date.now() / 1000) + SESSION_EXP_SECONDS;
  const sessionToken = signPayload({ e: email, v: true, x: sessionExp }, SECRET);

  return res.status(200).json({ verified: true, sessionToken, expiresIn: SESSION_EXP_SECONDS });
}
