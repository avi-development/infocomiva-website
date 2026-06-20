// /api/blog — index page for /blog. Vercel rewrite (see vercel.json)
// sends the visitor's GET /blog to this function. We render an HTML
// listing of every published post (Firestore + the two hard-coded
// legacy posts) on the fly.
//
// The visual structure is intentionally identical to the static blog
// index that this function replaced: dark hero with the "Notes from
// the people who ship the work." headline, vertical stack of post
// cards, "More posts shipping soon" placeholder at the bottom.

import {
  listPublishedPosts,
  LEGACY_INFOCOMIVA_POSTS,
  pageShell,
  esc,
  fmtDate,
  readTimeFor,
} from '../../lib/blog-shared.js';

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
        'Practical writing on software development, SaaS architecture, agency engagement and engineering practice. Written for founders, COOs and operators who are evaluating a build.',
      ogImage: 'https://infocomiva.live/assets/og-image.jpg',
      canonical: 'https://infocomiva.live/blog/',
      body,
    }),
  );
}

function postCard(p) {
  const tag = (p.tags && p.tags[0]) || 'Note';
  const readTime = p.readTimeOverride || readTimeFor(p.body);
  return `
    <a href="/blog/${esc(p.slug)}/" class="post-card block bg-white border border-ink-100 rounded-2xl p-6 sm:p-8">
      <div class="flex items-center gap-3 text-xs text-ink-500 mb-3 flex-wrap">
        <span class="font-semibold text-azure-700 uppercase tracking-wider">${esc(tag)}</span>
        <span aria-hidden="true">&middot;</span>
        <span>${esc(fmtDate(p.publishedAt))}</span>
        <span aria-hidden="true">&middot;</span>
        <span>${esc(readTime)}</span>
      </div>
      <h2 class="font-display text-2xl sm:text-3xl font-black text-ink-900 leading-tight mb-3">
        ${esc(p.title)}
      </h2>
      <p class="text-ink-700 text-sm sm:text-base leading-relaxed mb-4">
        ${esc(p.excerpt || '')}
      </p>
      <span class="inline-flex items-center gap-1.5 text-azure-700 font-semibold text-sm">
        Read the post &rarr;
      </span>
    </a>`;
}

function renderIndex(posts) {
  const cards = posts.map(postCard).join('');

  const placeholder = `
    <div class="bg-ink-50 border border-dashed border-ink-200 rounded-2xl p-6 sm:p-8 text-center">
      <div class="font-display font-black text-lg text-ink-900 mb-2">More posts shipping soon</div>
      <p class="text-sm text-ink-700 leading-relaxed max-w-md mx-auto">
        We publish here every few weeks &mdash; production observability, OCR pipelines, fixed-scope contracting, and the case studies behind the work we&rsquo;ve shipped.
        <a href="/#contact" class="text-azure-700 underline underline-offset-2">Subscribe via email</a> if you want them in your inbox.
      </p>
    </div>`;

  return `
    <section class="bg-ink-900 text-white">
      <div class="max-w-4xl mx-auto px-5 pt-12 pb-14 sm:pt-16 sm:pb-16">
        <nav aria-label="Breadcrumb" class="text-xs text-white/55 mb-6">
          <a href="/" class="hover:text-white">Home</a>
          <span class="mx-2">/</span>
          <span class="text-white/80">Blog</span>
        </nav>
        <div class="text-xs sm:text-sm font-semibold tracking-widest text-azure-500 uppercase mb-4">
          Infocomiva Blog
        </div>
        <h1 class="font-display text-4xl sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight">
          Notes from the people who <span class="grad-text">ship the work.</span>
        </h1>
        <p class="mt-6 text-white/70 text-base sm:text-lg max-w-2xl leading-relaxed">
          Practical writing on software development, SaaS architecture, agency
          engagement and engineering practice. Written for founders, COOs and operators
          who are evaluating a build &mdash; the kind of pieces we wish more agencies
          wrote before we worked with them.
        </p>
      </div>
    </section>

    <section class="py-12 sm:py-16">
      <div class="max-w-4xl mx-auto px-5 grid gap-5">
        ${cards}
        ${placeholder}
      </div>
    </section>`;
}
