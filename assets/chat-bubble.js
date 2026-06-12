// Shared chat widget — the SAME assistant that runs on /estimator, made
// available on every other page (home, about, blog, thank-you).
//
// Included via:  <script defer src="/assets/chat-bubble.js"></script>
//
// It injects the chat CSS + markup, then runs the exact estimator wizard
// (email OTP verify → lead capture → live Firestore chat with Avilash).
// Backed by the already-deployed /api/* endpoints, so it works identically
// from any page. The Estimator ships its own inline copy, so we skip there
// to avoid doubling up.

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Estimator has its own inline copy of this widget — don't double up.
  var path = (location.pathname || '').replace(/\/+$/, '');
  if (path === '/estimator' || path.endsWith('/estimator')) return;

  function boot() {
    if (document.getElementById('chat-fab')) return; // already mounted

    // ── 1) Inject CSS (verbatim from the estimator widget) ────────────
    if (!document.getElementById('ic-chat-css')) {
      var style = document.createElement('style');
      style.id = 'ic-chat-css';
      style.textContent = [
        '.chat-fab{position:fixed;right:22px;bottom:22px;z-index:60;width:60px;height:60px;border-radius:999px;background:linear-gradient(135deg,#2563eb 0%,#1e3a8a 100%);color:#fff;border:0;cursor:pointer;box-shadow:0 14px 36px -8px rgba(37,99,235,.55),0 2px 6px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s}',
        '.chat-fab:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 18px 44px -8px rgba(37,99,235,.7),0 2px 6px rgba(0,0,0,.2)}',
        '.chat-fab svg{width:28px;height:28px}',
        '.chat-fab::after{content:"";position:absolute;inset:0;border-radius:999px;box-shadow:0 0 0 0 rgba(37,99,235,.5);animation:chat-pulse 2.2s infinite}',
        '@keyframes chat-pulse{0%{box-shadow:0 0 0 0 rgba(37,99,235,.55)}70%{box-shadow:0 0 0 18px rgba(37,99,235,0)}100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}}',
        '.chat-bubble{position:fixed;right:96px;bottom:30px;z-index:60;background:#fff;color:#0a0a0a;padding:12px 16px;padding-right:36px;border-radius:14px;box-shadow:0 18px 40px -10px rgba(15,31,94,.25),0 2px 6px rgba(0,0,0,.06);font-size:13px;font-weight:600;max-width:260px;opacity:0;transform:translateX(8px);pointer-events:none;transition:opacity .3s ease-out,transform .3s ease-out;font-family:Inter,system-ui,sans-serif}',
        '.chat-bubble::after{content:"";position:absolute;right:-7px;bottom:18px;width:14px;height:14px;background:#fff;transform:rotate(45deg);box-shadow:2px -2px 6px -2px rgba(15,31,94,.12)}',
        '.chat-bubble.is-shown{opacity:1;transform:translateX(0);pointer-events:auto}',
        '.chat-bubble-close{position:absolute;top:6px;right:8px;background:none;border:0;cursor:pointer;color:#71717a;font-size:16px;line-height:1;padding:4px}',
        '.chat-bubble-close:hover{color:#0a0a0a}',
        '@media (max-width:480px){.chat-bubble{max-width:calc(100vw - 110px);right:90px}}',
        '.chat-panel{position:fixed;right:22px;bottom:96px;z-index:65;width:320px;max-width:calc(100vw - 32px);background:#fff;border-radius:18px;box-shadow:0 28px 60px -10px rgba(15,31,94,.4),0 4px 10px rgba(0,0,0,.08);overflow:hidden;opacity:0;transform:translateY(12px) scale(.97);pointer-events:none;transition:opacity .22s ease-out,transform .22s ease-out;font-family:Inter,system-ui,sans-serif}',
        '.chat-panel.is-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}',
        '.chat-panel-header{background:linear-gradient(135deg,#0a0a0a 0%,#1e3a8a 100%);color:#fff;padding:18px 20px 16px;position:relative}',
        '.chat-panel-header .usp{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;background:rgba(37,99,235,.25);border:1px solid rgba(96,165,250,.4);border-radius:999px;font-size:11px;font-weight:700;margin-bottom:10px}',
        '.chat-panel-header .usp .dot{width:7px;height:7px;border-radius:999px;background:#60a5fa}',
        '.chat-panel-header .title{font-weight:900;font-size:18px;line-height:1.2}',
        '.chat-panel-header .sub{font-size:12px;color:rgba(255,255,255,.72);margin-top:4px;line-height:1.5}',
        '.chat-panel-close{position:absolute;top:12px;right:12px;width:26px;height:26px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;font-size:14px;padding:0;line-height:1}',
        '.chat-panel-close:hover{background:rgba(255,255,255,.22)}',
        '.chat-panel.is-wizard{width:380px;max-width:calc(100vw - 32px)}',
        '.chat-thread{padding:16px;max-height:380px;min-height:220px;overflow-y:auto;background:#f7f7f8;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}',
        '.chat-msg{display:flex;gap:8px;max-width:88%}',
        '.chat-msg.from-bot{align-self:flex-start}',
        '.chat-msg.from-user{align-self:flex-end;flex-direction:row-reverse}',
        '.chat-msg .bubble{padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.45;box-shadow:0 1px 2px rgba(0,0,0,.06)}',
        '.chat-msg.from-bot .bubble{background:#fff;color:#0a0a0a;border-top-left-radius:4px}',
        '.chat-msg.from-user .bubble{background:linear-gradient(135deg,#2563eb 0%,#1e3a8a 100%);color:#fff;border-top-right-radius:4px}',
        '.chat-typing{display:inline-flex;gap:4px;padding:12px 14px;background:#fff;border-radius:16px;border-top-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.06)}',
        '.chat-typing span{width:6px;height:6px;border-radius:999px;background:#93c5fd;animation:chat-typ 1.2s infinite}',
        '.chat-typing span:nth-child(2){animation-delay:.15s}',
        '.chat-typing span:nth-child(3){animation-delay:.3s}',
        '@keyframes chat-typ{0%,60%,100%{transform:translateY(0);opacity:.6}30%{transform:translateY(-4px);opacity:1}}',
        '.chat-input-bar{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #ebebed;background:#fff;align-items:center}',
        '.chat-input-bar input,.chat-input-bar textarea{flex:1;padding:10px 12px;border:1.5px solid #ebebed;border-radius:10px;font-family:inherit;font-size:14px;color:#0a0a0a;transition:border-color .15s;resize:none;min-height:40px}',
        '.chat-input-bar input:focus,.chat-input-bar textarea:focus{outline:none;border-color:#2563eb}',
        '.chat-input-bar button{min-width:40px;height:40px;flex-shrink:0;padding:0 14px;background:linear-gradient(135deg,#2563eb,#1e3a8a);color:#fff;border:0;border-radius:10px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;display:flex;align-items:center;justify-content:center;transition:transform .15s,opacity .15s;white-space:nowrap}',
        '.chat-input-bar button:hover{transform:translateY(-1px)}',
        '.chat-input-bar button:disabled{opacity:.5;cursor:not-allowed;transform:none}',
        '.chat-yesno{display:flex;gap:8px;padding:0 12px 12px;background:#fff}',
        '.chat-yesno button{flex:1;padding:11px 16px;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;border:1.5px solid #ebebed;background:#fff;color:#0a0a0a}',
        '.chat-yesno button.primary{background:linear-gradient(135deg,#2563eb,#1e3a8a);color:#fff;border-color:transparent}',
        '.chat-yesno button:hover{transform:translateY(-1px)}',
        '.chat-error{display:none;padding:8px 14px;background:#fef2f2;color:#b91c1c;border-top:1px solid #fecaca;font-size:12px;line-height:1.4}',
        '.chat-error.is-shown{display:block}',
        '@media (prefers-reduced-motion:reduce){.chat-fab::after{animation:none}.chat-fab:hover{transform:none}.chat-bubble,.chat-panel{transition:none}.chat-typing span{animation:none}}'
      ].join('\n');
      document.head.appendChild(style);
    }

    // ── 2) Inject markup (FAB + attention bubble + wizard panel) ──────
    var holder = document.createElement('div');
    holder.innerHTML = [
      '<button type="button" class="chat-fab" id="chat-fab" aria-label="Chat with us" aria-controls="chat-panel">',
      '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
      '</button>',
      '<div class="chat-bubble" id="chat-bubble" role="status">',
      '  <button type="button" class="chat-bubble-close" id="chat-bubble-close" aria-label="Dismiss">×</button>',
      '  👋 Need help? Chat with us — we reply on WhatsApp in minutes.',
      '</div>',
      '<div class="chat-panel is-wizard" id="chat-panel" role="dialog" aria-modal="false" aria-label="Chat with Infocomiva">',
      '  <div class="chat-panel-header">',
      '    <button type="button" class="chat-panel-close" id="chat-panel-close" aria-label="Close">×</button>',
      '    <div class="usp"><span class="dot"></span> Prototype in 24h</div>',
      '    <div class="title">Chat with us</div>',
      '    <div class="sub">Quick questions so we can scope it right — takes a minute.</div>',
      '  </div>',
      '  <div class="chat-thread" id="chat-thread" aria-live="polite"></div>',
      '  <div class="chat-input-bar" id="chat-input-bar">',
      '    <input type="text" id="chat-input" placeholder="" autocomplete="off">',
      '    <button type="button" id="chat-send" aria-label="Send">→</button>',
      '  </div>',
      '  <div class="chat-yesno" id="chat-yesno" style="display:none">',
      '    <button type="button" data-yn="no">No, just send my details</button>',
      '    <button type="button" class="primary" data-yn="yes">Yes, connect me now</button>',
      '  </div>',
      '  <div class="chat-error" id="chat-error" role="alert"></div>',
      '</div>'
    ].join('\n');
    while (holder.firstChild) document.body.appendChild(holder.firstChild);

    // ── 3) Run the wizard (verbatim from the estimator) ───────────────
    (function () {
      // ─── DOM ────────────────────────────────────────────────────────
      const fab         = document.getElementById('chat-fab');
      const panel       = document.getElementById('chat-panel');
      const panelClose  = document.getElementById('chat-panel-close');
      const bubble      = document.getElementById('chat-bubble');
      const bubbleClose = document.getElementById('chat-bubble-close');
      const thread      = document.getElementById('chat-thread');
      const inputBar    = document.getElementById('chat-input-bar');
      const input       = document.getElementById('chat-input');
      const sendBtn     = document.getElementById('chat-send');
      const yesno       = document.getElementById('chat-yesno');
      const errorBox    = document.getElementById('chat-error');

      if (!fab || !panel) return;

      // ─── Open/close + outside click + ESC + bubble ─────────────────
      function openPanel()  {
        panel.classList.add('is-open');
        if (bubble) bubble.classList.remove('is-shown');
        if (!state.booted) { state.booted = true; advanceTo('email'); }
        setTimeout(() => input && input.focus(), 80);
      }
      function closePanel() { panel.classList.remove('is-open'); }
      fab.addEventListener('click', () => panel.classList.contains('is-open') ? closePanel() : openPanel());
      if (panelClose) panelClose.addEventListener('click', closePanel);
      document.addEventListener('click', (e) => {
        if (!panel.classList.contains('is-open')) return;
        if (panel.contains(e.target) || fab.contains(e.target)) return;
        if (e.target.closest && e.target.closest('[data-chat="open"]')) return;
        closePanel();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
      });
      document.addEventListener('click', (e) => {
        const t = e.target.closest && e.target.closest('[data-chat="open"]');
        if (t) { e.preventDefault(); openPanel(); }
      });

      // Attention bubble — once per session, ~8s dwell.
      const BUBBLE_KEY = 'infocomiva-chat-bubble-dismissed';
      function bubbleSeen() { try { return sessionStorage.getItem(BUBBLE_KEY) === '1'; } catch { return false; } }
      function markBubbleSeen() { try { sessionStorage.setItem(BUBBLE_KEY, '1'); } catch {} }
      if (bubble && !bubbleSeen()) {
        setTimeout(() => {
          if (!panel.classList.contains('is-open')) bubble.classList.add('is-shown');
        }, 8000);
        if (bubbleClose) {
          bubbleClose.addEventListener('click', (e) => {
            e.stopPropagation();
            bubble.classList.remove('is-shown');
            markBubbleSeen();
          });
        }
        bubble.addEventListener('click', (e) => {
          if (e.target.closest('.chat-bubble-close')) return;
          bubble.classList.remove('is-shown');
          markBubbleSeen();
          openPanel();
        });
      }

      // ─── State + storage ───────────────────────────────────────────
      const STORE_KEY = 'infocomiva-chat-session';
      const THREAD_KEY = 'infocomiva-chat-thread';
      function loadSession() {
        try {
          const raw = localStorage.getItem(STORE_KEY);
          if (!raw) return null;
          const s = JSON.parse(raw);
          if (!s || !s.sessionToken || !s.exp) return null;
          if (Date.now() / 1000 > s.exp) { localStorage.removeItem(STORE_KEY); return null; }
          return s;
        } catch { return null; }
      }
      function saveSession(email, sessionToken, expiresIn) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify({
          email, sessionToken, exp: Math.floor(Date.now()/1000) + (expiresIn || 3600)
        })); } catch {}
      }
      function clearSession() { try { localStorage.removeItem(STORE_KEY); } catch {} }
      function loadThread() {
        try {
          const raw = localStorage.getItem(THREAD_KEY);
          if (!raw) return null;
          const t = JSON.parse(raw);
          if (!t || !t.threadToken || !t.exp) return null;
          if (Date.now() / 1000 > t.exp) { localStorage.removeItem(THREAD_KEY); return null; }
          return t;
        } catch { return null; }
      }
      function saveThread(threadToken, threadId, expiresIn) {
        try { localStorage.setItem(THREAD_KEY, JSON.stringify({
          threadToken, threadId,
          exp: Math.floor(Date.now()/1000) + (expiresIn || 24*3600)
        })); } catch {}
      }
      function clearThread() { try { localStorage.removeItem(THREAD_KEY); } catch {} }

      const state = {
        booted: false,
        step: null,
        email: '',
        otpToken: null,
        sessionToken: null,
        businessName: '',
        phone: '',
        businessType: '',
        projectDesc: '',
        escalate: false,
        threadToken: null,
        threadId: null,
        lastPolledAt: null,
        pollTimer: null,
      };

      // ─── Render helpers ────────────────────────────────────────────
      function addBot(text) {
        const el = document.createElement('div');
        el.className = 'chat-msg from-bot';
        el.innerHTML = '<div class="bubble"></div>';
        el.querySelector('.bubble').textContent = text;
        thread.appendChild(el);
        scrollThreadBottom();
      }
      function addUser(text) {
        const el = document.createElement('div');
        el.className = 'chat-msg from-user';
        el.innerHTML = '<div class="bubble"></div>';
        el.querySelector('.bubble').textContent = text;
        thread.appendChild(el);
        scrollThreadBottom();
      }
      function showTyping() {
        const el = document.createElement('div');
        el.className = 'chat-msg from-bot';
        el.dataset.typing = '1';
        el.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
        thread.appendChild(el);
        scrollThreadBottom();
        return el;
      }
      function removeTyping(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }
      function scrollThreadBottom() { thread.scrollTop = thread.scrollHeight; }
      function showError(msg) {
        errorBox.textContent = msg;
        errorBox.classList.add('is-shown');
        setTimeout(() => errorBox.classList.remove('is-shown'), 6000);
      }

      function setInputMode({ placeholder, type = 'text', sendLabel = '→', yesno: showYN = false, multiline = false }) {
        yesno.style.display = showYN ? 'flex' : 'none';
        inputBar.style.display = showYN ? 'none' : 'flex';
        if (!showYN) {
          const wanted = multiline ? 'TEXTAREA' : 'INPUT';
          if (input.tagName !== wanted) {
            const fresh = document.createElement(multiline ? 'textarea' : 'input');
            fresh.id = 'chat-input';
            if (!multiline) fresh.type = type;
            fresh.placeholder = placeholder;
            fresh.autocomplete = 'off';
            input.parentNode.replaceChild(fresh, input);
          } else {
            if (!multiline) input.type = type;
            input.placeholder = placeholder;
            input.value = '';
          }
          sendBtn.textContent = sendLabel;
          sendBtn.disabled = false;
          bindInput();
          setTimeout(() => document.getElementById('chat-input').focus(), 50);
        }
      }
      function getInputEl() { return document.getElementById('chat-input'); }

      function bindInput() {
        const el = getInputEl();
        if (!el) return;
        el.onkeydown = (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        };
      }

      // ─── State machine ─────────────────────────────────────────────
      async function advanceTo(step) {
        state.step = step;
        switch (step) {
          case 'email': {
            const existingThread = loadThread();
            if (existingThread) {
              state.threadToken = existingThread.threadToken;
              state.threadId    = existingThread.threadId;
              addBot('Welcome back. Resuming your chat with Avilash…');
              renderDoneButtons(true);
              setInputMode({ placeholder: 'Type a message…', type: 'text', sendLabel: 'Send', multiline: true });
              state.step = 'live';
              await attachFirestoreListener(state.threadId);
              return;
            }
            const existing = loadSession();
            if (existing) {
              state.email = existing.email;
              state.sessionToken = existing.sessionToken;
              addBot('Welcome back, ' + existing.email + '. Picking up where we left off.');
              advanceTo('businessName');
              return;
            }
            addBot('Hi! I’m the Infocomiva assistant. Let’s start — what’s your email? We’ll send a quick 6-digit code to verify it.');
            setInputMode({ placeholder: 'you@company.com', type: 'email', sendLabel: 'Send' });
            break;
          }
          case 'otp': {
            addBot('Sent. Check your inbox (and the spam folder, just in case). Type the 6-digit code below.');
            setInputMode({ placeholder: '123456', type: 'text', sendLabel: 'Verify' });
            break;
          }
          case 'businessName': {
            addBot('Verified ✅ May I know your business name?');
            setInputMode({ placeholder: 'e.g. Amirah Technologies', type: 'text', sendLabel: '→' });
            break;
          }
          case 'phone': {
            addBot('Thanks. What’s the best phone or WhatsApp number to reach you?');
            setInputMode({ placeholder: '+91 …', type: 'tel', sendLabel: '→' });
            break;
          }
          case 'businessType': {
            addBot('What kind of business is it? (e.g. logistics, fintech, hospitality, education)');
            setInputMode({ placeholder: 'Logistics, fintech, …', type: 'text', sendLabel: '→' });
            break;
          }
          case 'project': {
            addBot('And what would you like us to build? One line is enough — we’ll dig in on the call.');
            setInputMode({ placeholder: 'Multi-tenant SaaS for …', type: 'text', sendLabel: '→', multiline: true });
            break;
          }
          case 'escalate': {
            addBot('Last question — would you like to talk to our IT Analyst Avilash directly, right now on WhatsApp?');
            setInputMode({ placeholder: '', yesno: true });
            break;
          }
          case 'submitting': {
            showTyping();
            await submitLead();
            break;
          }
          case 'done': {
            addBot('Sent. We’ll reply on phone or email within 24 hours. Talk soon!');
            renderDoneButtons(false);
            inputBar.style.display = 'none';
            yesno.style.display = 'none';
            break;
          }
          case 'live': {
            await startLiveChat();
            break;
          }
        }
      }

      function renderDoneButtons(escalate) {
        const wrap = document.createElement('div');
        wrap.className = 'chat-yesno';
        wrap.style.display = 'flex';
        wrap.style.flexWrap = 'wrap';
        wrap.style.padding = '0 12px 16px';
        const waText = encodeURIComponent('Hi Infocomiva — I just left my details on the chat. I’m ' + (state.businessName || 'a prospect') + ', looking to build ' + (state.projectDesc || 'a custom product') + '.');
        wrap.innerHTML =
          '<a class="primary" style="text-align:center;text-decoration:none;display:inline-block;padding:11px 16px;border-radius:10px;font-size:14px;font-weight:700;background:linear-gradient(135deg,#25D366,#1ea54d);color:#fff;" target="_blank" rel="noopener" href="https://wa.me/918918897474?text=' + waText + '">WhatsApp now</a>' +
          '<a style="text-align:center;text-decoration:none;display:inline-block;padding:11px 16px;border-radius:10px;font-size:14px;font-weight:700;border:1.5px solid #ebebed;background:#fff;color:#0a0a0a;" href="tel:+918918897474">Call us</a>';
        thread.parentNode.insertBefore(wrap, errorBox);
        scrollThreadBottom();
      }

      // ─── Handlers ──────────────────────────────────────────────────
      async function handleSubmit() {
        const el = getInputEl();
        if (!el) return;
        const raw = (el.value || '').trim();
        if (!raw && state.step !== 'project') return;

        switch (state.step) {
          case 'email':         await onSubmitEmail(raw); break;
          case 'otp':           await onSubmitOtp(raw);   break;
          case 'businessName':  addUser(raw); state.businessName = raw.slice(0, 200); advanceTo('phone'); break;
          case 'phone':         addUser(raw); state.phone        = raw.slice(0, 40);  advanceTo('businessType'); break;
          case 'businessType':  addUser(raw); state.businessType = raw.slice(0, 200); advanceTo('project'); break;
          case 'project':       addUser(raw || '(no description)'); state.projectDesc = raw.slice(0, 2000); advanceTo('escalate'); break;
          case 'live':          {
            getInputEl().value = '';
            await sendVisitorMessage(raw);
            break;
          }
        }
      }

      async function onSubmitEmail(email) {
        const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
        if (!ok) { showError('Please enter a valid email.'); return; }
        addUser(email);
        state.email = email.toLowerCase();
        sendBtn.disabled = true; sendBtn.textContent = '…';
        const typing = showTyping();
        try {
          const res = await fetch('/api/send-otp', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: state.email }),
          });
          const data = await res.json().catch(() => ({}));
          removeTyping(typing);
          if (!res.ok) { showError(data.error || 'Could not send the code.'); sendBtn.disabled = false; sendBtn.textContent = 'Send'; return; }
          state.otpToken = data.token;
          advanceTo('otp');
        } catch (e) {
          removeTyping(typing);
          showError('Network error. Try again in a moment.');
          sendBtn.disabled = false; sendBtn.textContent = 'Send';
        }
      }

      async function onSubmitOtp(otp) {
        if (!/^\d{6}$/.test(otp)) { showError('Enter the 6-digit code from your email.'); return; }
        addUser(otp);
        sendBtn.disabled = true; sendBtn.textContent = '…';
        const typing = showTyping();
        try {
          const res = await fetch('/api/verify-otp', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: state.email, otp, token: state.otpToken }),
          });
          const data = await res.json().catch(() => ({}));
          removeTyping(typing);
          if (!res.ok || !data.verified) { showError(data.error || 'Verification failed.'); sendBtn.disabled = false; sendBtn.textContent = 'Verify'; return; }
          state.sessionToken = data.sessionToken;
          saveSession(state.email, state.sessionToken, data.expiresIn || 3600);
          advanceTo('businessName');
        } catch (e) {
          removeTyping(typing);
          showError('Network error. Try again in a moment.');
          sendBtn.disabled = false; sendBtn.textContent = 'Verify';
        }
      }

      async function submitLead() {
        try {
          const res = await fetch('/api/submit-lead', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionToken: state.sessionToken,
              businessName: state.businessName,
              phone:        state.phone,
              businessType: state.businessType,
              projectDesc:  state.projectDesc,
              escalate:     state.escalate,
              sourcePath:   location.pathname,
            }),
          });
          const data = await res.json().catch(() => ({}));
          const typingEls = thread.querySelectorAll('[data-typing="1"]');
          typingEls.forEach((t) => t.remove());
          if (!res.ok || !data.ok) {
            showError(data.error || 'Could not save your details. Please WhatsApp +91 89188 97474.');
            state.step = 'escalate';
            inputBar.style.display = 'none';
            yesno.style.display = 'flex';
            return;
          }
          advanceTo(state.escalate ? 'live' : 'done');
        } catch (e) {
          const typingEls = thread.querySelectorAll('[data-typing="1"]');
          typingEls.forEach((t) => t.remove());
          showError('Network error. Please WhatsApp +91 89188 97474.');
        }
      }

      // ─── Live-chat mode ────────────────────────────────────────────
      let chatUnsubscribe = null;
      const shownAdminIds = new Set();
      let threadDocUnsubscribe = null;

      async function attachFirestoreListener(threadId) {
        if (chatUnsubscribe)      { try { chatUnsubscribe();      } catch {} chatUnsubscribe      = null; }
        if (threadDocUnsubscribe) { try { threadDocUnsubscribe(); } catch {} threadDocUnsubscribe = null; }
        shownAdminIds.clear();

        const fbApp = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
        const fbFs  = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');

        const config = {
          apiKey: 'AIzaSyAmJKD3Saep17Ij4jWN2vgZSypk17VjuZg',
          authDomain: 'cargologic-saas.firebaseapp.com',
          projectId: 'cargologic-saas',
          storageBucket: 'cargologic-saas.firebasestorage.app',
          messagingSenderId: '1005412538844',
          appId: '1:1005412538844:web:26e6ce0ae52c6065c3d719',
        };
        let app;
        try { app = fbApp.initializeApp(config, 'estimator-chat'); }
        catch (e) { app = fbApp.getApp('estimator-chat'); }
        const db = fbFs.getFirestore(app);

        const ref = fbFs.collection(db, 'chatThreads', threadId, 'messages');
        const q = fbFs.query(ref, fbFs.orderBy('createdAt', 'asc'));

        chatUnsubscribe = fbFs.onSnapshot(
          q,
          (snap) => {
            snap.docs.forEach((doc) => {
              const data = doc.data();
              if (data.from !== 'admin') return;
              if (shownAdminIds.has(doc.id)) return;
              shownAdminIds.add(doc.id);
              if (data.text) addBot(data.text);
            });
          },
          (err) => {
            console.warn('[chat] onSnapshot error:', err);
            showError('Live chat error: ' + (err.message || err.code || 'subscription failed'));
          },
        );

        const threadDocRef = fbFs.doc(db, 'chatThreads', threadId);
        let everExisted = false;
        threadDocUnsubscribe = fbFs.onSnapshot(
          threadDocRef,
          (snap) => {
            if (snap.exists()) { everExisted = true; return; }
            if (everExisted) {
              addBot('Avilash closed this conversation. Starting fresh — what would you like to chat about?');
            } else {
              addBot('This chat is no longer available. Starting a new one — what would you like to chat about?');
            }
            resetChatToWizard();
          },
          (err) => {
            console.warn('[chat] thread-doc onSnapshot error:', err);
          },
        );
      }

      function resetChatToWizard() {
        if (chatUnsubscribe)      { try { chatUnsubscribe();      } catch {} chatUnsubscribe      = null; }
        if (threadDocUnsubscribe) { try { threadDocUnsubscribe(); } catch {} threadDocUnsubscribe = null; }
        shownAdminIds.clear();
        clearThread();
        state.threadToken = null;
        state.threadId    = null;
        advanceTo('businessName');
      }
      async function startLiveChat() {
        addBot('Opening a live chat with Avilash…');
        try {
          const res = await fetch('/api/chat-start', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionToken: state.sessionToken,
              businessName: state.businessName,
              phone:        state.phone,
              businessType: state.businessType,
              projectDesc:  state.projectDesc,
              sourcePath:   location.pathname,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok) {
            showError(data.error || 'Could not open the live chat.');
            renderDoneButtons(true);
            addBot('You can WhatsApp or call Avilash directly using the buttons below.');
            inputBar.style.display = 'none';
            yesno.style.display = 'none';
            return;
          }
          state.threadToken = data.threadToken;
          state.threadId = data.threadId;
          saveThread(data.threadToken, data.threadId, data.expiresIn || 24*3600);
          await attachFirestoreListener(state.threadId);
        } catch (e) {
          showError('Network error opening chat.');
          renderDoneButtons(true);
          inputBar.style.display = 'none';
          yesno.style.display = 'none';
          return;
        }

        renderDoneButtons(true);
        addBot('You’re connected. Type below — Avilash will reply here as soon as he sees this.');
        setInputMode({ placeholder: 'Type a message…', type: 'text', sendLabel: 'Send', multiline: true });
        pollLoop();
      }

      function pollLoop() { /* Firestore onSnapshot handles real-time delivery */ }

      async function sendVisitorMessage(text) {
        if (!state.threadToken) return;
        addUser(text);
        try {
          const res = await fetch('/api/chat-send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ threadToken: state.threadToken, text }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status === 404 || res.status === 410 || res.status === 401) {
              resetChatToWizard();
              return;
            }
            showError(data.error || 'Could not send message.');
          }
        } catch (e) {
          showError('Network error. Try again.');
        }
      }

      sendBtn.addEventListener('click', handleSubmit);
      yesno.querySelectorAll('[data-yn]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const yn = btn.dataset.yn;
          state.escalate = (yn === 'yes');
          addUser(yn === 'yes' ? 'Yes, connect me now' : 'No, just send my details');
          advanceTo('submitting');
        });
      });
      bindInput();
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
