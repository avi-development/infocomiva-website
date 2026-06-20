// Shared helpers for the /api/blog/* serverless routes that render the
// Infocomiva blog from the shared cargologic-saas Firestore. Both the
// index and slug routes need the same Firestore client, HTML chrome, and
// markdown renderer, so we keep one source of truth here.
//
// We use the Firestore REST API directly (instead of firebase-admin)
// because all reads are public — the security rules let unauthenticated
// clients read blogPosts where status == 'published'. No service-account
// credential is required at runtime.

import { marked } from 'marked';

const PROJECT_ID = 'cargologic-saas';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Configure marked for safer defaults — GFM tables / strikethrough /
// autolinks on, smart-typographic quotes off (we keep markdown literal so
// authors can paste arbitrary characters without surprises).
marked.setOptions({ gfm: true, breaks: false });

// ─── Firestore REST query ──────────────────────────────────────────
//
// runQuery with a structured composite filter (siteSlug=='infocomiva'
// AND status=='published'), ordered by publishedAt desc. This matches
// the firestore.rules predicate, so the request succeeds anonymously
// — no auth header, no service account.
export async function listPublishedPosts() {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'blogPosts' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'siteSlug' }, op: 'EQUAL', value: { stringValue: 'infocomiva' } } },
            { fieldFilter: { field: { fieldPath: 'status' },   op: 'EQUAL', value: { stringValue: 'published' } } },
          ],
        },
      },
      orderBy: [
        { field: { fieldPath: 'publishedAt' }, direction: 'DESCENDING' },
      ],
    },
  };
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn('[blog] runQuery failed:', res.status, txt);
    return [];
  }
  const rows = await res.json();
  return rows
    .map((r) => r.document)
    .filter(Boolean)
    .map(unwrapDoc);
}

export async function getPostBySlug(slug) {
  // We can't query by slug + siteSlug + status without another composite
  // index, so we list all and filter. Vercel caches per-route output so
  // the runQuery only fires once per cache window per slug.
  const all = await listPublishedPosts();
  return all.find((p) => p.slug === slug) || null;
}

// Translate a Firestore typed-value document into a plain JS object that
// matches the shape our CMS writes. Only the fields we render are pulled
// out — anything else is ignored.
function unwrapDoc(doc) {
  const f = doc.fields || {};
  const str = (k) => (f[k] && f[k].stringValue) || '';
  const ts = (k) => (f[k] && f[k].timestampValue) || null;
  const arr = (k) => {
    const v = f[k] && f[k].arrayValue && f[k].arrayValue.values;
    if (!Array.isArray(v)) return [];
    return v.map((x) => x.stringValue).filter(Boolean);
  };
  return {
    id: (doc.name || '').split('/').pop(),
    slug: str('slug'),
    title: str('title') || '(untitled)',
    excerpt: str('excerpt'),
    body: str('body'),
    coverImage: str('coverImage'),
    author: str('author') || 'Infocomiva Technologies',
    tags: arr('tags'),
    seoTitle: str('seoTitle') || str('title'),
    seoDescription: str('seoDescription') || str('excerpt'),
    publishedAt: ts('publishedAt'),
  };
}

// ─── HTML escape ───────────────────────────────────────────────────
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

// ─── Markdown render ───────────────────────────────────────────────
export function renderMarkdown(md) {
  return marked.parse(md || '');
}

