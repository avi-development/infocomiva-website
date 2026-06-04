// /api/chat-start — Vercel serverless function
//
// Called by the estimator chat panel when the visitor picks
// "Yes, connect me now" at the escalation step. Verifies the OTP
// session token, creates a chatThreads/{uuid} document via Firestore
// REST, then returns a signed threadToken that the visitor's browser
// uses on subsequent /api/chat-send + /api/chat-poll calls.
//
// Thread schema (matches firestore.rules whitelist):
//   email, name, company, phone, businessType, projectDesc,
//   source, status='open', createdAt, lastMessageAt, unreadByAdmin

import crypto from 'node:crypto';

const PROJECT_ID = 'cargologic-saas';
const PUBLIC_API_KEY = 'AIzaSyAmJKD3Saep17Ij4jWN2vgZSypk17VjuZg';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const THREAD_TOKEN_EXP_SECONDS = 24 * 60 * 60; // visitor can keep chatting for 24 h

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
  if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;
  try { return JSON.parse(payloadRaw); } catch { return null; }
}

function clean(v, max) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

// Firestore REST typed-value wrapper.
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
    console.error('[chat-start] OTP_SECRET missing');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  // Reuse the OTP session token — same one /api/submit-lead requires.
  const payload = verifyToken(body && body.sessionToken, SECRET);
  if (!payload || !payload.v) return res.status(401).json({ error: 'Verify your email first.' });
  if (typeof payload.x !== 'number' || Math.floor(Date.now() / 1000) > payload.x) {
    return res.status(401).json({ error: 'Session expired. Verify your email again.' });
  }

  const email        = clean(payload.e, 200);
  const businessName = clean(body.businessName, 120);
  const phone        = clean(body.phone, 40);
  const businessType = clean(body.businessType, 60);
  const projectDesc  = clean(body.projectDesc, 2000);
  const sourcePath   = clean(body.sourcePath || '/estimator/', 80);

  if (!email || !businessName || !phone) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Deterministic threadId = HMAC(email + OTP_SECRET).slice(0, 32).
  // Same email → same threadId, every time, on every device. So when
  // the visitor verifies again or returns later, they land on the SAME
  // conversation thread instead of opening a fresh one each visit.
  // Using HMAC (not a plain hash) means email-to-threadId can't be
  // brute-forced without the server-side OTP_SECRET.
  const threadId = crypto
    .createHmac('sha256', SECRET)
    .update('thread|' + email)
    .digest('hex')
    .slice(0, 32);
  const threadDocUrl = `${FS_BASE}/chatThreads/${threadId}?key=${PUBLIC_API_KEY}`;
  const now = new Date();

  // Check if a thread for this email already exists.
  let existing = null;
  try {
    const lookupRes = await fetch(threadDocUrl, { method: 'GET' });
    if (lookupRes.ok) {
      existing = await lookupRes.json().catch(() => null);
    } else if (lookupRes.status !== 404) {
      const errText = await lookupRes.text().catch(() => '<unreadable>');
      console.warn('[chat-start] thread lookup non-OK', lookupRes.status, errText);
    }
  } catch (err) {
    console.warn('[chat-start] thread lookup threw (non-fatal):', err);
  }

  if (existing && existing.fields) {
    // Thread already exists for this email. Reuse it. If it was
    // closed previously, REOPEN it so the visitor can continue the
    // conversation rather than starting fresh. Also bump the lead-
    // info fields in case the visitor entered different details this
    // round (new project description, new phone, etc.).
    const patchUrl = threadDocUrl +
      '&updateMask.fieldPaths=name' +
      '&updateMask.fieldPaths=company' +
      '&updateMask.fieldPaths=phone' +
      '&updateMask.fieldPaths=businessType' +
      '&updateMask.fieldPaths=projectDesc' +
      '&updateMask.fieldPaths=status' +
      '&updateMask.fieldPaths=lastMessageAt' +
      '&updateMask.fieldPaths=unreadByAdmin';
    const patchDoc = {
      fields: {
        name:          f(businessName),
        company:       f(businessName),
        phone:         f(phone),
        businessType:  f(businessType || '(not provided)'),
        projectDesc:   f(projectDesc || '(not provided)'),
        status:        f('open'),
        lastMessageAt: f(now),
        unreadByAdmin: f(true),
      },
    };
    try {
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patchDoc),
      });
      if (!patchRes.ok) {
        const errText = await patchRes.text().catch(() => '<unreadable>');
        console.warn('[chat-start] thread reopen patch failed (non-fatal)', patchRes.status, errText);
        // Non-fatal — we still return the threadToken and let visitor
        // start chatting. Admin will see the old thread metadata.
      }
    } catch (err) {
      console.warn('[chat-start] thread reopen patch threw (non-fatal):', err);
    }
  } else {
    // First-time thread for this email. Create from scratch.
    const document = {
      fields: {
        email:         f(email),
        name:          f(businessName),
        company:       f(businessName),
        phone:         f(phone),
        businessType:  f(businessType || '(not provided)'),
        projectDesc:   f(projectDesc || '(not provided)'),
        source:        f('infocomiva.live' + sourcePath + ' [chat]'),
        status:        f('open'),
        createdAt:     f(now),
        lastMessageAt: f(now),
        unreadByAdmin: f(true),
      },
    };
    try {
      const fsRes = await fetch(threadDocUrl, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(document),
      });
      if (!fsRes.ok) {
        const errText = await fsRes.text().catch(() => '<unreadable>');
        console.error('[chat-start] Firestore PATCH failed', fsRes.status, errText);
        let detail = errText;
        try {
          const parsed = JSON.parse(errText);
          detail = (parsed.error && (parsed.error.message || parsed.error.status)) || errText;
        } catch { /* leave */ }
        return res.status(500).json({
          error: 'Could not open chat (' + String(detail).slice(0, 220) + ').',
        });
      }
    } catch (err) {
      console.error('[chat-start] write threw:', err);
      return res.status(500).json({
        error: 'Network error opening chat (' + (err && err.message || String(err)).slice(0, 200) + ').',
      });
    }
  }

  // Sign a threadToken — the visitor's browser uses this on
  // /api/chat-send + /api/chat-poll. Carries threadId + email + expiry.
  const threadToken = signPayload({
    t: threadId,
    e: email,
    x: Math.floor(Date.now() / 1000) + THREAD_TOKEN_EXP_SECONDS,
  }, SECRET);

  return res.status(200).json({
    ok: true,
    threadId,
    threadToken,
    expiresIn: THREAD_TOKEN_EXP_SECONDS,
  });
}
