// /api/submit-lead — Vercel serverless function
//
// Verifies the session token issued by /api/verify-otp, then writes
// the captured chat fields to the same Firestore /leads collection
// the home-page contact form already uses. The session token proves
// the email was OTP-verified, so we mark emailVerified=true on the
// stored lead — Super Admin's Leads inbox can prioritise these
// over un-verified webform leads.
//
// Uses the public Firebase Web SDK with the same cargologic-saas
// project config. /leads has open-create Firestore rules already.

import crypto from 'node:crypto';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAmJKD3Saep17Ij4jWN2vgZSypk17VjuZg',
  authDomain: 'cargologic-saas.firebaseapp.com',
  projectId: 'cargologic-saas',
  storageBucket: 'cargologic-saas.firebasestorage.app',
  messagingSenderId: '1005412538844',
  appId: '1:1005412538844:web:26e6ce0ae52c6065c3d719',
};

// Cache the Firebase app across warm invocations.
let _app = null;
function db() {
  if (!_app) _app = initializeApp(FIREBASE_CONFIG, 'submit-lead-' + Date.now());
  return getFirestore(_app);
}

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

  try {
    await addDoc(collection(db(), 'leads'), {
      // Mirror the existing /leads schema used by the home-page form
      // so Super Admin renders these identically.
      name: businessName,             // "Name" column on Super Admin
      company: businessName,          // mirror, since chat treats them as the same input
      phone,
      email,
      message: projectDesc,
      fleetSize: businessType,        // reuse the "Fleet" column for "business type"
      escalateToOwner: escalate,
      emailVerified: true,
      source: 'infocomiva.live' + sourcePath + ' [chat-otp]',
      status: 'new',
      createdAt: serverTimestamp(),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[submit-lead] write failed:', err);
    return res.status(500).json({ error: 'Could not save your details. Please WhatsApp +91 89188 97474.' });
  }
}