// ─── Hardcoded legacy posts ────────────────────────────────────────
//
// Two posts pre-dating the CMS migration. Until Avilash imports them
// into Firestore from the Super Admin /super-admin/blog page, we still
// surface them on the index so the listing isn't half-empty. Their
// detail pages keep working from /blog/{slug}/index.html (static HTML,
// served by Vercel before any rewrite fires for that path).
export const LEGACY_INFOCOMIVA_POSTS = [
  {
    slug: 'how-to-choose-software-partner-india',
    title: 'How to choose a software development partner in India (2026)',
    excerpt:
      'Six questions to ask before you sign with any Indian agency — covering scope, ownership, pricing, and the lock-in risks that don’t show up until month four. Use this as a checklist on every shortlist call.',
    coverImage: '',
    publishedAt: '2026-06-04T00:00:00+05:30',
    author: 'Infocomiva Technologies',
    tags: ['Engagement'],
    readTimeOverride: '7 min read',
    isLegacy: true,
  },
  {
    slug: 'multi-tenant-saas-when-you-need-it',
    title: 'Multi-tenant SaaS: when your business actually needs it',
    excerpt:
      'Multi-tenancy sounds like the obvious answer for “a product several companies use,” but the costs of doing it badly are higher than most founders realise. Here’s when it’s worth the engineering, and when a single-tenant deployment per customer is the cheaper truth.',
    coverImage: '',
    publishedAt: '2026-06-04T00:00:00+05:30',
    author: 'Infocomiva Technologies',
    tags: ['Architecture'],
    readTimeOverride: '6 min read',
    isLegacy: true,
  },
];

// ─── Date format ───────────────────────────────────────────────────
export function fmtDate(input) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function readTimeFor(md) {
  const words = String(md || '').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return `${minutes} min read`;
}

