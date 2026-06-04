// Floating "chat with us" bubble. Included on every page via
//   <script defer src="/assets/chat-bubble.js"></script>
//
// One click → /estimator (the live chat lives there). Self-hides on
// /estimator itself so we don't show a bubble that links to the page
// the visitor is already on.
//
// Pure-DOM, no framework. Inline styles so it works without a build
// step and without depending on Tailwind being present on the host
// page (the blog posts use their own CSS).

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Don't render on the estimator itself — that's the chat.
  var path = (location.pathname || '').replace(/\/+$/, '');
  if (path === '/estimator' || path.endsWith('/estimator')) return;

  function mount() {
    if (document.getElementById('infocomiva-chat-bubble')) return;

    var btn = document.createElement('a');
    btn.id = 'infocomiva-chat-bubble';
    btn.href = '/estimator';
    btn.setAttribute('aria-label', 'Open chat with Infocomiva');
    btn.style.cssText = [
      'position:fixed',
      'right:20px',
      'bottom:20px',
      'z-index:9998',
      'display:inline-flex',
      'align-items:center',
      'gap:10px',
      'padding:14px 18px',
      'border-radius:9999px',
      'background:#2563eb',
      'color:#fff',
      'font-family:Inter,system-ui,sans-serif',
      'font-weight:700',
      'font-size:14px',
      'line-height:1',
      'text-decoration:none',
      'box-shadow:0 10px 28px rgba(37,99,235,.35), 0 2px 8px rgba(0,0,0,.18)',
      'cursor:pointer',
      'transition:transform .15s ease, box-shadow .15s ease, background .15s ease',
    ].join(';');

    btn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
      '</svg>' +
      '<span>Chat with us</span>';

    btn.addEventListener('mouseenter', function () {
      btn.style.transform = 'translateY(-2px)';
      btn.style.background = '#1d4ed8';
      btn.style.boxShadow = '0 14px 34px rgba(37,99,235,.42), 0 3px 10px rgba(0,0,0,.22)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.transform = 'translateY(0)';
      btn.style.background = '#2563eb';
      btn.style.boxShadow = '0 10px 28px rgba(37,99,235,.35), 0 2px 8px rgba(0,0,0,.18)';
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
