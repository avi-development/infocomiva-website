# Vercel serverless functions — OTP chat capture

These three endpoints power the email-OTP-verified chat on `/estimator/`:

| Endpoint           | What it does |
| ------------------ | ------------ |
| `/api/send-otp`    | Generate 6-digit code, sign HMAC token, send code via Brevo |
| `/api/verify-otp`  | Verify the code against the signed token, issue session token |
| `/api/submit-lead` | Write the chat fields to Firestore `/leads`, gated by session token |

No database is needed for the OTP itself — the code's SHA-256 hash lives inside an HMAC-signed JWT-style token. The signing key is `OTP_SECRET`.

## Required Vercel environment variables

Go to **Vercel dashboard → infocomiva-website → Settings → Environment Variables** and add both:

### `OTP_SECRET`

```
p35voXfnVueFxMcU8NnH44P2NNICzqamyUPNbpCJENNyeyscIhX6k0KPNE6GA8XK
```

(64-char random string, generated for you. You can rotate it any time — running visitors mid-chat will be forced to re-verify. Don't commit this anywhere — only paste it into Vercel's env-var UI.)

### `BREVO_API_KEY`

Get yours from **Brevo dashboard → Settings → SMTP & API → API Keys → Generate new key**. Scope must include `Transactional emails`.

Format: `xkeysib-...`

### Optional overrides

| Variable           | Default                          | Notes |
| ------------------ | -------------------------------- | ----- |
| `BREVO_FROM_EMAIL` | `hello@infocomiva.live`          | Sender address — must be a verified sender in your Brevo account |
| `BREVO_FROM_NAME`  | `Infocomiva Technologies`        | Display name in the visitor's inbox |

## Brevo sender verification

Before OTPs will deliver, your sender (`hello@infocomiva.live`) must be verified at Brevo. Either:

- **Quick path**: Settings → Senders & IP → Add sender → use `hello@infocomiva.live` → click verification link sent to that inbox. Works for testing but mail goes to spam more often.
- **Production path**: Settings → Senders & IP → Domains → Add `infocomiva.live` → add the SPF + DKIM TXT records they show to your DNS (Vercel manages DNS for `infocomiva.live`, so add them in Vercel's domain settings → DNS).

Without verified sender, OTPs will either bounce or land in spam.

## After adding env vars

Vercel re-uses env vars on the next deployment. After adding both, trigger a redeploy:

- **Quick**: Deployments → … menu on the latest deployment → Redeploy
- **Or**: push any small commit and the auto-deploy picks them up

## Local testing

Not configured. The endpoints assume Vercel runtime. To test the chat UI locally without Brevo, comment out the `fetch('https://api.brevo.com/...')` block in `send-otp.js` and have it log the OTP to the function console instead.
