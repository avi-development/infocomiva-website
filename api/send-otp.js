// /api/send-otp — Vercel serverless function
//
// Generates a 6-digit OTP, signs an HMAC payload with the OTP hash +
// expiry + email, sends the OTP code via Brevo's transactional email
// API, and returns the signed token to the client. The client never
// sees the OTP code from the response — it only arrives in the user's
// inbox. The client submits { email, otp, token } back to
// /api/verify-otp where the signature + hash are checked.
//
// No database needed: the OTP hash lives inside the signed token,
// so reuse / replay is impossible without forging the HMAC
// (which requires OTP_SECRET).
//
// Env vars required (Vercel → Project → Settings → Environment Variables):
//   BREVO_API_KEY       — from Brevo dashboard → Settings → SMTP & API
//   OTP_SECRET          — any 64+ char random string; do NOT commit
//   BREVO_FROM_EMAIL    — defaults to hello@infocomiva.live
//   BREVO_FROM_NAME     — defaults to "Infocomiva Technologies"

import crypto from 'node:crypto';

const OTP_EXP_SECONDS = 10 * 60;       // 10 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1-min window for naive in-memory rate limit
const RATE_LIMIT_MAX = 3;               // max 3 OTPs per IP per minute

// Naive in-memory per-IP rate limit. Vercel functions are stateless
// between cold starts but within a warm instance this throttles
// obvious abuse. For real anti-abuse, layer Vercel Edge Config or
// Upstash KV — over-engineering for current volume.
const ipHits = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) return false;
  arr.push(now);
  ipHits.set(ip, arr);
  return true;
}

function isEmail(v) {
  return typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length < 200;
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

export default async function handler(req, res) {
  // CORS — Vercel auto-handles same-origin; we expose explicitly so the
  // estimator page works on infocomiva.live, www, and the .vercel.app
  // host without different code paths.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const SECRET = process.env.OTP_SECRET;
  const BREVO_KEY = process.env.BREVO_API_KEY;
  const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'hello@infocomiva.live';
  const FROM_NAME  = process.env.BREVO_FROM_NAME  || 'Infocomiva Technologies';

  if (!SECRET || SECRET.length < 32) {
    console.error('[send-otp] OTP_SECRET missing or too short');
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (!BREVO_KEY) {
    console.error('[send-otp] BREVO_API_KEY missing');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = (body && body.email || '').trim().toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email.' });

  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown';
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  // Generate 6-digit OTP. Math.random is fine for OTP entropy since
  // we never expose it to the client and it's single-use within 10
  // minutes; for stronger entropy, swap to crypto.randomInt.
  const otp = String(crypto.randomInt(100000, 1000000));
  const exp = Math.floor(Date.now() / 1000) + OTP_EXP_SECONDS;
  const otpHash = crypto.createHash('sha256').update(otp + '|' + email + '|' + SECRET).digest('hex');
  const token = signPayload({ h: otpHash, e: email, x: exp }, SECRET);

  // Send via Brevo transactional email API.
  const emailBody = {
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email }],
    subject: 'Your Infocomiva verification code',
    htmlContent: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;color:#0a0a0a;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
          <div style="width:40px;height:40px;background:linear-gradient(135deg,#2563eb,#1e3a8a);border-radius:8px;color:#fff;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;letter-spacing:.08em;">IT</div>
          <div style="font-weight:900;font-size:18px;letter-spacing:-0.01em;">Infocomiva <span style="color:#2563eb">Technologies</span></div>
        </div>
        <h1 style="font-family:Plus Jakarta Sans,sans-serif;font-weight:900;font-size:24px;line-height:1.2;margin:0 0 12px;color:#0a0a0a;">Your verification code</h1>
        <p style="font-size:14px;color:#2d2d31;line-height:1.6;margin:0 0 24px;">Enter this code on the Infocomiva chat to verify your email and start the conversation.</p>
        <div style="background:#eef2ff;border:1.5px solid #dbe4ff;border-radius:14px;padding:24px;text-align:center;margin-bottom:24px;">
          <div style="font-family:'Plus Jakarta Sans',monospace;font-weight:900;font-size:38px;letter-spacing:10px;color:#1e3a8a;">${otp}</div>
          <div style="font-size:11px;color:#71717a;margin-top:8px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;">Expires in 10 minutes</div>
        </div>
        <p style="font-size:12px;color:#71717a;line-height:1.6;margin:0;">If you didn&rsquo;t request this code, you can safely ignore this email. Someone may have entered your email by mistake.</p>
        <hr style="border:0;border-top:1px solid #ebebed;margin:24px 0;">
        <p style="font-size:11px;color:#71717a;line-height:1.6;margin:0;">
          Infocomiva Technologies &middot; <a href="https://infocomiva.live" style="color:#1e3a8a;">infocomiva.live</a> &middot; <a href="mailto:hello@infocomiva.live" style="color:#1e3a8a;">hello@infocomiva.live</a>
        </p>
      </div>
    `,
    textContent: `Your Infocomiva verification code: ${otp}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.\n\nInfocomiva Technologies — infocomiva.live`,
  };

  let brevoRes;
  try {
    brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_KEY,
        'content-type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify(emailBody),
    });
  } catch (err) {
    console.error('[send-otp] Brevo fetch error:', err);
    return res.status(502).json({ error: 'Could not reach email provider.' });
  }

  if (!brevoRes.ok) {
    const errText = await brevoRes.text().catch(() => '<unreadable>');
    console.error('[send-otp] Brevo failed', brevoRes.status, errText);
    return res.status(502).json({ error: 'Could not send the code. Try again in a minute.' });
  }

  // 10-minute expiry so the client UI can show a countdown.
  return res.status(200).json({ token, expiresIn: OTP_EXP_SECONDS });
}
