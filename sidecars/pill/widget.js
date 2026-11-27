(() => {
  if (window.__agCtxPillVersion === 13) return;
  window.__agCtxPillVersion = 13;
  window.__agCtxPillInstalled = true;

  const PILL_ID = 'ag-ctx-pill-host';
  const SETTINGS_ID = 'ag-ctx-settings-host';
  const PREFS_KEY = 'ag-ctx-pill-prefs-v1';

  document.getElementById(PILL_ID)?.remove();
  document.getElementById(SETTINGS_ID)?.remove();
  document.getElementById('ag-effort-pill-host')?.remove();

  const loadPrefs = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      return {
        daily: raw.daily !== false,
        cache: raw.cache !== false,
        quota: raw.quota !== false,
        context: raw.context !== false,
      };
    } catch {
      return { daily: true, cache: true, quota: true, context: true };
    }
  };

  const savePrefs = (p) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {}
  };

  let prefs = loadPrefs();
  let latestPayload = null;

  const formatTokens = (n) => {
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(Math.round(n));
  };

  const formatPct = (pct) => {
    if (!Number.isFinite(pct)) return '—';
    return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1).replace(/\.0$/, '')}%`;
  };

  const formatCountdown = (iso) => {
    if (!iso) return '—';
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms)) return '—';
    if (ms <= 0) return '即将重置';
    const totalMin = Math.floor(ms / 60_000);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    if (d > 0) return `${d}d ${h}h 后`;
    return h > 0 ? `${h}h ${m}m 后` : `${m}m 后`;
  };

  const formatClock = (iso, withDate = false) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (!withDate) return hhmm;
    return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
  };

  const getContextTone = (pct) => {
    if (pct >= 85) return { stroke: '#ef4444', bg: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239, 68, 68, 0.28)', text: '#dc2626' };
    if (pct >= 60) return { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)', border: 'rgba(245, 158, 11, 0.28)', text: '#d97706' };
    return { stroke: '#6366f1', bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.22)', text: 'currentColor' };
  };

  const getCacheTone = (pct) => {
    if (pct === null || pct === undefined) {
      return { stroke: '#9ca3af', bg: 'rgba(128, 128, 128, 0.06)', border: 'rgba(128, 128, 128, 0.22)', text: 'currentColor' };
    }
    if (pct >= 80) return { stroke: '#10b981', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.24)', text: '#059669' };
    if (pct >= 50) return { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)', border: 'rgba(245, 158, 11, 0.28)', text: '#d97706' };
    return { stroke: '#ef4444', bg: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239, 68, 68, 0.28)', text: '#dc2626' };
  };

  const getQuotaTone = (pct) => {
    if (!Number.isFinite(pct)) {
      return { stroke: '#9ca3af', bg: 'rgba(128, 128, 128, 0.06)', border: 'rgba(128, 128, 128, 0.22)', text: 'currentColor' };
    }
    if (pct >= 50) return { stroke: '#0284c7', bg: 'rgba(2, 132, 199, 0.08)', border: 'rgba(2, 132, 199, 0.24)', text: '#0369a1' };
    if (pct >= 20) return { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)', border: 'rgba(245, 158, 11, 0.28)', text: '#d97706' };
    return { stroke: '#ef4444', bg: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239, 68, 68, 0.28)', text: '#dc2626' };
  };

  const isDarkTheme = () => {
    try {
      const bg = getComputedStyle(document.body).backgroundColor;
      const m = bg.match(/\d+/g);
      if (!m || m.length < 3) return false;
      const lum = (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255;
      return lum < 0.45;
    } catch {
      return false;
    }
  };

  const findActiveEditor = () => {
    const editors = [...document.querySelectorAll('[contenteditable="true"], textarea')].filter((el) => {
      if (el.closest(`#${PILL_ID}`) || el.closest(`#${SETTINGS_ID}`)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 120 && r.height > 16;
    });
    return editors[editors.length - 1] || null;
  };

  const triggerCompact = async (ctxPillEl, tipModelEl) => {
    const editor = findActiveEditor();
    if (!editor) return;
    const currentText = (editor.tagName === 'TEXTAREA' ? editor.value : editor.textContent || '').trim();
    if (currentText.length > 0) {
      if (tipModelEl) {
        const prev = tipModelEl.textContent;
        tipModelEl.textContent = '请先清空输入框再双击压缩';
        setTimeout(() => { if (tipModelEl) tipModelEl.textContent = prev; }, 1800);
      }
      return;
    }

    editor.focus();
    if (editor.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(editor, '/compact');
      else editor.value = '/compact';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const ok = document.execCommand('insertText', false, '/compact');
      if (!ok) {
        editor.textContent = '/compact';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: '/compact', inputType: 'insertText' }));
      }
    }

    if (ctxPillEl) {
      ctxPillEl.style.transform = 'scale(0.94)';
      setTimeout(() => { ctxPillEl.style.transform = ''; }, 150);
    }

    await new Promise((r) => setTimeout(r, 150));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 140));
    const { turbo } = findTurboAnchor() ? { turbo: findTurboAnchor() } : { turbo: null };
    const bar = turbo?.parentElement;
    const sendBtn = bar
      ? [...bar.querySelectorAll('button, [role="button"]')].filter((b) => {
          if (b.id === PILL_ID || b.closest(`#${PILL_ID}`) || b.disabled) return false;
          const r = b.getBoundingClientRect();
          return r.width > 16 && r.height > 16;
        }).pop()
      : null;
    if (sendBtn && sendBtn !== turbo) {
      sendBtn.click();
    } else {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
  };

  const findTurboAnchor = () => {
    const editors = [...document.querySelectorAll('[contenteditable="true"], textarea')].filter((el) => {
      if (el.closest(`#${PILL_ID}`) || el.closest(`#${SETTINGS_ID}`)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 120 && r.height > 16;
    });
    for (const editor of editors) {
      let box = editor.parentElement;
      for (let i = 0; i < 6 && box; i++, box = box.parentElement) {
        const btns = [...box.querySelectorAll('button, [role="button"]')].filter((b) => {
          if (b.id === PILL_ID || b.closest(`#${PILL_ID}`)) return false;
          const r = b.getBoundingClientRect();
          return r.width > 20 && r.height > 14 && r.height < 44;
        });
        const turbo = btns.find((b) => /\b(Turbo|Auto|Review|Ask|Proceed)\b/i.test((b.textContent || '').trim()));
        if (turbo && turbo.parentElement) return turbo;
      }
    }
    return null;
  };

  const ensureSettingsControl = () => {
    const headings = [...document.querySelectorAll('*')].filter((el) => {
      if (el.children.length > 0 || el.closest(`#${SETTINGS_ID}`)) return false;
      return (el.textContent || '').trim() === 'Input Box';
    });
    const inputBoxHeading = headings.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!inputBoxHeading) return;

    const section = inputBoxHeading.parentElement;
    if (!section) return;
    let cardList = section.querySelector(`#${SETTINGS_ID}`);
    if (cardList) {
      updateSettingsUI(cardList);
      return;
    }

    const container =
      [...section.children].find((c) => c !== inputBoxHeading && /Send message|Queued messages/i.test(c.textContent || '')) ||
      section;

    const host = document.createElement('div');
    host.id = SETTINGS_ID;
    host.style.cssText = 'margin-top:8px;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: block;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(128, 128, 128, 0.20);
          background: rgba(128, 128, 128, 0.02);
          color: inherit;
        }
        .info {
          min-width: 0;
        }
        .title {
          font-size: 13.5px;
          font-weight: 500;
          line-height: 1.35;
        }
        .desc {
          font-size: 12px;
          opacity: 0.65;
          margin-top: 2px;
          line-height: 1.35;
        }
        .seg {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 3px;
          border-radius: 10px;
          border: 1px solid rgba(128, 128, 128, 0.22);
          background: rgba(128, 128, 128, 0.06);
          flex-shrink: 0;
        }
        .seg-btn {
          border: none;
          background: transparent;
          color: inherit;
          opacity: 0.62;
          font-family: inherit;
          font-size: 12px;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 7px;
          cursor: pointer;
          transition: background 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
        }
        .seg-btn:hover {
          opacity: 0.9;
        }
        .seg-btn.on {
          opacity: 1;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.10);
        }
        .row.dark .seg-btn.on {
          background: rgba(255, 255, 255, 0.14);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        }
      </style>
      <div class="row" id="row">
        <div class="info">
          <div class="title">Context Pills</div>
          <div class="desc">选择要在输入框右下角显示的监控胶囊</div>
        </div>
        <div class="seg" role="group" aria-label="Context Pills">
          <button type="button" class="seg-btn" data-key="daily">今日用量</button>
          <button type="button" class="seg-btn" data-key="cache">缓存命中</button>
          <button type="button" class="seg-btn" data-key="quota">5h额度</button>
          <button type="button" class="seg-btn" data-key="context">上下文占比</button>
        </div>
      </div>
    `;

    for (const btn of shadow.querySelectorAll('.seg-btn')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = btn.dataset.key;
        prefs = { ...prefs, [k]: !prefs[k] };
        savePrefs(prefs);
        updateSettingsUI(host);
        render();
      });
    }

    container.appendChild(host);
    updateSettingsUI(host);
  };

  const updateSettingsUI = (host) => {
    const s = host?.shadowRoot;
    if (!s) return;
    s.getElementById('row')?.classList.toggle('dark', isDarkTheme());
    for (const btn of s.querySelectorAll('.seg-btn')) {
      const k = btn.dataset.key;
      btn.classList.toggle('on', Boolean(prefs[k]));
    }
  };

  const ensurePill = () => {
    const turbo = findTurboAnchor();
    if (!turbo || !turbo.parentElement) return null;

    let host = document.getElementById(PILL_ID);
    if (host && host.parentElement === turbo.parentElement && host.nextElementSibling === turbo) {
      return host;
    }
    if (host) host.remove();

    host = document.createElement('span');
    host.id = PILL_ID;
    host.style.cssText = 'display:inline-flex;align-items:center;gap:5px;margin-right:6px;position:relative;vertical-align:middle;z-index:20;';

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .group {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .pill {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 24px;
          padding: 0 8px 0 6px;
          border-radius: 999px;
          border: 1px solid rgba(128, 128, 128, 0.22);
          background: rgba(128, 128, 128, 0.06);
          font-size: 11.5px;
          font-weight: 500;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          cursor: default;
          user-select: none;
          transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
          color: inherit;
        }
        .pill[hidden] {
          display: none;
        }
        #ctx-pill {
          cursor: pointer;
        }
        .pill:hover {
          transform: translateY(-0.5px);
        }
        .pill.daily {
          background: rgba(14, 165, 233, 0.08);
          border-color: rgba(14, 165, 233, 0.22);
        }
        svg.ring {
          width: 13px;
          height: 13px;
          flex-shrink: 0;
          transform: rotate(-90deg);
        }
        svg.ico {
          width: 12px;
          height: 12px;
          flex-shrink: 0;
        }
        .ring-bg {
          fill: none;
          stroke: rgba(128, 128, 128, 0.22);
          stroke-width: 2.2;
        }
        .ring-fg {
          fill: none;
          stroke: #6366f1;
          stroke-width: 2.2;
          stroke-linecap: round;
          transition: stroke-dashoffset 0.35s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.25s ease;
        }
        .pct {
          letter-spacing: -0.01em;
        }
        .tip {
          position: absolute;
          bottom: calc(100% + 9px);
          right: 0;
          min-width: 214px;
          padding: 10px 12px;
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.97);
          color: #1f2328;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.13);
          backdrop-filter: blur(14px);
          font-size: 11.5px;
          line-height: 1.45;
          opacity: 0;
          pointer-events: none;
          transform: translateY(4px);
          transition: opacity 0.16s ease, transform 0.16s ease;
        }
        .group.dark .tip {
          background: rgba(28, 30, 38, 0.97);
          color: #e6e8ef;
          border-color: rgba(255, 255, 255, 0.11);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
        }
        .pill:hover .tip {
          opacity: 1;
          transform: translateY(0);
        }
        .tip-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 6px;
        }
        .tip-title {
          font-weight: 600;
          font-size: 11.5px;
        }
        .tip-badge {
          font-size: 10.5px;
          opacity: 0.65;
          font-variant-numeric: tabular-nums;
        }
        .tip-bar {
          display: flex;
          height: 5px;
          border-radius: 999px;
          background: rgba(128, 128, 128, 0.16);
          overflow: hidden;
          margin-bottom: 8px;
        }
        .tip-fill {
          height: 100%;
          transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.25s ease;
        }
        .seg-read { background: #10b981; }
        .seg-miss { background: #f59e0b; }
        .seg-out  { background: #6366f1; }
        .tip-grid {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 3px 12px;
          align-items: center;
        }
        .tip-k {
          opacity: 0.68;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
        }
        .tip-v {
          font-weight: 600;
          font-size: 11px;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .tip-foot {
          margin-top: 7px;
          padding-top: 6px;
          border-top: 1px solid rgba(128, 128, 128, 0.14);
          font-size: 10.5px;
          opacity: 0.68;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          white-space: nowrap;
        }
        .tip-model {
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 150px;
        }
      </style>
      <div class="group" id="group">
        <!-- 1. Daily Tokens Pill -->
        <div class="pill daily" id="daily-pill">
          <svg class="ico" style="color:#0ea5e9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 13V8m5 5V3m5 10V6"/>
          </svg>
          <span class="pct" id="daily-total">—</span>
          <div class="tip">
            <div class="tip-head">
              <span class="tip-title">今日用量</span>
              <span class="tip-badge" id="daily-reqs">— 次请求</span>
            </div>
            <div class="tip-bar">
              <div class="tip-fill seg-read" id="daily-seg-read" style="width:0%"></div>
              <div class="tip-fill seg-miss" id="daily-seg-miss" style="width:0%"></div>
              <div class="tip-fill seg-out" id="daily-seg-out" style="width:0%"></div>
            </div>
            <div class="tip-grid">
              <span class="tip-k"><i class="dot" style="background:#10b981"></i>缓存读取</span><span class="tip-v" id="daily-read">—</span>
              <span class="tip-k"><i class="dot" style="background:#f59e0b"></i>未命中输入</span><span class="tip-v" id="daily-miss">—</span>
              <span class="tip-k"><i class="dot" style="background:#6366f1"></i>输出 Token</span><span class="tip-v" id="daily-out">—</span>
            </div>
            <div class="tip-foot">
              <span>当前会话累计</span>
              <span id="daily-session-total">—</span>
            </div>
          </div>
        </div>

        <!-- 2. Cache Hit Pill -->
        <div class="pill" id="cache-pill">
          <svg class="ico" id="cache-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8l1-5.5Z"/>
          </svg>
          <span class="pct" id="cache-pct">—</span>
          <div class="tip">
            <div class="tip-head">
              <span class="tip-title">Prompt 缓存命中</span>
              <span class="tip-badge" id="cache-tip-rate">—</span>
            </div>
            <div class="tip-bar"><div class="tip-fill" id="cache-tip-fill" style="width:0%"></div></div>
            <div class="tip-grid">
              <span class="tip-k">本轮缓存读取</span><span class="tip-v" id="cache-tip-read">—</span>
              <span class="tip-k">本轮未命中</span><span class="tip-v" id="cache-tip-miss">—</span>
              <span class="tip-k">本轮输出</span><span class="tip-v" id="cache-tip-out">—</span>
            </div>
            <div class="tip-foot">
              <span>会话平均命中</span>
              <span id="cache-tip-avg">—</span>
            </div>
          </div>
        </div>

        <!-- 3. Gemini 5h Quota Pill -->
        <div class="pill" id="quota-pill">
          <svg class="ico" id="quota-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="5.8"/>
            <path d="M8 4.8v3.4l2.2 1.3"/>
          </svg>
          <span class="pct" id="quota-pct">—</span>
          <div class="tip">
            <div class="tip-head">
              <span class="tip-title">Gemini 5h 额度</span>
              <span class="tip-badge" id="quota-tip-rate">—</span>
            </div>
            <div class="tip-bar"><div class="tip-fill" id="quota-tip-fill" style="width:0%"></div></div>
            <div class="tip-grid" style="margin-bottom:8px;">
              <span class="tip-k">重置倒计时</span><span class="tip-v" id="quota-tip-cd">—</span>
              <span class="tip-k">重置时间</span><span class="tip-v" id="quota-tip-at">—</span>
            </div>
            <div class="tip-head">
              <span class="tip-title">Gemini 周额度</span>
              <span class="tip-badge" id="quota-wk-rate">—</span>
            </div>
            <div class="tip-bar"><div class="tip-fill" id="quota-wk-fill" style="width:0%"></div></div>
            <div class="tip-grid">
              <span class="tip-k">重置倒计时</span><span class="tip-v" id="quota-wk-cd">—</span>
              <span class="tip-k">重置时间</span><span class="tip-v" id="quota-wk-at">—</span>
            </div>
            <div class="tip-foot">
              <span>共享池模型</span>
              <span id="quota-tip-models">—</span>
            </div>
          </div>
        </div>

        <!-- 4. Context Pill -->
        <div class="pill" id="ctx-pill">
          <svg class="ring" viewBox="0 0 16 16" aria-hidden="true">
            <circle class="ring-bg" cx="8" cy="8" r="5.8"></circle>
            <circle class="ring-fg" id="ring-fg" cx="8" cy="8" r="5.8"></circle>
          </svg>
          <span class="pct" id="ctx-pct">—</span>
          <div class="tip">
            <div class="tip-head">
              <span class="tip-title">上下文窗口</span>
              <span class="tip-badge" id="ctx-tip-tokens">—</span>
            </div>
            <div class="tip-bar"><div class="tip-fill" id="ctx-tip-fill" style="width:0%"></div></div>
            <div class="tip-grid">
              <span class="tip-k">剩余可用</span><span class="tip-v" id="ctx-tip-rem">—</span>
              <span class="tip-k">解码速度</span><span class="tip-v" id="ctx-tip-tps">—</span>
              <span class="tip-k">首字延迟</span><span class="tip-v" id="ctx-tip-ttft">—</span>
            </div>
            <div class="tip-foot">
              <span class="tip-model" id="ctx-tip-model">Waiting…</span>
              <span id="ctx-tip-reqs">—</span>
            </div>
            <div style="margin-top:4px;font-size:10px;opacity:0.5;text-align:right;">双击胶囊压缩上下文</div>
          </div>
        </div>
      </div>
    `;

    for (const ev of ['pointerdown', 'mousedown', 'click']) {
      shadow.addEventListener(ev, (e) => e.stopPropagation());
    }
    const ctxPillEl = shadow.getElementById('ctx-pill');
    const tipModelEl = shadow.getElementById('ctx-tip-model');
    ctxPillEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void triggerCompact(ctxPillEl, tipModelEl);
    });

    turbo.parentElement.insertBefore(host, turbo);
    return host;
  };

  const selectConversationData = () => {
    if (!latestPayload) return null;
    const href = location.href || '';
    const m = href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (m && latestPayload.byId && latestPayload.byId[m[0].toLowerCase()]) {
      return latestPayload.byId[m[0].toLowerCase()];
    }
    return latestPayload.latest || null;
  };

  const render = () => {
    ensureSettingsControl();

    const host = ensurePill();
    if (!host || !host.shadowRoot) return;
    const s = host.shadowRoot;
    const group = s.getElementById('group');
    const dark = isDarkTheme();
    group.classList.toggle('dark', dark);

    const dailyPill = s.getElementById('daily-pill');
    const cachePill = s.getElementById('cache-pill');
    const quotaPill = s.getElementById('quota-pill');
    const ctxPill = s.getElementById('ctx-pill');
    dailyPill.hidden = !prefs.daily;
    cachePill.hidden = !prefs.cache;
    quotaPill.hidden = !prefs.quota;
    ctxPill.hidden = !prefs.context;
    host.style.marginRight = prefs.daily || prefs.cache || prefs.quota || prefs.context ? '6px' : '0px';

    // Daily
    const daily = latestPayload?.daily;
    s.getElementById('daily-total').textContent = daily ? formatTokens(daily.totalTokens) : '—';
    s.getElementById('daily-reqs').textContent = daily ? `${daily.requests} 次请求` : '—';
    if (daily && daily.totalTokens > 0) {
      s.getElementById('daily-seg-read').style.width = `${(daily.cacheRead / daily.totalTokens) * 100}%`;
      s.getElementById('daily-seg-miss').style.width = `${(daily.uncached / daily.totalTokens) * 100}%`;
      s.getElementById('daily-seg-out').style.width = `${(daily.output / daily.totalTokens) * 100}%`;
      s.getElementById('daily-read').textContent = formatTokens(daily.cacheRead);
      s.getElementById('daily-miss').textContent = formatTokens(daily.uncached);
      s.getElementById('daily-out').textContent = formatTokens(daily.output);
    } else {
      s.getElementById('daily-seg-read').style.width = '0%';
      s.getElementById('daily-seg-miss').style.width = '0%';
      s.getElementById('daily-seg-out').style.width = '0%';
      s.getElementById('daily-read').textContent = '0';
      s.getElementById('daily-miss').textContent = '0';
      s.getElementById('daily-out').textContent = '0';
    }

    // Gemini 5h & Weekly Quota
    const gq = latestPayload?.geminiQuota;
    const quotaIcon = s.getElementById('quota-icon');
    const quotaPctEl = s.getElementById('quota-pct');
    if (gq && Number.isFinite(gq.pct)) {
      const qPct = Math.max(0, Math.min(100, gq.pct));
      const qTone = getQuotaTone(qPct);
      quotaPctEl.textContent = formatPct(qPct);
      quotaPctEl.style.color = dark && qPct >= 50 ? '#38bdf8' : qTone.text;
      quotaIcon.style.color = qTone.stroke;
      quotaPill.style.background = qTone.bg;
      quotaPill.style.borderColor = qTone.border;
      s.getElementById('quota-tip-rate').textContent = `${qPct.toFixed(1)}%`;
      s.getElementById('quota-tip-fill').style.width = `${qPct}%`;
      s.getElementById('quota-tip-fill').style.background = qTone.stroke;
      s.getElementById('quota-tip-cd').textContent = formatCountdown(gq.resetTime);
      s.getElementById('quota-tip-at').textContent = formatClock(gq.resetTime, false);

      if (Number.isFinite(gq.weeklyPct)) {
        const wPct = Math.max(0, Math.min(100, gq.weeklyPct));
        const wTone = getQuotaTone(wPct);
        s.getElementById('quota-wk-rate').textContent = `${wPct.toFixed(1)}%`;
        s.getElementById('quota-wk-fill').style.width = `${wPct}%`;
        s.getElementById('quota-wk-fill').style.background = wTone.stroke;
        s.getElementById('quota-wk-cd').textContent = formatCountdown(gq.weeklyResetTime);
        s.getElementById('quota-wk-at').textContent = formatClock(gq.weeklyResetTime, true);
      } else {
        s.getElementById('quota-wk-rate').textContent = '—';
        s.getElementById('quota-wk-fill').style.width = '0%';
        s.getElementById('quota-wk-cd').textContent = '—';
        s.getElementById('quota-wk-at').textContent = '—';
      }

      const famNames = (gq.families || []).map((f) => f.name.replace(/^Gemini\s*/i, '')).join(' · ');
      s.getElementById('quota-tip-models').textContent = famNames || 'Gemini';
    } else {
      quotaPctEl.textContent = '—';
      s.getElementById('quota-tip-rate').textContent = '—';
      s.getElementById('quota-tip-fill').style.width = '0%';
      s.getElementById('quota-tip-cd').textContent = '—';
      s.getElementById('quota-tip-at').textContent = '—';
      s.getElementById('quota-wk-rate').textContent = '—';
      s.getElementById('quota-wk-fill').style.width = '0%';
      s.getElementById('quota-wk-cd').textContent = '—';
      s.getElementById('quota-wk-at').textContent = '—';
      s.getElementById('quota-tip-models').textContent = '—';
    }

    const d = selectConversationData();
    s.getElementById('daily-session-total').textContent = d ? formatTokens(d.sessionTotalTokens) : '—';

    const ctxPctEl = s.getElementById('ctx-pct');
    const ringFg = s.getElementById('ring-fg');
    const radius = 5.8;
    const circumference = 2 * Math.PI * radius;
    ringFg.style.strokeDasharray = `${circumference}`;

    const cacheIcon = s.getElementById('cache-icon');
    const cachePctEl = s.getElementById('cache-pct');

    if (!d) {
      ctxPctEl.textContent = '0%';
      ringFg.style.strokeDashoffset = `${circumference}`;
      s.getElementById('ctx-tip-tokens').textContent = '0 / —';
      s.getElementById('ctx-tip-fill').style.width = '0%';
      s.getElementById('ctx-tip-rem').textContent = '—';
      s.getElementById('ctx-tip-tps').textContent = '—';
      s.getElementById('ctx-tip-ttft').textContent = '—';
      s.getElementById('ctx-tip-model').textContent = '新对话';
      s.getElementById('ctx-tip-reqs').textContent = '0 轮';

      cachePctEl.textContent = '—';
      s.getElementById('cache-tip-rate').textContent = '—';
      s.getElementById('cache-tip-fill').style.width = '0%';
      s.getElementById('cache-tip-read').textContent = '0';
      s.getElementById('cache-tip-miss').textContent = '0';
      s.getElementById('cache-tip-out').textContent = '0';
      s.getElementById('cache-tip-avg').textContent = '—';
      return;
    }

    const pct = Math.max(0, Math.min(100, d.percent || 0));
    const ctxTone = getContextTone(pct);
    ctxPctEl.textContent = formatPct(pct);
    ctxPctEl.style.color = pct >= 60 ? ctxTone.text : '';
    ringFg.style.stroke = ctxTone.stroke;
    ringFg.style.strokeDashoffset = `${circumference * (1 - pct / 100)}`;
    ctxPill.style.background = ctxTone.bg;
    ctxPill.style.borderColor = ctxTone.border;
    s.getElementById('ctx-tip-tokens').textContent = `${formatTokens(d.usedTokens)} / ${formatTokens(d.maxTokens)}`;
    s.getElementById('ctx-tip-fill').style.width = `${pct}%`;
    s.getElementById('ctx-tip-fill').style.background = ctxTone.stroke;
    s.getElementById('ctx-tip-rem').textContent = formatTokens(Math.max(0, d.maxTokens - d.usedTokens));
    s.getElementById('ctx-tip-tps').textContent = Number.isFinite(d.tps) ? `${Math.round(d.tps)} tok/s` : '—';
    s.getElementById('ctx-tip-ttft').textContent = Number.isFinite(d.ttftSec) ? `${d.ttftSec.toFixed(1)}s` : '—';
    s.getElementById('ctx-tip-model').textContent = d.modelLabel || 'Active session';
    s.getElementById('ctx-tip-reqs').textContent = `${d.sessionRequests || 0} 次请求`;

    const hasCache = Number.isFinite(d.cacheHitPct);
    const cachePct = hasCache ? Math.max(0, Math.min(100, d.cacheHitPct)) : null;
    const cacheTone = getCacheTone(cachePct);
    cachePctEl.textContent = hasCache ? formatPct(cachePct) : '—';
    cachePctEl.style.color = dark && cachePct >= 80 ? '#34d399' : (hasCache ? cacheTone.text : '');
    cacheIcon.style.color = cacheTone.stroke;
    cachePill.style.background = cacheTone.bg;
    cachePill.style.borderColor = cacheTone.border;
    s.getElementById('cache-tip-rate').textContent = hasCache ? `${cachePct.toFixed(1)}%` : '—';
    s.getElementById('cache-tip-fill').style.width = `${cachePct || 0}%`;
    s.getElementById('cache-tip-fill').style.background = cacheTone.stroke;
    s.getElementById('cache-tip-read').textContent = formatTokens(d.cacheReadTokens);
    s.getElementById('cache-tip-miss').textContent = formatTokens(d.uncachedTokens);
    s.getElementById('cache-tip-out').textContent = formatTokens(d.outputTokens);
    s.getElementById('cache-tip-avg').textContent = Number.isFinite(d.sessionCacheHitPct) ? `${d.sessionCacheHitPct.toFixed(1)}%` : '—';
  };

  window.__agCtxPillUpdate = (payload) => {
    latestPayload = payload;
    render();
  };

  let rafPending = false;
  const scheduleRender = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      render();
    });
  };

  const observer = new MutationObserver(() => {
    if (!document.getElementById(PILL_ID) || !document.getElementById(SETTINGS_ID)) scheduleRender();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  render();
})();