// ─── HTML chrome ────────────────────────────────────────────────────
//
// Matches the rest of the marketing site — top promo bar, real header
// with eagle logo + nav, dark hero is the page's job (the shell only
// wraps it). The footer is intentionally minimal here; the existing
// static-site footer JS hooks (consent banner, scroll-spy, etc.) live
// in /assets and aren't needed inside dynamically-rendered blog pages.
export function pageShell({ title, description, ogImage, canonical, body, schema }) {
  const ogImg = ogImage || 'https://infocomiva.live/assets/og-image.jpg';
  const schemaTag = schema
    ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
    : '';
  return `<!doctype html>
<html lang="en-IN" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

  <!-- Canonical-host redirect mirrors the static blog pages. -->
  <script>(function(){var h=location.hostname;if(h==='infocomiva-website.vercel.app'){location.replace('https://infocomiva.live'+location.pathname+location.search+location.hash);}})();</script>

  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
  <link rel="canonical" href="${esc(canonical)}">
  <meta name="theme-color" content="#0a0a0a">

  <link rel="icon" type="image/png" href="/assets/logo.png">
  <link rel="apple-touch-icon" href="/assets/logo.png">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Infocomiva Technologies">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(ogImg)}">
  <meta property="og:locale" content="en_IN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImg)}">
  ${schemaTag}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = { theme: { extend: {
      fontFamily: { sans: ['Inter','ui-sans-serif','system-ui','sans-serif'], display: ['"Plus Jakarta Sans"','Inter','ui-sans-serif','system-ui'] },
      colors: {
        ink: { 50:'#f7f7f8',100:'#ebebed',200:'#d4d4d8',300:'#a1a1aa',500:'#71717a',700:'#2d2d31',900:'#0a0a0a' },
        azure: { 50:'#eef2ff',100:'#dbe4ff',300:'#93c5fd',400:'#60a5fa',500:'#2563eb',600:'#1d4ed8',700:'#1e3a8a',900:'#0f1f5e' }
      },
    }}};
  </script>
  <style type="text/tailwindcss">
    @layer utilities {
      .grad-text { background: linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
    }
    body { padding-top: 96px; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
    @media (min-width: 640px) { body { padding-top: 100px; } }

    .post-card { transition: border-color .15s, box-shadow .15s, transform .15s; }
    .post-card:hover { border-color: #93c5fd; box-shadow: 0 14px 32px -12px rgba(15,31,94,.18); transform: translateY(-2px); }

    .prose-body { font-size: 17px; line-height: 1.75; color:#2d2d31; }
    .prose-body h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 900; font-size: 1.6rem; color:#0a0a0a; margin-top: 2.5rem; margin-bottom: 1rem; letter-spacing: -0.01em; }
    .prose-body h3 { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 1.25rem; color:#0a0a0a; margin-top: 2rem; margin-bottom: 0.75rem; }
    .prose-body p { margin: 1rem 0; }
    .prose-body ul, .prose-body ol { margin: 1rem 0 1rem 1.25rem; padding-left: 0.5rem; }
    .prose-body ul { list-style: disc; }
    .prose-body ol { list-style: decimal; }
    .prose-body li { margin: 0.4rem 0; }
    .prose-body a { color: #1e3a8a; text-decoration: underline; text-underline-offset: 2px; }
    .prose-body a:hover { color: #2563eb; }
    .prose-body blockquote { border-left: 4px solid #2563eb; padding: 0.25rem 0 0.25rem 1rem; color:#52525b; margin: 1.5rem 0; }
    .prose-body strong { color:#0a0a0a; }
    .prose-body code { background:#f7f7f8; padding:2px 6px; border-radius: 4px; font-size: 0.95em; }
    .prose-body pre { background:#0a0a0a; color:#f7f7f8; padding:1rem 1.25rem; border-radius: 12px; overflow:auto; margin: 1.5rem 0; }
    .prose-body pre code { background: none; padding: 0; color: inherit; }
    .prose-body img { max-width: 100%; border-radius: 16px; margin: 1.5rem 0; }
  </style>
</head>
<body class="bg-white text-ink-900 selection:bg-azure-500/20 selection:text-ink-900">

  <!-- FIXED HEADER — mirrors the rest of the marketing site so the
       chrome stays consistent when visitors arrive from /blog from
       any other page. -->
  <div class="fixed top-0 left-0 right-0 z-50">
    <a href="/#contact" data-lead class="bg-ink-900 text-white block group">
      <div class="max-w-6xl mx-auto px-5 py-2 flex items-center justify-center gap-2.5 text-xs sm:text-sm font-semibold">
        <span class="relative flex w-2 h-2 shrink-0">
          <span class="absolute inline-flex w-full h-full rounded-full bg-azure-400 opacity-75 animate-ping"></span>
          <span class="relative inline-flex w-2 h-2 rounded-full bg-azure-400"></span>
        </span>
        <span>Sign Up Today and Get Custom Prototype in <span class="text-azure-300">24 Hours</span></span>
        <span class="text-azure-300 group-hover:translate-x-0.5 transition">&rarr;</span>
      </div>
    </a>
    <header class="bg-white/90 backdrop-blur text-ink-900 border-b border-ink-100">
      <div class="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
        <a href="/" class="flex items-center gap-3">
          <span class="inline-flex items-center justify-center h-10 w-10 rounded-md bg-azure-50 border border-azure-100 text-[10px] uppercase tracking-wider text-azure-700 font-bold">IT</span>
          <span class="font-display font-black text-base sm:text-lg tracking-tight">Infocomiva <span class="text-azure-600">Technologies</span></span>
        </a>
        <nav class="hidden md:flex items-center gap-5 text-sm">
          <a href="/about/" class="text-ink-700 hover:text-ink-900 transition">About</a>
          <a href="/#services" class="text-ink-700 hover:text-ink-900 transition">Services</a>
          <a href="/#work" class="text-ink-700 hover:text-ink-900 transition">Work</a>
          <a href="/estimator/" class="text-ink-700 hover:text-ink-900 transition">Estimator</a>
          <a href="/blog/" class="text-ink-900 font-semibold transition" aria-current="page">Blog</a>
          <a href="/#contact" class="text-ink-700 hover:text-ink-900 transition">Contact</a>
        </nav>
        <a href="/#contact" data-lead class="inline-flex items-center gap-1.5 bg-azure-500 hover:bg-azure-600 transition px-4 py-2 rounded-lg text-sm font-semibold text-white">
          Sign Up
        </a>
      </div>
    </header>
  </div>

  <main>${body}</main>

  <footer class="border-t border-ink-100 mt-16 py-10">
    <div class="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-ink-500">
      <div>&copy; ${new Date().getFullYear()} Infocomiva Technologies</div>
      <div class="flex items-center gap-4">
        <a href="/" class="hover:text-ink-900 transition">Home</a>
        <a href="/blog/" class="hover:text-ink-900 transition">Blog</a>
        <a href="/about/" class="hover:text-ink-900 transition">About</a>
        <a href="/estimator/" class="hover:text-ink-900 transition">Estimator</a>
      </div>
    </div>
  </footer>

  <script defer src="/assets/chat-bubble.js"></script>
</body>
</html>`;
}
