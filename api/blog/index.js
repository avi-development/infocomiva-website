// /api/blog — index page for /blog. Vercel rewrite (see vercel.json)
// sends the visitor's GET /blog to this function. We render an HTML
// listing of every published post (Firestore + the two hard-coded
// legacy posts) on the fly.
//
// Why a serverless function instead of a Next.js page: this site is
// vanilla static HTML + serverless API today, and migrating it to
// Next would be a much bigger lift than just adding two Node handlers.
// Cache-Control on the response keeps the per-request runQuery cost
// manageable.

import {
  listPublishedPosts,
  LEGACY_INFOCOMIVA_POSTS,
  pageShell,
  esc,
  fmtDate,
} from '../_blog-shared.js';

export default async function handler(req, res) {
  let firestorePosts = [];
  try {
    firestorePosts = await listPublishedPosts();
  } catch (err) {
    console.warn('[blog] listPublishedPosts threw:', err);
  }

  // De-dupe — if Avilash imports a legacy post into Firestore later, the
  // Firestore version wins and the hard-coded entry is suppressed.
  const firestoreSlugs = new Set(firestorePosts.map((p) => p.slug));
  const legacy = LEGACY_INFOCOMIVA_POSTS.filter((p) => !firestoreSlugs.has(p.slug));
  const all = [...firestorePosts, ...legacy].sort((a, b) => {
    const ta = new Date(a.publishedAt || 0).getTime();
    const tb = new Date(b.publishedAt || 0).getTime();
    return tb - ta;
  });

  const body = renderIndex(all);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Edge cache for 60s, allow stale up to 24h while we revalidate. The
  // CMS publish cycle is human-paced; aggressive freshness isn't needed.
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=86400');
  res.status(200).send(
    pageShell({
      title: 'Blog — Infocomiva Technologies',
      description:
        'Practical writing on building custom software, multi-tenant SaaS, and AI-augmented operations in India.',
      ogImage: 'https://infocomiva.live/assets/og-image.jpg',
      canonical: 'https://infocomiva.live/blog/',
      body,
    }),
  );
}

function renderIndex(posts) {
  const cards = posts
    .map(
      (p) => `
        <a href="/blog/${esc(p.slug)}/" class="group block rounded-2xl border border-ink-100 bg-white overflow-hidden hover:shadow-lg transition-shadow">
          <div class="aspect-[16/9] bg-ink-100 overflow-hidden">
            ${p.coverImage ? `<img src="${esc(p.coverImage)}" alt="" class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform">` : ''}
          </div>
          <div class="p-6">
            <div class="text-[11px] font-bold uppercase tracking-widest text-azure-500 mb-2">${esc(fmtDate(p.publishedAt))}</div>
            <h2 class="font-display text-xl font-black tracking-tight leading-snug mb-2 group-hover:text-azure-500">${esc(p.title)}</h2>
            <p class="text-sm text-ink-500 leading-relaxed line-clamp-3">${esc(p.excerpt || '')}</p>
            <div class="mt-4 text-xs font-semibold text-ink-700">${esc(p.author)}</div>
          </div>
        </a>`,
    )
    .join('');

  const emptyState = `
    <div class="text-center max-w-xl mx-auto py-16">
      <p class="text-[10px] font-black text-azure-500 uppercase tracking-widest mb-3">QUEUED</p>
      <h2 class="font-display text-3xl font-black tracking-tight mb-3">Articles publishing soon.</h2>
      <p class="text-ink-500 leading-relaxed">Our first technical writing drops here shortly. Keep an eye out.</p>
    </div>`;

  return `
    <section class="max-w-6xl mx-auto px-5 pt-12 pb-6">
      <div class="max-w-3xl">
        <p class="text-[10px] font-black text-azure-500 uppercase tracking-widest mb-2">KNOWLEDGE</p>
        <h1 class="font-display text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-3">The Infocomiva blog.</h1>
        <p class="text-ink-500 text-lg leading-relaxed">Field-tested writing on custom software, SaaS architecture, and AI-augmented operations for Indian businesses.</p>
      </div>
    </section>
    <section class="max-w-6xl mx-auto px-5 py-10">
      ${posts.length === 0 ? emptyState : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">${cards}</div>`}
    </section>`;
}
