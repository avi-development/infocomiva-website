// Floating "chat with us" widget — shared across every page except the
// Estimator (which ships its own estimate-aware chat wizard).
//
// Included via:  <script defer src="/assets/chat-bubble.js"></script>
//
// Renders a blue floating button (FAB) + an attention bubble that, on
// click, opens an in-place panel with one-tap WhatsApp / Call / Email —
// the SAME look as the Estimator's chat. No more redirecting to
// /estimator. Any element with [data-chat="open"] (e.g. the home page
// "Talk to us — start a chat" button) opens the same panel, so the whole
// site has one consistent contact action.
//
// Pure-DOM + injected CSS, no framework and no Tailwind dependency, so it
// works identically on the blog pages too.

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // The Estimator has its own richer chat; don't double up there.
  var path = (location.pathname || '').replace(/\/+$/, '');
  if (path === '/estimator' || path.endsWith('/estimator')) return;

  // ─── Contact details ────────────────────────────────────────────────
  var WHATSAPP = '918918897474';                 // country code + number, no +
  var PHONE    = '+918918897474';
  var EMAIL    = 'hello@infocomiva.live';
  var WA_TEXT  = encodeURIComponent(
    "Hi Infocomiva — I'd like to talk about a project."
  );

  // ─── Styles (injected once) ─────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ic-chat-css')) return;
    var css = ''
      + '.ic-fab{position:fixed;right:22px;bottom:22px;z-index:9998;width:60px;height:60px;border-radius:999px;background:linear-gradient(135deg,#2563eb 0%,#1e3a8a 100%);color:#fff;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 14px 36px -8px rgba(37,99,235,.55),0 2px 6px rgba(0,0,0,.18);transition:transform .2s,box-shadow .2s;font-family:Inter,system-ui,sans-serif}'
      + '.ic-fab:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 18px 44px -8px rgba(37,99,235,.7),0 2px 6px rgba(0,0,0,.2)}'
      + '.ic-fab svg{width:28px;height:28px}'
      + '.ic-fab::after{content:"";position:absolute;inset:0;border-radius:999px;animation:ic-pulse 2.2s infinite}'
      + '@keyframes ic-pulse{0%{box-shadow:0 0 0 0 rgba(37,99,235,.55)}70%{box-shadow:0 0 0 18px rgba(37,99,235,0)}100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}}'
      + '.ic-bubble{position:fixed;right:96px;bottom:30px;z-index:9998;background:#fff;color:#0a0a0a;padding:12px 16px;padding-right:36px;border-radius:14px;box-shadow:0 18px 40px -10px rgba(15,31,94,.25),0 2px 6px rgba(0,0,0,.06);font:600 13px/1.5 Inter,system-ui,sans-serif;max-width:260px;opacity:0;transform:translateX(8px);pointer-events:none;transition:opacity .3s,transform .3s}'
      + '.ic-bubble::after{content:"";position:absolute;right:-7px;bottom:18px;width:14px;height:14px;background:#fff;transform:rotate(45deg);box-shadow:2px -2px 6px -2px rgba(15,31,94,.12)}'
      + '.ic-bubble.is-shown{opacity:1;transform:translateX(0);pointer-events:auto;cursor:pointer}'
      + '.ic-bubble-x{position:absolute;top:6px;right:8px;background:none;border:0;cursor:pointer;color:#71717a;font-size:16px;line-height:1;padding:4px}'
      + '.ic-bubble-x:hover{color:#0a0a0a}'
      + '@media(max-width:480px){.ic-bubble{max-width:calc(100vw - 110px);right:90px}}'
      + '.ic-panel{position:fixed;right:22px;bottom:96px;z-index:9999;width:320px;max-width:calc(100vw - 32px);background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 28px 60px -10px rgba(15,31,94,.4),0 4px 10px rgba(0,0,0,.08);opacity:0;transform:translateY(12px) scale(.97);pointer-events:none;transition:opacity .22s,transform .22s;font-family:Inter,system-ui,sans-serif}'
      + '.ic-panel.is-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}'
      + '.ic-head{background:linear-gradient(135deg,#0a0a0a 0%,#1e3a8a 100%);color:#fff;padding:18px 20px 16px;position:relative}'
      + '.ic-head .usp{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;background:rgba(37,99,235,.25);border:1px solid rgba(96,165,250,.4);border-radius:999px;font-size:11px;font-weight:700;margin-bottom:10px}'
      + '.ic-head .usp .dot{width:7px;height:7px;border-radius:999px;background:#60a5fa}'
      + '.ic-head .title{font-weight:900;font-size:18px;line-height:1.2}'
      + '.ic-head .sub{font-size:12px;color:rgba(255,255,255,.72);margin-top:4px;line-height:1.5}'
      + '.ic-head-x{position:absolute;top:12px;right:12px;width:26px;height:26px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;font-size:14px;padding:0;line-height:1}'
      + '.ic-head-x:hover{background:rgba(255,255,255,.22)}'
      + '.ic-body{padding:10px}'
      + '.ic-opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;color:#0a0a0a;text-decoration:none;font-size:14px;font-weight:600;transition:background .15s}'
      + '.ic-opt:hover{background:#f7f7f8}'
      + '.ic-opt .ic{width:36px;height:36px;border-radius:999px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff}'
      + '.ic-opt .ic.wa{background:#25D366}.ic-opt .ic.call{background:#2563eb}.ic-opt .ic.mail{background:#1e3a8a}'
      + '.ic-opt .ic svg{width:18px;height:18px}'
      + '.ic-opt .meta{font-size:11px;font-weight:500;color:#71717a;margin-top:2px}'
      + '@media(prefers-reduced-motion:reduce){.ic-fab::after{animation:none}.ic-bubble,.ic-panel{transition:none}}';
    var s = document.createElement('style');
    s.id = 'ic-chat-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  var CHAT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var WA_ICON   = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-1.6-.8-2.6-1.4-3.7-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.3 5.2 4.6 1.9.8 2.7.9 3.6.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z"/><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>';
  var CALL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var MAIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';

  var panel = null, fab = null, bubble = null;

  function openPanel() {
    if (panel) panel.classList.add('is-open');
    if (bubble) bubble.classList.remove('is-shown');
  }
  function closePanel() { if (panel) panel.classList.remove('is-open'); }
  function togglePanel() { panel && (panel.classList.contains('is-open') ? closePanel() : openPanel()); }

  function mount() {
    if (document.getElementById('ic-chat-fab')) return;
    injectCSS();

    // FAB
    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'ic-chat-fab';
    fab.className = 'ic-fab';
    fab.setAttribute('aria-label', 'Chat with Infocomiva');
    fab.innerHTML = CHAT_ICON;
    fab.addEventListener('click', togglePanel);
    document.body.appendChild(fab);

    // Attention bubble
    bubble = document.createElement('div');
    bubble.className = 'ic-bubble';
    bubble.setAttribute('role', 'status');
    bubble.innerHTML =
      '<button type="button" class="ic-bubble-x" aria-label="Dismiss">×</button>'
      + '👋 Need help? Chat with us &mdash; we reply on WhatsApp in minutes.';
    document.body.appendChild(bubble);
    bubble.addEventListener('click', function (e) {
      if (e.target.closest('.ic-bubble-x')) { bubble.classList.remove('is-shown'); return; }
      openPanel();
    });
    // Auto-show after 8s (once per session)
    if (!sessionStorage.getItem('ic-bubble-dismissed')) {
      setTimeout(function () { if (panel && !panel.classList.contains('is-open')) bubble.classList.add('is-shown'); }, 8000);
    }
    bubble.querySelector('.ic-bubble-x').addEventListener('click', function () {
      try { sessionStorage.setItem('ic-bubble-dismissed', '1'); } catch (e) {}
    });

    // Panel
    panel = document.createElement('div');
    panel.id = 'ic-chat-panel';
    panel.className = 'ic-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with Infocomiva');
    panel.innerHTML =
      '<div class="ic-head">'
      +   '<button type="button" class="ic-head-x" aria-label="Close">×</button>'
      +   '<div class="usp"><span class="dot"></span> Prototype in 24h</div>'
      +   '<div class="title">Chat with us</div>'
      +   '<div class="sub">Reply in minutes during business hours. Pick whatever’s easiest:</div>'
      + '</div>'
      + '<div class="ic-body">'
      +   '<a class="ic-opt" target="_blank" rel="noopener" href="https://wa.me/' + WHATSAPP + '?text=' + WA_TEXT + '">'
      +     '<span class="ic wa">' + WA_ICON + '</span><span>WhatsApp<span class="meta">Chat now &mdash; fastest reply</span></span>'
      +   '</a>'
      +   '<a class="ic-opt" href="tel:' + PHONE + '">'
      +     '<span class="ic call">' + CALL_ICON + '</span><span>Call us<span class="meta">' + PHONE + '</span></span>'
      +   '</a>'
      +   '<a class="ic-opt" href="mailto:' + EMAIL + '">'
      +     '<span class="ic mail">' + MAIL_ICON + '</span><span>Email<span class="meta">' + EMAIL + '</span></span>'
      +   '</a>'
      + '</div>';
    document.body.appendChild(panel);
    panel.querySelector('.ic-head-x').addEventListener('click', closePanel);

    // Close when clicking outside the panel / fab
    document.addEventListener('click', function (e) {
      if (!panel || !panel.classList.contains('is-open')) return;
      if (panel.contains(e.target) || fab.contains(e.target)) return;
      if (e.target.closest('[data-chat="open"]')) return;
      closePanel();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
  }

  // Any [data-chat="open"] element opens the panel (e.g. the home page
  // "Talk to us — start a chat" button). Delegated so it works for nodes
  // added later too.
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-chat="open"]');
    if (!trigger) return;
    e.preventDefault();
    if (!panel) mount();
    openPanel();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
