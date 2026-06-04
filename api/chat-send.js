// /api/chat-send — Vercel serverless function
//
// Visitor posts a message to their chat thread. Verifies the
// threadToken (issued by /api/chat-start), then writes a message
// document to chatThreads/{threadId}/messages with from='visitor'
// and updates the parent thread's lastMessageAt + unreadByAdmin.

import crypto from 'node:crypto';

const PROJECT_ID = 'cargologic-saas';
const PUBLIC_API_KEY = 'AIzaSyAmJKD3Saep17Ij4jWN2vgZSypk17VjuZg';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

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
function f(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  return { stringValue: String(value) };
}

// Naive per-IP rate limit in warm-instance memory: 30 messages / minute.
const ipHits = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 30) return false;
  arr.push(now);
  ipHits.set(ip, arr);
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const SECRET = process.env.OTP_SECRET;
  if (!SECRET || SECRET.length < 32) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const payload = verifyToken(body && body.threadToken, SECRET);
  if (!payload || !payload.t) return res.status(401).json({ error: 'Invalid chat session.' });
  if (typeof payload.x !== 'number' || Math.floor(Date.now() / 1000) > payload.x) {
    return res.status(401).json({ error: 'Chat session expired.' });
  }

  const text = ((body && body.text) || '').toString().trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Empty message.' });

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Too many messages. Slow down.' });

  const threadId = payload.t;
  const now = new Date();

  // Append a message to chatThreads/{threadId}/messages via createDocument
  // (Firestore auto-generates the message doc ID).
  const messageDoc = {
    fields: {
      from: f('visitor'),
      text: f(text),
      createdAt: f(now),
    },
  };
  const msgUrl = `${FS_BASE}/chatThreads/${threadId}/messages?key=${PUBLIC_API_KEY}`;

  try {
    const msgRes = await fetch(msgUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(messageDoc),
    });
    if (!msgRes.ok) {
      const errText = await msgRes.text().catch(() => '<unreadable>');
      console.error('[chat-send] Firestore message write failed', msgRes.status, errText);
      let detail = errText;
      try {
        const parsed = JSON.parse(errText);
        detail = (parsed.error && (parsed.error.message || parsed.error.status)) || errText;
      } catch { /* leave */ }
      return res.status(500).json({ error: 'Could not send message (' + String(detail).slice(0, 220) + ').' });
    }
  } catch (err) {
    console.error('[chat-send] message write threw:', err);
    return res.status(500).json({ error: 'Network error: ' + (err && err.message || String(err)).slice(0, 200) });
  }

  // Best-effort thread metadata bump. Fire-and-forget — if the parent
  // patch fails, we don't fail the user's send (their message still
  // landed). Super Admin can still see threads ordered by createdAt as
  // a fallback.
  const threadPatchUrl =
    `${FS_BASE}/chatThreads/${threadId}?key=${PUBLIC_API_KEY}` +
    '&updateMask.fieldPaths=lastMessageAt&updateMask.fieldPaths=unreadByAdmin';
  const threadPatchDoc = {
    fields: {
      lastMessageAt: f(now),
      unreadByAdmin: f(true),
    },
  };
  // Don't await — let it fire in background, response returns immediately.
  fetch(threadPatchUrl, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(threadPatchDoc),
  }).catch((err) => console.warn('[chat-send] thread bump failed (non-fatal):', err));

  // Push notification to Super Admin — best-effort, never blocks.
  (async () => {
    try {
      const { notifySuperAdmins } = await import('./_fcm.js');
      await notifySuperAdmins(
        '💬 New chat message',
        text.slice(0, 140),
        { url: 'https://app.traxn.in/super-admin', tag: 'chat-' + threadId },
      );
    } catch (err) {
      console.warn('[chat-send] FCM notify failed (non-fatal):', err);
    }
  })();

  return res.status(200).json({ ok: true, sentAt: now.toISOString() });
}
