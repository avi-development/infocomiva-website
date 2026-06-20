// /api/blog/[slug] — single-post detail. Vercel rewrites
// /blog/:slug to this function (vercel.json). Static files in
// /blog/{legacy-slug}/ still win the route — Vercel checks the
// filesystem first, then rewrites — so legacy posts continue to
// serve their hand-authored HTML until Avilash migrates them
// into the CMS.

import {
  getPostBySlug,
  pageShell,
  esc,
  fmtDate,
  readTimeFor,
  renderMarkdown,
} from '../_blog-shared.js';

export default async function handler(req, res) {
  const slug = (req.query && req.query.slug) || '';
  if (!slug || typeof slug !== 'string') {
    return notFound(res);
  }

  let post = null;
  try {
    post = await getPostBySlug(slug);
  } catch (err) {
    console.warn('[blog] getPostBySlug threw:', err);
  }
  if (!post) return notFound(res);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=86400');

  const bodyHtml = renderMarkdown(post.body);
  const canonical = `https://infocomiva.live/blog/${post.slug}/`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.seoDescription,
    image: post.coverImage || 'https://infocomiva.live/assets/og-image.jpg',
    datePublished: post.publishedAt || undefined,
    author: { '@type': 'Organization', name: post.author || 'Infocomiva Technologies', url: 'https://infocomiva.live' },
    publisher: {
      '@type': 'Organization',
      name: 'Infocomiva Technologies',
      logo: { '@type': 'ImageObject', url: 'https://infocomiva.live/assets/logo.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: 'en-IN',
  };

  const body = `
    <article class="max-w-3xl mx-auto px-5 py-12">
      <a href="/blog" class="text-xs font-bold uppercase tracking-widest text-azure-500 hover:text-azure-700">&larr; Back to all posts</a>
      <header class="mt-8 mb-10 space-y-4">
        <h1 class="font-display text-3xl sm:text-5xl font-black tracking-tight leading-tight">${esc(post.title)}</h1>
        <p class="text-lg text-ink-500 leading-relaxed">${esc(post.excerpt || '')}</p>
        <div class="flex flex-wrap items-center gap-3 text-xs font-semibold text-ink-500 uppercase tracking-widest pt-2">
          <span>${esc(post.author || 'Infocomiva Technologies')}</span>
          <span class="text-ink-200">&middot;</span>
          <span>${esc(fmtDate(post.publishedAt))}</span>
          <span class="text-ink-200">&middot;</span>
          <span>${esc(readTimeFor(post.body))}</span>
        </div>
      </header>
      ${post.coverImage ? `<img src="${esc(post.coverImage)}" alt="" class="w-full rounded-2xl mb-10">` : ''}
      <div class="prose-body">
        ${bodyHtml}
      </div>
      ${post.tags && post.tags.length ? `
        <div class="mt-12 pt-8 border-t border-ink-100 flex flex-wrap gap-2">
          ${post.tags.map((t) => `<span class="text-[11px] font-bold uppercase tracking-widest text-ink-500 bg-ink-50 px-3 py-1 rounded-full">#${esc(t)}</span>`).join('')}
        </div>` : ''}
      <div class="mt-16 p-8 sm:p-12 rounded-3xl bg-ink-900 text-white text-center">
        <p class="text-[10px] font-black text-azure-500 uppercase tracking-widest mb-3">NEXT STEP</p>
        <h2 class="font-display text-2xl sm:text-3xl font-black tracking-tight mb-3">Have a build in mind?</h2>
        <p class="text-white/70 mb-6 max-w-xl mx-auto">Tell us what you want to ship and we&rsquo;ll come back with a scoped prototype within 24 hours.</p>
        <a href="/estimator" class="inline-block bg-azure-500 hover:bg-azure-700 text-white font-bold py-3 px-6 rounded-full text-sm uppercase tracking-widest transition-colors">Get a quote</a>
      </div>
    </article>`;

  res.status(200).send(
    pageShell({
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.excerpt,
      ogImage: post.coverImage || 'https://infocomiva.live/assets/og-image.jpg',
      canonical,
      body,
      schema,
    }),
  );
}

function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(404).send(
    pageShell({
      title: 'Post not found — Infocomiva',
      description: 'The blog post you are looking for could not be found.',
      canonical: 'https://infocomiva.live/blog/',
      body: `
        <section class="max-w-2xl mx-auto px-5 py-24 text-center">
          <p class="text-[10px] font-black text-azure-500 uppercase tracking-widest mb-3">404</p>
          <h1 class="font-display text-4xl font-black tracking-tight mb-3">Post not found.</h1>
          <p class="text-ink-500 mb-8">The slug doesn&rsquo;t match any of our posts.</p>
          <a href="/blog" class="inline-block bg-azure-500 hover:bg-azure-700 text-white font-bold py-3 px-6 rounded-full text-sm uppercase tracking-widest transition-colors">Browse the blog</a>
        </section>`,
    }),
  );
}
