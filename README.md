# Infocomiva Technologies — marketing site

Static HTML + Tailwind CDN single-page site for **Infocomiva Technologies**, the
services parent company behind TraxnCargo.

Lives at **https://infocomiva.com** (or whichever domain you point at the Vercel
project — domain is plug-and-play, change the canonical / OG URLs in
`index.html` if you use a different one).

## What's in the box

| Path | What it is |
|---|---|
| `index.html` | Single-page site — hero, 8 service categories, TraxnCargo case study, process, lead form. |
| `thank-you/index.html` | Conversion confirmation page. `noindex, follow`. |
| `robots.txt` | Allow all, points at sitemap. |
| `sitemap.xml` | One URL (`/`) + image entries. |
| `assets/logo.png` | **YOU MUST ADD THIS** — the Infocomiva eagle logo. See below. |
| `assets/og-image.jpg` | **YOU MUST ADD THIS** — 1200×630 social-share image. See below. |

## Lead flow

The form on the home page writes to the **same Firestore `/leads` collection**
that TraxnCargo's landing form uses (`cargologic-saas` project). Every lead from
this site is tagged `source: "infocomiva.com"` so the Super Admin Leads inbox
on app.traxn.in can filter Infocomiva-vs-TraxnCargo leads at a glance:

```
Super Admin → Leads
Filter: source = infocomiva.com   ← Infocomiva enquiries
Filter: source = traxn.in         ← TraxnCargo enquiries
```

No new Firestore rule changes were needed — the existing `/leads` public-create
rule already accepts any value in the `source` field.

## Setup steps (one-time)

### 1. Save the logo as `assets/logo.png`

Whoever sent you the Infocomiva eagle logo image: save it as a PNG with a
transparent background (or white background if you don't have a transparent
version) at:

```
/Users/avilashchakraborty/Documents/infocomiva-website/assets/logo.png
```

Recommended size: 512×512 (square). The header and footer auto-scale it.

### 2. Design the OG image (`assets/og-image.jpg`)

This is the image that shows when someone shares the URL on WhatsApp /
LinkedIn / Facebook. Dimensions: **1200×630 px, JPG**.

Quick recipe in Canva (free):
- Background: navy `#0a0a0a` or the wing-blue `#1E3A8A`
- Big bold text: "We build what you envision."
- Smaller text: "Software · Web · Mobile · AI · Digital — for India."
- Eagle logo in a corner
- Export as JPG → save to `assets/og-image.jpg`

Without it, link previews fall back to the small favicon — works but looks weak.

### 3. Push to a new GitHub repo

```bash
cd /Users/avilashchakraborty/Documents/infocomiva-website
git init
git add .
git -c user.email='286456414+avi-development@users.noreply.github.com' \
    -c user.name='avi-development' \
    commit -m "init: Infocomiva Technologies marketing site"

# Create the repo on GitHub first (https://github.com/new):
#   name: infocomiva-website
#   private or public — your call

git remote add origin https://github.com/avi-development/infocomiva-website.git
git branch -M main
git push -u origin main
```

### 4. Import to Vercel

1. https://vercel.com/dashboard → **Add New** → **Project**
2. Import `infocomiva-website` from GitHub
3. Framework preset: **Other** (Vercel auto-detects static HTML)
4. Click **Deploy** — done in ~30 seconds
5. After deploy, **Settings → Domains** → add `infocomiva.com` (or your domain)

### 5. (Optional) Analytics

`index.html` already has commented placeholders for GA4 + Microsoft Clarity. When
you create a property:

- Open `index.html`, search for `G-XXXXXXXXXX`
- Replace with your real GA4 measurement ID
- Uncomment the block

Same for Clarity — add the snippet from your Clarity dashboard.

## Editing content

Everything is in `index.html`. The eight service-category cards are clearly
labelled (`<!-- 1. Custom Software -->`, etc.) so you can add/remove chips
without breaking the layout.
