// /api/chat-poll — Vercel serverless function
//
// Visitor's chat panel polls this endpoint every ~3s to fetch new
// admin messages. Uses Firestore REST :runQuery to filter messages
// where from='admin' AND createdAt > since. Returns just the new
// admin messages so the panel can render them as bot bubbles.
//
// We deliberately don't return visitor messages — the visitor's
// browser already knows what they typed; no point re-rendering.

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SECRET = process.env.OTP_SECRET;
  if (!SECRET || SECRET.length < 32) return res.status(500).json({ error: 'Server misconfigured' });

  // Accept threadToken from either query (GET) or body (POST).
  let threadToken, since;
  if (req.method === 'GET') {
    threadToken = req.query && req.query.threadToken;
    since = (req.query && req.query.since) || '';
  } else {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    threadToken = body && body.threadToken;
    since = (body && body.since) || '';
  }

  const payload = verifyToken(threadToken, SECRET);
  if (!payload || !payload.t) return res.status(401).json({ error: 'Invalid chat session.' });
  if (typeof payload.x !== 'number' || Math.floor(Date.now() / 1000) > payload.x) {
    return res.status(401).json({ error: 'Chat session expired.' });
  }

  const threadId = payload.t;
  // Sanitise: ISO timestamp or fallback to "epoch" so the first poll
  // returns all admin messages. Firestore wants RFC3339.
  let sinceIso = '1970-01-01T00:00:00Z';
  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) sinceIso = d.toISOString();
  }

  // structuredQuery: messages WHERE createdAt > since ORDER BY createdAt
  // Then we filter for from='admin' in JS below. Why not put `from`
  // in the WHERE? Because Firestore requires a COMPOSITE INDEX for any
  // query that combines a range filter (createdAt >) with an equality
  // filter (from ==) AND an ORDER BY. Without the index, runQuery
  // returns an "index required" error. Single-field range + same-field
  // order doesn't need any index — works out of the box.
  // Trade-off: we over-fetch visitor messages and discard them in JS,
  // but chat threads are short (max 50 messages per poll cap) so the
  // extra payload is negligible.
  const runQueryUrl = `${FS_BASE}/chatThreads/${threadId}:runQuery?key=${PUBLIC_API_KEY}`;
  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: 'messages' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'createdAt' },
          op: 'GREATER_THAN',
          value: { timestampValue: sinceIso },
        },
      },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
      limit: 50,
    },
  };

  let fsRes;
  try {
    fsRes = await fetch(runQueryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(queryBody),
    });
  } catch (err) {
    console.error('[chat-poll] fetch threw:', err);
    return res.status(500).json({ error: 'Network error polling chat.' });
  }

  if (!fsRes.ok) {
    const errText = await fsRes.text().catch(() => '<unreadable>');
    console.error('[chat-poll] runQuery failed', fsRes.status, errText);
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      detail = (parsed.error && (parsed.error.message || parsed.error.status)) || errText;
    } catch { /* leave */ }
    return res.status(500).json({ error: 'Could not poll chat (' + String(detail).slice(0, 220) + ').' });
  }

  const rows = await fsRes.json().catch(() => []);
  // runQuery returns an array of { document: { fields: {...} } } per match,
  // plus a trailing { readTime } entry. Filter to documents only AND
  // drop visitor messages (we only want to push admin replies down to
  // the visitor; they already see their own bubbles client-side).
  const messages = (Array.isArray(rows) ? rows : [])
    .map((row) => row.document)
    .filter(Boolean)
    .map((doc) => {
      const fields = doc.fields || {};
      return {
        from:      (fields.from      && fields.from.stringValue)      || '',
        text:      (fields.text      && fields.text.stringValue)      || '',
        createdAt: (fields.createdAt && fields.createdAt.timestampValue) || null,
      };
    })
    .filter((m) => m.from === 'admin' && m.text && m.createdAt)
    .map((m) => ({ text: m.text, createdAt: m.createdAt }));

  return res.status(200).json({
    messages,
    polledAt: new Date().toISOString(),
  });
}
