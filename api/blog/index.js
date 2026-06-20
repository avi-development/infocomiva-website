// Debug build — surfaces the actual error message so we can fix it.

export default async function handler(req, res) {
  try {
    const shared = await import('../../lib/blog-shared.js');
    let firestorePosts = [];
    try {
      firestorePosts = await shared.listPublishedPosts();
    } catch (err) {
      console.warn('[blog] listPublishedPosts threw:', err);
    }
    const firestoreSlugs = new Set(firestorePosts.map((p) => p.slug));
    const legacy = shared.LEGACY_INFOCOMIVA_POSTS.filter((p) => !firestoreSlugs.has(p.slug));
    const all = [...firestorePosts, ...legacy].sort((a, b) => {
      const ta = new Date(a.publishedAt || 0).getTime();
      const tb = new Date(b.publishedAt || 0).getTime();
      return tb - ta;
    });

    const cards = all.map((p) => `
      <a href="/blog/${shared.esc(p.slug)}/" class="group block rounded-2xl border border-ink-100 bg-white overflow-hidden hover:shadow-lg transition-shadow">
        <div class="aspect-[16/9] bg-ink-100 overflow-hidden">
          ${p.coverImage ? `<img src="${shared.esc(p.coverImage)}" alt="" class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform">` : ''}
        </div>
        <div class="p-6">
          <div class="text-[11px] font-bold uppercase tracking-widest text-azure-500 mb-2">${shared.esc(shared.fmtDate(p.publishedAt))}</div>
          <h2 class="font-display text-xl font-black tracking-tight leading-snug mb-2 group-hover:text-azure-500">${shared.esc(p.title)}</h2>
          <p class="text-sm text-ink-500 leading-relaxed line-clamp-3">${shared.esc(p.excerpt || '')}</p>
          <div class="mt-4 text-xs font-semibold text-ink-700">${shared.esc(p.author)}</div>
        </div>
      </a>`).join('');

    const body = `
      <section class="max-w-6xl mx-auto px-5 pt-12 pb-6">
        <div class="max-w-3xl">
          <p class="text-[10px] font-black text-azure-500 uppercase tracking-widest mb-2">KNOWLEDGE</p>
          <h1 class="font-display text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-3">The Infocomiva blog.</h1>
          <p class="text-ink-500 text-lg leading-relaxed">Field-tested writing on custom software, SaaS architecture, and AI-augmented operations for Indian businesses.</p>
        </div>
      </section>
      <section class="max-w-6xl mx-auto px-5 py-10">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">${cards}</div>
      </section>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=86400');
    res.status(200).send(
      shared.pageShell({
        title: 'Blog — Infocomiva Technologies',
        description: 'Practical writing on building custom software, multi-tenant SaaS, and AI-augmented operations in India.',
        ogImage: 'https://infocomiva.live/assets/og-image.jpg',
        canonical: 'https://infocomiva.live/blog/',
        body,
      }),
    );
  } catch (err) {
    // Surface the actual error so we can fix it. Production cleanup
    // happens once the function is known good.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(500).send(
      `BLOG_INDEX_ERROR\n\nname: ${err?.name}\nmessage: ${err?.message}\n\nstack:\n${err?.stack || ''}`,
    );
  }
}
