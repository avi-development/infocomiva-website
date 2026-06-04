# Push Notifications setup (one-time)

PWA push notifications for Super Admin work via Firebase Cloud Messaging (FCM). The visitor-side serverless API endpoints (`/api/submit-lead`, `/api/chat-send`, `/api/notify-lead`) call FCM after writing to Firestore; the admin's PWA service worker (`firebase-messaging-sw.js` in `cargologic-main/public/`) receives the push and shows the OS notification.

This document covers the one-time setup. The code is already in place across both repos.

---

## Step 1 — Enable Cloud Messaging in Firebase

1. Open https://console.firebase.google.com/project/cargologic-saas/messaging
2. If it says "Get started", click through — no further setup needed at this stage.
3. Go to **Project settings → Cloud Messaging tab**.

You should see two sections:
- **Web Push certificates** (for the browser → FCM handshake)
- **(Service accounts** elsewhere in Project Settings — for the backend → FCM handshake)

---

## Step 2 — Generate the VAPID key pair

In **Project settings → Cloud Messaging → Web configuration → Web Push certificates**, click **Generate key pair**.

Copy the displayed **Key pair** string (a long Base64-ish blob starting with something like `BJ…`).

This is the VAPID public key. It is **safe to commit / expose** publicly.

Add it as a **Vercel environment variable** on the `cargologic-main` project (the admin dashboard, which is the page that needs to call `getToken`):

| Variable | Where | Value |
|---|---|---|
| `NEXT_PUBLIC_FCM_VAPID_KEY` | Vercel → `cargologic-main` → Settings → Env vars | the VAPID public key |

The `NEXT_PUBLIC_` prefix is intentional — Next.js exposes those to the browser.

---

## Step 3 — Generate a service account key

The backend (`infocomiva-website` Vercel project) sends pushes by signing requests with a Google service account.

1. Go to **Project Settings → Service Accounts** in the Firebase Console.
2. Click **Generate new private key**.
3. A JSON file downloads. **Keep this file private** — it's effectively a master key for the Firebase project.
4. Open the file in a text editor, **copy the entire contents** (the whole JSON object, one line is fine).
5. Add as a Vercel environment variable on `infocomiva-website`:

| Variable | Where | Value |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Vercel → `infocomiva-website` → Settings → Env vars | the whole JSON object, as a single string |

Vercel handles multi-line JSON gracefully — paste the whole thing into the value field.

After adding the env var, redeploy `infocomiva-website` (Deployments → ⋯ → Redeploy) so the function picks it up.

---

## Step 4 — Update Firestore rules (one field)

The `profiles/{uid}` rules already allow super_admin self-update. The new code calls `setDoc(..., { fcmToken, fcmUpdatedAt }, { merge: true })`, which lands as a profile update. No rules change needed — the existing self-update allowance covers it.

---

## Step 5 — Enable on the admin device

1. After deploys complete, open `app.traxn.in/super-admin` on the device you want to receive notifications on (Android Chrome, iOS 16.4+ Safari, desktop Chrome / Safari, etc.)
2. In the **Live Chats card header** you'll see a green **"🔔 Enable alerts"** button. Tap it.
3. The browser prompts for notification permission. Grant it.
4. The button is replaced by a small **"🔔 Alerts on"** badge.

Each device must be enabled separately — the token is per-browser-per-device, not per-user. The most recent token is the one notifications fire to (older tokens silently stop receiving).

### iOS PWA specifics

iOS Safari requires the app to be installed to home screen *before* you can request notification permission. The flow:

1. Open `app.traxn.in/super-admin` in Safari.
2. Tap the share icon → **Add to Home Screen**.
3. Open the PWA from the home screen.
4. Now tap **Enable alerts** and grant permission.

---

## Step 6 — Test it

After enabling on at least one admin device:

- Submit the home-page contact form on `infocomiva.live` → admin gets a "🆕 New lead" notification.
- Send a chat message via the estimator chat → admin gets a "💬 New chat message" notification.
- Tapping a notification opens / focuses the Super Admin tab on `/super-admin`.

---

## Troubleshooting

**"NEXT_PUBLIC_FCM_VAPID_KEY env var is not set"** — Step 2 isn't done, or Vercel hasn't redeployed `cargologic-main` since you added the var.

**Permission was granted but no notifications arrive** — Check Vercel function logs for `infocomiva-website` → `/api/chat-send` or `/api/submit-lead`. Look for `[fcm]` log lines. If you see `notifySuperAdmins skipped — FIREBASE_SERVICE_ACCOUNT_JSON missing`, finish Step 3.

**No `fcmToken` field on the profile in Firestore** — the browser failed to obtain a token. Open devtools console, look for errors from `notifications.ts`. Most common cause is the VAPID key being wrong or stale.

**iOS Safari doesn't show the Enable button** — iOS Safari only exposes the Notification API to PWAs added to the home screen. Step 5's iOS-specific block covers this.
