/**
 * OJ 题解站 — 核心逻辑
 * 
 * 功能：
 * - 密码登录保护
 * - 题目列表 + 搜索 + 筛选
 * - 题解详情（Markdown 渲染 + 代码高亮 + 复制按钮）
 * - 亮/暗主题切换
 */
(function () {
  'use strict';

  // ========== 配置 ==========
  // API 走相对路径：
  //   - Cloudflare Pages 上 /api/* → Functions
  //   - 本地 server.js 端口 8766 上 /api/* → 后端服务（同源）
  const IS_CLOUDFLARE = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  const API_BASE = '';
  let HAS_BACKEND = !IS_CLOUDFLARE; // Cloudflare 上一直有 Functions

  let INDEX = null;
  let currentFilter = 'all';
  let searchQuery = '';
  let userRole = null; // 'user' | 'admin'

  // ========== Init ==========
  async function init() {
    initTheme();

    if (!isAuthenticated()) {
      // Cloudflare 上 Functions 始终在线，直接显示登录页
      // 本地开发时探测后端是否可用
      let backendOk = false;

      if (IS_CLOUDFLARE) {
        backendOk = true;
      } else {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 1500);
          const res = await fetch(API_BASE + '/api/me', {
            signal: ctrl.signal,
            headers: { 'Authorization': 'Bearer probe' }
          });
          clearTimeout(timer);
          if (res.status === 401 || res.ok) backendOk = true;
          else throw new Error('non-ok');
        } catch {
          backendOk = false;
        }
      }

      HAS_BACKEND = backendOk;

      if (backendOk) {
        // 后端在线，显示登录页
        renderHeader();
        initBackToTop();
        renderAuth();
      } else {
        // 后端不可用，跳过登录，只读模式
        HAS_BACKEND = false;
        userRole = 'user';
        await loadIndex();
        renderHeader();
        initBackToTop();
        router();
      }
    } else {
      // 已有 session
      const session = getSession();
      if (session) userRole = session.role;
      renderHeader();
      initBackToTop();
      await loadIndex();
      router();
    }

    window.addEventListener('hashchange', () => {
      if (!isAuthenticated() && HAS_BACKEND) return;
      if (!HAS_BACKEND && !INDEX) { router(); return; }
      router();
    });

    // Ctrl/Cmd + K 快捷搜索
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.getElementById('searchInput');
        if (input) input.focus();
      }
    });
  }

  // ========== Back to Top ==========
  function initBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;

    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    }, { passive: true });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ========== Auth ==========
  function getSession() {
    const raw = localStorage.getItem('oj-session');
    if (!raw) return null;
    try {
      const { token, role, timestamp } = JSON.parse(raw);
      // 24小时过期
      if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('oj-session');
        return null;
      }
      return { token, role, timestamp };
    } catch { return null; }
  }

  function isAuthenticated() {
    return getSession() !== null;
  }

  function isAdmin() {
    return userRole === 'admin';
  }

  function setSession(token, role) {
    userRole = role;
    localStorage.setItem('oj-session', JSON.stringify({ token, role, timestamp: Date.now() }));
  }

  function clearSession() {
    userRole = null;
    localStorage.removeItem('oj-session');
  }

  async function authenticate(password) {
    try {
      const res = await fetch(API_BASE + '/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { role: null, error: data.error || '认证失败' };
      }
      const data = await res.json();
      if (data.token) {
        setSession(data.token, data.role);
        return { role: data.role };
      }
      return { role: null, error: '认证失败' };
    } catch {
      // 后端不可用，降级为本地模式
      HAS_BACKEND = false;
      return { role: null, backendDown: true };
    }
  }

  function renderAuth() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card" style="position:relative;">
          <div class="auth-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 class="auth-title">章老师的OJ题解站</h2>
          <p class="auth-subtitle">请输入访问密码</p>
          <input type="password" class="auth-input" id="authPassword"
                 placeholder="输入密码…" autocomplete="current-password">
          <button class="auth-btn" id="authBtn">进入</button>
          <div class="auth-error" id="authError"></div>

        </div>
      </div>
    `;

    const input = document.getElementById('authPassword');
    const btn = document.getElementById('authBtn');
    const error = document.getElementById('authError');

    async function tryLogin() {
      const pw = input.value;
      if (!pw) { error.textContent = '请输入密码'; return; }
      btn.disabled = true;
      btn.textContent = '验证中...';
      const result = await authenticate(pw);
      btn.disabled = false;
      btn.textContent = '进入';
      if (result.role) {
        await loadIndex();
        renderHeader();
        router();
      } else if (result.backendDown) {
        error.textContent = '后端服务未启动，仅可浏览题解';
        // 降级模式：以普通用户身份进入（只能查看）
        userRole = 'user';
        await loadIndex();
        renderHeader();
        router();
      } else {
        error.textContent = result.error || '密码错误';
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 400);
      }
    }

    btn.addEventListener('click', tryLogin);
    input.addEventListener('keydown', (e) => {
      error.textContent = '';
      if (e.key === 'Enter') tryLogin();
    });
    input.focus();
  }

  // ========== Theme ==========
  function initTheme() {
    const saved = localStorage.getItem('oj-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    // 切换主题时临时禁用所有 transition，防止大量元素同时动画导致卡顿
    document.documentElement.classList.add('no-transition');
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('oj-theme', next);
    updateHljsTheme();
    // 下一帧恢复 transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('no-transition');
      });
    });
  }

  function updateHljsTheme() {
    const dark = document.getElementById('hljs-dark');
    const light = document.getElementById('hljs-light');
    const theme = document.documentElement.getAttribute('data-theme');
    if (dark) dark.disabled = theme !== 'dark';
    if (light) light.disabled = theme !== 'light';
  }

  const themeObserver = new MutationObserver(updateHljsTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ========== Header ==========
  function renderHeader() {
    const header = document.getElementById('header');
    const admin = isAdmin();
    header.innerHTML = `
      <div class="header-inner">
        <div class="logo" onclick="location.hash='#/'">
          <div class="logo-icon">OI</div>
          <span>章老师的OJ题解站</span>
        </div>
        <button class="mobile-toggle" id="mobileToggle" aria-label="菜单">
          <span></span><span></span><span></span>
        </button>
        <nav class="nav" id="mainNav">
          <a class="nav-link" href="#/" data-nav>全部题解</a>
          <a class="nav-link" href="#/tags" data-nav>标签分类</a>
          ${admin ? `<a class="nav-link" href="#/guide" data-nav>使用指南</a>
          <a class="nav-link nav-link-update" href="#/update" data-nav>更新题解</a>` : ''}
          <a class="nav-link" href="#/about" data-nav>关于网站</a>
        </nav>
        <div class="nav-actions" id="navActions">
          <button class="icon-btn" id="themeToggle" title="切换主题">
            <svg class="icon-svg" id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              ${document.documentElement.getAttribute('data-theme') === 'dark'
                ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
                : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
              }
            </svg>
          </button>
          <button class="icon-btn" id="logoutBtn" title="退出登录">
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        clearSession();
        renderHeader();
        renderAuth();
      });
    }

    // Theme icon observer
    new MutationObserver(() => {
      const icon = document.getElementById('themeIcon');
      if (!icon) return;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      icon.innerHTML = isDark
        ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
        : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Mobile menu
    const toggle = document.getElementById('mobileToggle');
    const nav = document.getElementById('mainNav');
    toggle.addEventListener('click', () => { toggle.classList.toggle('open'); nav.classList.toggle('open'); });
    nav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => { toggle.classList.remove('open'); nav.classList.remove('open'); });
    });
  }

  function updateActiveNav(hash) {
    document.querySelectorAll('[data-nav]').forEach(link => {
      link.classList.remove('active');
      const href = link.getAttribute('href');
      if (href === '#/' && (hash === '#/' || hash === '' || hash === '#')) {
        link.classList.add('active');
      }
      // 标签分类页及其子页面都高亮
      if (href === '#/tags' && (hash === '#/tags' || hash.startsWith('#/diff/') || hash.startsWith('#/training/') || hash.startsWith('#/tag/'))) {
        link.classList.add('active');
      }
      // 更新题解页
      if (href === '#/update' && hash === '#/update') {
        link.classList.add('active');
      }
    });
  }

  // ========== Data ==========
  // 带重试的 fetch（应对龙虾云连接不稳定）
  async function robustFetch(url, retries, timeout) {
    retries = retries || 2;
    timeout = timeout || 10000;
    for (let i = 0; i <= retries; i++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) return res;
        if (i === retries) throw new Error('HTTP ' + res.status);
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 600 * (i + 1)));
      }
    }
  }

  async function loadIndex() {
    try {
      const res = await robustFetch('data/index.json?t=' + Date.now(), 2, 15000);
      INDEX = await res.json();
    } catch (e) {
      console.error('Failed to load index.json:', e);
      INDEX = { problems: [], sources: [], allTags: [], totalProblems: 0 };
      // 显示错误提示（只在有 app 容器时）
      const app = document.getElementById('app');
      if (app && !app.querySelector('.load-error')) {
        app.innerHTML = '<div class="load-error" style="text-align:center;padding:80px 20px;color:var(--text-secondary);">' +
          '<p style="font-size:1.1rem;margin-bottom:12px;">数据加载失败</p>' +
          '<p style="font-size:0.85rem;">网络不稳定，请刷新页面重试</p>' +
          '<button onclick="location.reload()" style="margin-top:20px;padding:8px 24px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);cursor:pointer;">刷新重试</button>' +
          '</div>';
      }
    }
  }

  // ========== Router ==========
  function router() {
    if (!HAS_BACKEND && !INDEX) {
      // 云端模式：数据还没加载完，不渲染
      return;
    }

    const hash = location.hash || '#/';
    const app = document.getElementById('app');
    updateActiveNav(hash);

    if (hash === '#/' || hash === '' || hash === '#') {
      app.innerHTML = renderHome();
    } else if (hash.startsWith('#/post/')) {
      const id = hash.replace('#/post/', '');
      app.innerHTML = renderSolution(id);
    } else if (hash === '#/tags') {
      app.innerHTML = renderTagsPage();
    } else if (hash.startsWith('#/diff/')) {
      // #/diff/luogu/入门 或 #/diff/dfboy/入门
      const parts = hash.replace('#/diff/', '').split('/');
      const source = parts[0];
      const difficulty = decodeURIComponent(parts.slice(1).join('/'));
      app.innerHTML = renderDiffFilter(source, difficulty);
    } else if (hash.startsWith('#/training/')) {
      // #/training/luogu/入门1-顺序结构
      const parts = hash.replace('#/training/', '').split('/');
      const source = parts[0];
      const training = decodeURIComponent(parts.slice(1).join('/'));
      app.innerHTML = renderTrainingFilter(source, training);
    } else if (hash.startsWith('#/tag/')) {
      const tag = decodeURIComponent(hash.replace('#/tag/', ''));
      app.innerHTML = renderTagFilter(tag);
    } else if (hash === '#/guide') {
      if (!isAdmin()) { app.innerHTML = render404(); return; }
      app.innerHTML = renderGuide();
    } else if (hash === '#/update') {
      if (!isAdmin()) { app.innerHTML = render404(); return; }
      app.innerHTML = renderUpdatePage();
      bindUpdateEvents();
    } else if (hash === '#/about') {
      app.innerHTML = renderAbout();
    } else {
      app.innerHTML = render404();
    }

    bindSearchEvents();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========== Helpers ==========
  // 根据字符串生成稳定的 HSL 颜色（用于标签背景）
  const TAG_PALETTE = [
    { bg: 'rgba(56,189,248,0.18)', color: '#38bdf8', bgL: 'rgba(56,189,248,0.12)', colorL: '#0284c7' },
    { bg: 'rgba(129,140,248,0.18)', color: '#818cf8', bgL: 'rgba(129,140,248,0.12)', colorL: '#6366f1' },
    { bg: 'rgba(52,211,153,0.18)', color: '#34d399', bgL: 'rgba(52,211,153,0.12)', colorL: '#059669' },
    { bg: 'rgba(251,191,36,0.18)', color: '#fbbf24', bgL: 'rgba(251,191,36,0.12)', colorL: '#d97706' },
    { bg: 'rgba(251,146,60,0.18)', color: '#fb923c', bgL: 'rgba(251,146,60,0.12)', colorL: '#ea580c' },
    { bg: 'rgba(248,113,113,0.18)', color: '#f87171', bgL: 'rgba(248,113,113,0.12)', colorL: '#dc2626' },
    { bg: 'rgba(167,139,250,0.18)', color: '#a78bfa', bgL: 'rgba(167,139,250,0.12)', colorL: '#7c3aed' },
    { bg: 'rgba(244,114,182,0.18)', color: '#f472b6', bgL: 'rgba(244,114,182,0.12)', colorL: '#db2777' },
    { bg: 'rgba(45,212,191,0.18)', color: '#2dd4bf', bgL: 'rgba(45,212,191,0.12)', colorL: '#0d9488' },
    { bg: 'rgba(163,230,53,0.18)', color: '#a3e635', bgL: 'rgba(163,230,53,0.12)', colorL: '#65a30d' },
    { bg: 'rgba(96,165,250,0.18)', color: '#60a5fa', bgL: 'rgba(96,165,250,0.12)', colorL: '#2563eb' },
    { bg: 'rgba(251,207,232,0.18)', color: '#fbcfe8', bgL: 'rgba(251,207,232,0.12)', colorL: '#ec4899' },
  ];

  // 标签卡片用更饱和的背景色（暗色主题）
  const TAG_CARD_PALETTE_DARK = [
    'linear-gradient(135deg, #0c4a6e, #164e63)',
    'linear-gradient(135deg, #312e81, #3730a3)',
    'linear-gradient(135deg, #064e3b, #065f46)',
    'linear-gradient(135deg, #713f12, #854d0e)',
    'linear-gradient(135deg, #7c2d12, #9a3412)',
    'linear-gradient(135deg, #7f1d1d, #991b1b)',
    'linear-gradient(135deg, #4c1d95, #5b21b6)',
    'linear-gradient(135deg, #831843, #9d174d)',
    'linear-gradient(135deg, #134e4a, #115e59)',
    'linear-gradient(135deg, #365314, #3f6212)',
    'linear-gradient(135deg, #1e3a5f, #1e40af)',
    'linear-gradient(135deg, #581c87, #6b21a8)',
  ];

  // 亮色主题用浅色渐变
  const TAG_CARD_PALETTE_LIGHT = [
    'linear-gradient(135deg, #e0f2fe, #cffafe)',
    'linear-gradient(135deg, #e0e7ff, #ede9fe)',
    'linear-gradient(135deg, #d1fae5, #ccfbf1)',
    'linear-gradient(135deg, #fef9c3, #fef3c7)',
    'linear-gradient(135deg, #ffedd5, #fed7aa)',
    'linear-gradient(135deg, #fee2e2, #fecaca)',
    'linear-gradient(135deg, #ede9fe, #f3e8ff)',
    'linear-gradient(135deg, #fce7f3, #fbcfe8)',
    'linear-gradient(135deg, #ccfbf1, #d1fae5)',
    'linear-gradient(135deg, #ecfccb, #d9f99d)',
    'linear-gradient(135deg, #dbeafe, #e0e7ff)',
    'linear-gradient(135deg, #f3e8ff, #ede9fe)',
  ];

  function tagColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = ((hash << 5) - hash) + tag.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % TAG_PALETTE.length;
    const p = TAG_PALETTE[idx];
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return isDark ? { bg: p.bg, color: p.color } : { bg: p.bgL, color: p.colorL };
  }

  function tagCardColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = ((hash << 5) - hash) + tag.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % 12;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return isDark ? TAG_CARD_PALETTE_DARK[idx] : TAG_CARD_PALETTE_LIGHT[idx];
  }

  function getProblems() {
    let list = INDEX.problems;

    // Source filter
    if (currentFilter !== 'all') {
      const sourceMap = { luogu: '洛谷', dfboy: '东方博宜' };
      const sourceName = sourceMap[currentFilter] || currentFilter;
      list = list.filter(p => p.source === sourceName);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p =>
        p.id.toLowerCase().includes(q) ||
        p.numId.includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)) ||
        p.source.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q)
      );
    }

    return list;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // marked 实例（惰性初始化，避免重复创建）
  let _markedInstance = null;

  function getMarkedInstance() {
    if (_markedInstance) return _markedInstance;

    if (typeof marked !== 'undefined') {
      try {
        // 优先尝试 marked.use() API（最稳健的方式）
        if (typeof marked.use === 'function') {
          marked.setOptions({ breaks: true, gfm: true });

          if (typeof markedHighlight !== 'undefined' && typeof hljs !== 'undefined') {
            marked.use({
              renderer: {
                code(code) {
                  // code is an object { text, lang, escaped }
                  const text = typeof code === 'object' ? code.text : code;
                  const lang = typeof code === 'object' ? (code.lang || '') : '';
                  const escaped = typeof code === 'object' ? code.escaped : false;

                  let highlighted;
                  try {
                    const language = (lang && hljs.getLanguage(lang)) ? lang : 'cpp';
                    highlighted = hljs.highlight(text, { language }).value;
                  } catch {
                    highlighted = text;
                  }

                  const cls = lang ? ` class="hljs language-${lang}"` : ' class="hljs"';
                  return `<pre><code${cls}>${highlighted}\n</code></pre>`;
                }
              }
            });
          }
          _markedInstance = 'use';
          return _markedInstance;
        }
      } catch (e) {
        console.warn('marked.use() failed, using fallback:', e.message);
      }
    }
    return null;
  }

  // ========== LaTeX 简易清洗 ==========
  // 将常见 LaTeX 表达式替换为可读符号，避免 $\times$ 等原始符号干扰阅读
  function cleanLatex(content) {
    // 常见符号映射
    const symMap = {
      '\\times': '×', '\\cdot': '·', '\\div': '÷',
      '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈',
      '\\le': '≤', '\\ge': '≥',
      '\\infty': '∞', '\\pm': '±',
      '\\leftarrow': '←', '\\rightarrow': '→', '\\Rightarrow': '⇒', '\\Leftrightarrow': '⟺',
      '\\sum': 'Σ', '\\prod': 'Π', '\\sqrt': '√',
      '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉',
      '\\ldots': '…', '\\cdots': '…',
      '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
      '\\epsilon': 'ε', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
      '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω',
    };

    // 先替换 \cmd 符号（在行内公式处理之前）
    for (const [cmd, sym] of Object.entries(symMap)) {
      // 转义特殊正则字符
      const escaped = cmd.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
      content = content.replace(new RegExp(escaped + '(?![a-zA-Z])', 'g'), sym);
    }

    // 处理上下标：^{...} → 上标内容，_{...} → 下标内容
    content = content.replace(/\^{([^}]*)}/g, (_, p) => p.length === 1 ? p : '(' + p + ')');
    content = content.replace(/_\{([^}]*)\}/g, (_, p) => p.length === 1 ? p : '(' + p + ')');
    content = content.replace(/\^([a-zA-Z0-9])/g, '$1');
    content = content.replace(/_([a-zA-Z0-9])/g, '$1');

    // 行内公式 $...$ → 去掉 $ 符号，保留内容（代码块内不处理）
    // 先保护代码块
    const codeBlocks = [];
    content = content.replace(/(```[\s\S]*?```|`[^`]+`)/g, (m) => {
      codeBlocks.push(m);
      return `\x00CODE${codeBlocks.length - 1}\x00`;
    });

    // 块级公式 $$...$$ → 直接显示内容
    content = content.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => inner.trim());
    // 行内公式 $...$ → 直接显示内容（避免匹配过长内容）
    content = content.replace(/\$([^\n$]{1,120}?)\$/g, (_, inner) => inner.trim());

    // 还原代码块
    content = content.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);

    // 清理残余的 \begin{...}...\end{...} 环境（矩阵等）
    content = content.replace(/\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g, '[公式]');

    // 清理孤立的 \cmd 残余（未在映射表里的命令）
    content = content.replace(/\\([a-zA-Z]+)\{([^}]*)\}/g, '$2');
    content = content.replace(/\\[a-zA-Z]+/g, '');

    return content;
  }

  function renderMarkdown(content) {
    // 剥离 YAML front matter，避免渲染出原始的 title/tags/difficulty
    content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    // 清洗 LaTeX 符号
    content = cleanLatex(content);
    try {
      if (typeof marked !== 'undefined') {
        const instance = getMarkedInstance();
        if (instance) {
          return marked.parse(content);
        }
        // 最后回退：直接 parse
        return marked.parse(content);
      }
    } catch (e) {
      console.error('Markdown render error:', e);
    }
    // marked 未加载时的回退：简易正则解析，至少保证代码块正确渲染
    return fallbackMarkdown(content);
  }

  // marked 未加载时的简易 Markdown → HTML 转换
  function fallbackMarkdown(md) {
    let html = escapeHtml(md);
    // 代码块（必须在行内 code 之前）
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
      code = code.replace(/^\n|\n$/g, '');
      return '<pre><code class="hljs language-' + (lang || 'cpp') + '">' + code + '</code></pre>';
    });
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // 粗体、斜体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // 换行
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    // 清理空段落
    html = html.replace(/<p>\s*<\/p>/g, '');
    return html;
  }

  function addCopyButtons() {
    document.querySelectorAll('.article-body pre').forEach(pre => {
      // 避免重复包裹
      if (pre.parentNode.classList.contains('code-block-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      // 检测语言
      const code = pre.querySelector('code');
      let lang = '';
      if (code) {
        const match = code.className.match(/language-(\w+)/);
        if (match) lang = match[1];
      }
      const langDisplay = lang ? lang.toUpperCase() : 'CODE';

      // 代码块 header
      const header = document.createElement('div');
      header.className = 'code-block-header';
      header.innerHTML = `
        <span class="code-lang-label">${langDisplay}</span>
        <button class="copy-btn">复制</button>
      `;
      wrapper.insertBefore(header, pre);

      // 复制按钮逻辑
      const btn = header.querySelector('.copy-btn');
      btn.addEventListener('click', () => {
        const text = code ? code.textContent : pre.textContent;

        function onCopied() {
          btn.textContent = '已复制 ✓';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 2000);
        }

        function fallbackCopy() {
          // HTTP 环境下 navigator.clipboard 不可用，用 execCommand 降级
          try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            onCopied();
          } catch (e) {
            btn.textContent = '复制失败';
            setTimeout(() => { btn.textContent = '复制'; }, 2000);
          }
        }

        // 优先使用 Clipboard API（HTTPS/localhost），否则降级
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(onCopied).catch(fallbackCopy);
        } else {
          fallbackCopy();
        }
      });
    });

    // 生成目录
    buildTOC();
    // 阅读进度条
    initReadingProgress();
  }

  function buildTOC() {
    const tocCard = document.getElementById('tocCard');
    const tocList = document.getElementById('tocList');
    if (!tocCard || !tocList) return;

    const headings = document.querySelectorAll('.article-body h1, .article-body h2, .article-body h3');
    if (headings.length < 2) return; // 少于2个标题不显示目录

    tocCard.style.display = 'block';
    headings.forEach((h, idx) => {
      // 给标题加 id
      if (!h.id) h.id = `heading-${idx}`;

      const li = document.createElement('li');
      li.className = `sidebar-toc-item ${h.tagName.toLowerCase()}`;

      const a = document.createElement('a');
      a.className = 'sidebar-toc-link';
      a.textContent = h.textContent.replace(/^#+\s*/, '');
      a.href = `#${h.id}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // 高亮当前
        document.querySelectorAll('.sidebar-toc-link').forEach(l => l.classList.remove('active'));
        a.classList.add('active');
      });

      li.appendChild(a);
      tocList.appendChild(li);
    });

    // 滚动时高亮目录项
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          document.querySelectorAll('.sidebar-toc-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    }, { rootMargin: '-60px 0px -70% 0px' });

    headings.forEach(h => observer.observe(h));
  }

  function initReadingProgress() {
    const bar = document.getElementById('readingBar');
    if (!bar) return;

    const update = () => {
      const article = document.querySelector('.article-body');
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const total = article.offsetHeight;
      const scrolled = Math.max(0, -rect.top);
      const pct = Math.min(100, (scrolled / (total - window.innerHeight)) * 100) || 0;
      bar.style.width = pct + '%';
    };

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // ========== Pages ==========

  function renderHome() {
    const sources = INDEX.sources || [];
    const sourceCount = {};
    INDEX.problems.forEach(p => { sourceCount[p.source] = (sourceCount[p.source] || 0) + 1; });

    return `
      <div class="page">
        <div class="search-bar">
          <input type="text" class="search-input" id="searchInput" 
                 placeholder="搜索题号、题名、标签…" value="${escapeHtml(searchQuery)}" autocomplete="off">
          <span class="search-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:middle;">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <span class="search-clear" data-action="clear-search">&times;</span>
          <span class="search-shortcut">⌘K</span>
        </div>

        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-num">${INDEX.totalProblems}</span>
            <span class="stat-label">道题解</span>
          </div>
          <div class="stat-divider"></div>
          ${sources.map(s => `
            <div class="stat-item">
              <span class="stat-num">${sourceCount[s] || 0}</span>
              <span class="stat-label">${s}</span>
            </div>
          `).join('')}
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-num">${INDEX.allTags.length}</span>
            <span class="stat-label">个标签</span>
          </div>
        </div>

        <div class="filter-tabs" id="filterTabs">
          <button class="filter-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">
            全部<span class="filter-tab-count">(${INDEX.totalProblems})</span>
          </button>
          ${Object.entries(sourceCount).map(([name, count]) => {
            const key = name === '洛谷' ? 'luogu' : name === '东方博宜' ? 'dfboy' : name;
            return `
              <button class="filter-tab ${currentFilter === key ? 'active' : ''}" data-filter="${key}">
                ${name}<span class="filter-tab-count">(${count})</span>
              </button>
            `;
          }).join('')}
        </div>

        <div class="problem-list" id="problemList">
          ${renderProblemList(getProblems())}
        </div>
      </div>
    `;
  }

  function renderProblemList(problems) {
    if (problems.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p class="empty-text">没有找到匹配的题目</p>
          <p class="empty-hint">试试其他关键词或清空搜索</p>
        </div>
      `;
    }

    return problems.map(p => {
      const sourceClass = p.source === '洛谷' ? 'luogu' : p.source === '东方博宜' ? 'dfboy' : '';
      const isLuogu = p.source === '洛谷';
      const diffColors = isLuogu ? LUOGU_DIFF_COLORS : DFBOY_DIFF_COLORS;
      const dc = p.difficulty && diffColors[p.difficulty] ? diffColors[p.difficulty] : null;
      return `
        <div class="problem-card" onclick="location.hash='#/post/${p.id}'">
          <span class="problem-id">${escapeHtml(p.id)}</span>
          <div class="problem-info">
            <div class="problem-title">${escapeHtml(p.title)}</div>
            <div class="problem-meta">
              ${p.tags.slice(0, 3).map(t => `<span>#${escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
          <div class="problem-badges">
            ${dc ? `<span class="problem-diff-badge" style="background:${dc.bg};color:${dc.color};">${escapeHtml(p.difficulty)}</span>` : ''}
            ${p.training && p.training.length ? `<span class="problem-training-badge">${p.training.map(t => escapeHtml(t)).join(' · ')}</span>` : ''}
            <span class="problem-source ${sourceClass}">${escapeHtml(p.source)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSolution(id) {
    const problem = INDEX.problems.find(p => p.id === id);
    if (!problem) return render404();

    const isLuogu = problem.source === '洛谷';
    const diffColors = isLuogu ? LUOGU_DIFF_COLORS : DFBOY_DIFF_COLORS;
    const dc = problem.difficulty && diffColors[problem.difficulty] ? diffColors[problem.difficulty] : null;

    // 洛谷题目链接
    const ojUrl = isLuogu
      ? `https://www.luogu.com.cn/problem/${problem.id}`
      : `https://oj.czos.cn/p/${problem.numId || problem.id}`;
    const ojName = isLuogu ? '洛谷' : '东方博宜';

    return `
      <div class="page">
        <!-- 阅读进度条 -->
        <div class="reading-progress"><div class="reading-progress-bar" id="readingBar"></div></div>

        <!-- 返回按钮 -->
        <a class="solution-back" onclick="location.hash='#/'">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          返回列表
        </a>

        <!-- 双栏布局 -->
        <div class="solution-page">
          <!-- 左：主内容 -->
          <div class="solution-main">
            <div class="solution-header-block">
              <div class="solution-super">
                <span class="solution-badge badge-id">${escapeHtml(problem.id)}</span>
                <span class="solution-badge badge-source">${escapeHtml(problem.source)}</span>
                ${dc ? `<span class="solution-badge badge-diff" style="background:${dc.bg};color:${dc.color};border:1px solid ${dc.color}33;">${escapeHtml(problem.difficulty)}</span>` : ''}
                <span class="solution-badge badge-date">${problem.lastModified}</span>
              </div>
              <h1 class="solution-title">${escapeHtml(problem.title)}</h1>
              ${problem.tags.length ? `
                <div class="solution-tags">
                  ${problem.tags.map(t => {
                    const tc = tagColor(t);
                    return `<span class="tag" style="background:${tc.bg};color:${tc.color};"
                      onclick="event.stopPropagation(); location.hash='#/tag/${encodeURIComponent(t)}'">${escapeHtml(t)}</span>`;
                  }).join('')}
                </div>
              ` : ''}
            </div>

            <div class="solution-content">
              <div class="article-body" id="articleBody">
                <div class="skeleton" style="width:80%;height:22px;margin-bottom:14px;"></div>
                <div class="skeleton" style="width:100%;height:15px;margin-bottom:10px;"></div>
                <div class="skeleton" style="width:90%;height:15px;margin-bottom:10px;"></div>
                <div class="skeleton" style="width:65%;height:15px;margin-bottom:24px;"></div>
                <div class="skeleton" style="width:100%;height:120px;margin-bottom:10px;"></div>
              </div>
            </div>
          </div>

          <!-- 右：信息侧栏 -->
          <aside class="solution-sidebar" id="solutionSidebar">
            <!-- OJ 跳转 -->
            <div class="sidebar-card">
              <a class="sidebar-oj-link" href="${ojUrl}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                在 ${ojName} 查看题目
              </a>
            </div>

            <!-- 题目信息 -->
            <div class="sidebar-card">
              <div class="sidebar-card-title">题目信息</div>
              <div class="sidebar-info-row">
                <span class="sidebar-info-label">题目ID</span>
                <span class="sidebar-info-value" style="font-family:var(--font-mono);color:var(--accent);">${escapeHtml(problem.id)}</span>
              </div>
              <div class="sidebar-info-row">
                <span class="sidebar-info-label">来源</span>
                <span class="sidebar-info-value">${escapeHtml(problem.source)}</span>
              </div>
              ${dc ? `
              <div class="sidebar-info-row">
                <span class="sidebar-info-label">难度</span>
                <span class="sidebar-info-value" style="color:${dc.color};">${escapeHtml(problem.difficulty)}</span>
              </div>` : ''}
              ${problem.training && problem.training.length ? `
              <div class="sidebar-info-row">
                <span class="sidebar-info-label">题单</span>
                <span class="sidebar-info-value" style="font-size:0.78rem;">${problem.training.map(t => escapeHtml(t)).join(' · ')}</span>
              </div>` : ''}
              <div class="sidebar-info-row">
                <span class="sidebar-info-label">更新日期</span>
                <span class="sidebar-info-value">${problem.lastModified}</span>
              </div>
            </div>

            <!-- 目录（动态生成） -->
            <div class="sidebar-card sidebar-toc" id="tocCard" style="display:none;">
              <div class="sidebar-card-title">目录</div>
              <ul class="sidebar-toc-list" id="tocList"></ul>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  async function loadAndRenderSolution(id) {
    const body = document.getElementById('articleBody');
    if (!body) return;

    const problem = INDEX.problems.find(p => p.id === id);
    if (!problem) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p class="empty-text">未找到该题解</p>
          <p class="empty-hint">ID: ${escapeHtml(id)}</p>
        </div>
      `;
      return;
    }

    try {
      const res = await robustFetch('solutions/' + problem.filePath + '?t=' + Date.now(), 2, 10000);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const mdContent = await res.text();
      if (!mdContent || mdContent.trim().length === 0) {
        throw new Error('文件内容为空');
      }
      const html = renderMarkdown(mdContent);
      body.innerHTML = html;
      addCopyButtons();
    } catch (e) {
      console.error('loadAndRenderSolution error:', e);
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <p class="empty-text">无法加载题解文件</p>
          <p class="empty-hint">路径: solutions/${escapeHtml(problem.filePath)}</p>
          <p class="empty-hint" style="color:var(--text-muted);font-size:0.85rem;margin-top:8px;">错误: ${escapeHtml(e.message)}</p>
          <p class="empty-hint" style="color:var(--text-muted);font-size:0.82rem;">请确保通过 HTTP 服务器访问（不要直接双击打开 HTML 文件）</p>
        </div>
      `;
    }
  }

  // ========== 洛谷官方难度配色 ==========
  const LUOGU_DIFF_COLORS = {
    '入门':         { bg: 'rgba(248,81,73,0.15)',    color: '#f85149', border: '#f85149' },
    '普及-':        { bg: 'rgba(251,146,60,0.15)',   color: '#fb923c', border: '#fb923c' },
    '普及/提高-':   { bg: 'rgba(251,191,36,0.15)',   color: '#fbbf24', border: '#fbbf24' },
    '普及+/提高':   { bg: 'rgba(52,211,153,0.15)',   color: '#34d399', border: '#34d399' },
    '提高+/省选-':  { bg: 'rgba(56,189,248,0.15)',   color: '#38bdf8', border: '#38bdf8' },
    '省选/NOI-':    { bg: 'rgba(187,134,252,0.15)',  color: '#bb86fc', border: '#bb86fc' },
    'NOI/NOI+/CTSC': { bg: 'rgba(100,116,139,0.2)', color: '#64748b', border: '#64748b' },
  };

  // 洛谷难度排序权重
  const LUOGU_DIFF_ORDER = ['入门', '普及-', '普及/提高-', '普及+/提高', '提高+/省选-', '省选/NOI-', 'NOI/NOI+/CTSC'];

  // 东方博宜难度配色
  const DFBOY_DIFF_COLORS = {
    '入门': { bg: 'rgba(52,211,153,0.15)',  color: '#34d399', border: '#34d399' },
    '基础': { bg: 'rgba(56,189,248,0.15)',  color: '#38bdf8', border: '#38bdf8' },
    '提高': { bg: 'rgba(251,146,60,0.15)',  color: '#fb923c', border: '#fb923c' },
  };
  const DFBOY_DIFF_ORDER = ['入门', '基础', '提高'];

  // ========== 洛谷题单顺序（来自用户分类文件，与 md front matter 中的 training 值一致） ==========
  const LUOGU_TRAINING_ORDER = [
    '【入门1】顺序结构', '【入门2】分支结构', '【入门3】循环结构', '【入门4】数组',
    '【入门5】字符串', '【入门6】函数与结构体',
    '【算法1-1】模拟与高精度', '【算法1-2】排序', '【算法1-3】暴力枚举',
    '【算法1-4】递推与递归', '【算法1-5】贪心', '【算法1-6】二分查找与二分答案',
    '【算法1-7】搜索',
    'GESP C++ 一级', 'GESP C++ 二级', 'GESP C++ 三级', 'GESP C++ 四级', 'GESP C++ 五级',
    '信息与未来入门', '信息与未来普及-',
    'CSP-J复赛',
  ];

  // ========== 东方博宜题单顺序 ==========
  const DFBOY_TRAINING_ORDER = [
    '基本运算', '分支', '循环', '穷举', '一维数组', '函数', '二维数组', '字符串',
    '结构体', '进制转换', '高精度运算', '递推', '贪心', '递归进阶',
    '深度优先搜索-DFS', '广度优先搜索-BFS', '动态规划-DP', '二分',
    '蓝桥杯STEAM', '市赛省赛', '电子学会考级考试', '信息素养大赛',
  ];

  // ========== 标签分类页 ==========
  function renderTagsPage() {
    const luoguProblems = INDEX.problems.filter(p => p.source === '洛谷');
    const dfboyProblems = INDEX.problems.filter(p => p.source === '东方博宜');

    return `
      <div class="page">
        <h2 class="tags-page-title">
          <span class="tags-page-icon">🏷</span> 标签分类
        </h2>

        <!-- 来源 Tab -->
        <div class="source-tabs" id="sourceTabs">
          <button class="source-tab active" data-source="luogu">
            <span class="source-tab-dot luogu-dot"></span>
            洛谷
            <span class="source-tab-count">${luoguProblems.length}</span>
          </button>
          <button class="source-tab" data-source="dfboy">
            <span class="source-tab-dot dfboy-dot"></span>
            东方博宜
            <span class="source-tab-count">${dfboyProblems.length}</span>
          </button>
        </div>

        <!-- 内容区：难度统计 + 题单列表 -->
        <div id="tagsContent">
          ${renderTagsContent(luoguProblems, 'luogu')}
        </div>
      </div>
    `;
  }

  function renderTagsContent(problems, source) {
    return renderDifficultyStats(problems, source) + renderTrainingList(problems, source);
  }

  function renderDifficultyStats(problems, source) {
    const isLuogu = source === 'luogu';
    const diffColors = isLuogu ? LUOGU_DIFF_COLORS : DFBOY_DIFF_COLORS;
    const diffOrder = isLuogu ? LUOGU_DIFF_ORDER : DFBOY_DIFF_ORDER;

    // 统计难度分布
    const diffCount = {};
    problems.forEach(p => {
      const d = p.difficulty || '暂无评定';
      diffCount[d] = (diffCount[d] || 0) + 1;
    });

    // 按官方顺序排列，未列出的放最后
    const orderedDiffs = diffOrder.filter(d => diffCount[d]);
    const extraDiffs = Object.keys(diffCount).filter(d => !diffOrder.includes(d)).sort();
    const allDiffs = [...orderedDiffs, ...extraDiffs];

    if (allDiffs.length === 0) return '';

    const totalCount = problems.length;

    return `
      <div class="diff-stats-section">
        <div class="diff-stats-title">难度分布</div>
        <div class="diff-stats-row">
          ${allDiffs.map(diff => {
            const count = diffCount[diff];
            const colors = diffColors[diff] || { bg: 'var(--bg-tag)', color: 'var(--text-muted)', border: 'var(--border)' };
            const pct = totalCount > 0 ? (count / totalCount * 100).toFixed(1) : 0;
            const barWidth = pct;
            const isNoRating = diff === '暂无评定';
            return `
              <div class="diff-stat-item" data-action="filter-diff" data-source="${source}" data-diff="${escapeHtml(diff)}"
                   style="--diff-color: ${colors.color}; --diff-bg: ${colors.bg}; --diff-border: ${colors.border};">
                <span class="diff-stat-badge" ${isNoRating ? '' : `style="background:${colors.bg};color:${colors.color};border:1px solid ${colors.border};"`}>${escapeHtml(diff)}</span>
                <div class="diff-stat-bar-track">
                  <div class="diff-stat-bar-fill" style="width:${barWidth}%;background:${colors.color};"></div>
                </div>
                <span class="diff-stat-meta">${count}题 <span class="diff-stat-pct">${pct}%</span></span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderTrainingList(problems, source) {
    const trainingCount = {};
    problems.forEach(p => {
      // training 是数组，每个元素单独计数
      const trainings = Array.isArray(p.training) ? p.training : (p.training ? [p.training] : []);
      if (trainings.length === 0) {
        trainingCount['未分类'] = (trainingCount['未分类'] || 0) + 1;
      } else {
        trainings.forEach(t => {
          trainingCount[t] = (trainingCount[t] || 0) + 1;
        });
      }
    });

    const unclassified = trainingCount['未分类'] || 0;
    const classified = Object.entries(trainingCount).filter(([k]) => k !== '未分类');

    let sorted;
    const orderList = source === 'luogu' ? LUOGU_TRAINING_ORDER : DFBOY_TRAINING_ORDER;
    const orderMap = {};
    orderList.forEach((name, idx) => { orderMap[name] = idx; });
    sorted = classified.sort((a, b) => {
      const ai = orderMap[a[0]] !== undefined ? orderMap[a[0]] : 999;
      const bi = orderMap[b[0]] !== undefined ? orderMap[b[0]] : 999;
      if (ai !== bi) return ai - bi;
      return b[1] - a[1];
    });

    if (sorted.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p class="empty-text">暂无题单数据</p>
        </div>
      `;
    }

    const totalCount = problems.length;
    const trainingNum = sorted.length;

    return `
      <div class="training-list-section">
        <div class="training-list-header">
          <span class="training-list-title">题单</span>
          <span class="training-list-summary">
            ${trainingNum} 个题单
            ${totalCount > 0 ? `，共 ${totalCount} 题` : ''}
            ${unclassified > 0 ? `<span class="unclassified-hint">，${unclassified} 题未分类</span>` : ''}
          </span>
        </div>
        <div class="training-list">
          ${sorted.map(([name, count]) => `
            <div class="training-list-item"
                 data-action="filter-training" data-source="${source}" data-training="${escapeHtml(name)}">
              <span class="training-list-name">${escapeHtml(name)}</span>
              <span class="training-list-count">${count} 题</span>
            </div>
          `).join('')}
          ${unclassified > 0 ? `
            <div class="training-list-item unclassified"
                 data-action="filter-training" data-source="${source}" data-training="未分类">
              <span class="training-list-name">未分类</span>
              <span class="training-list-count">${unclassified} 题</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // 全局状态：当前标签页选择的来源
  let tagsSource = 'luogu';

  function filterByDifficulty(source, difficulty) {
    const sourceKey = source === 'luogu' ? 'luogu' : 'dfboy';
    location.hash = `#/diff/${sourceKey}/${encodeURIComponent(difficulty)}`;
  }

  function filterByTraining(source, training) {
    location.hash = `#/training/${source}/${encodeURIComponent(training)}`;
  }

  function renderDiffFilter(source, difficulty) {
    const sourceName = source === 'luogu' ? '洛谷' : '东方博宜';
    const problems = INDEX.problems.filter(p => p.source === sourceName && p.difficulty === difficulty)
      .sort((a, b) => (parseInt(a.numId) || 0) - (parseInt(b.numId) || 0));

    const isLuogu = source === 'luogu';
    const diffColors = isLuogu ? LUOGU_DIFF_COLORS : DFBOY_DIFF_COLORS;
    const colors = diffColors[difficulty] || { bg: 'var(--bg-tag)', color: 'var(--text-muted)', border: 'var(--border)' };

    return `
      <div class="page">
        <a class="solution-back" href="#/tags">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          返回标签分类
        </a>
        <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
          <span class="diff-filter-badge" style="background:${colors.bg};color:${colors.color};border:1px solid ${colors.border};">${escapeHtml(difficulty)}</span>
          <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${sourceName} · <span class="filter-result-count">${problems.length}</span> 题</span>
        </h2>
        <div class="search-bar filter-search-bar">
          <input type="text" class="search-input filter-search-input"
                 placeholder="在 ${escapeHtml(difficulty)} 中搜索…" autocomplete="off">
          <span class="search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:middle;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <span class="search-clear" data-action="clear-search">&times;</span>
        </div>
        <div class="problem-list" id="problemList">
          ${renderProblemList(problems)}
          <script type="application/json" id="problemsData">${JSON.stringify(problems.map(p => ({id:p.id, numId:p.numId, title:p.title, tags:p.tags, difficulty:p.difficulty, training:p.training, source:p.source, readTime:p.readTime})))}</script>
        </div>
      </div>
    `;
  }

  function renderTrainingFilter(source, training) {
    const sourceName = source === 'luogu' ? '洛谷' : '东方博宜';
    const isUnclassified = training === '未分类';
    const problems = INDEX.problems.filter(p => {
      if (p.source !== sourceName) return false;
      const trainings = Array.isArray(p.training) ? p.training : (p.training ? [p.training] : []);
      if (isUnclassified) return trainings.length === 0;
      return trainings.includes(training);
    })
      .sort((a, b) => (parseInt(a.numId) || 0) - (parseInt(b.numId) || 0));

    return `
      <div class="page">
        <a class="solution-back" href="#/tags">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          返回标签分类
        </a>
        <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
          <span class="training-filter-badge">${escapeHtml(training)}</span>
          <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${sourceName} · <span class="filter-result-count">${problems.length}</span> 题</span>
        </h2>
        <div class="search-bar filter-search-bar">
          <input type="text" class="search-input filter-search-input"
                 placeholder="在 ${escapeHtml(training)} 中搜索…" autocomplete="off">
          <span class="search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:middle;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <span class="search-clear" data-action="clear-search">&times;</span>
        </div>
        <div class="problem-list" id="problemList">
          ${renderProblemList(problems)}
          <script type="application/json" id="problemsData">${JSON.stringify(problems.map(p => ({id:p.id, numId:p.numId, title:p.title, tags:p.tags, difficulty:p.difficulty, training:p.training, source:p.source, readTime:p.readTime})))}</script>
        </div>
      </div>
    `;
  }

  function renderTagFilter(tag) {
    const problems = INDEX.problems.filter(p => p.tags.includes(tag))
      .sort((a, b) => (parseInt(a.numId) || 0) - (parseInt(b.numId) || 0));

    return `
      <div class="page">
        <a class="solution-back" href="#/tags">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          返回标签列表
        </a>
        <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:20px;">
          <span style="color:var(--accent);">#</span> ${escapeHtml(tag)}
          <span style="font-size:0.85rem;color:var(--text-muted);font-weight:400;margin-left:8px;">(<span class="filter-result-count">${problems.length}</span> 篇)</span>
        </h2>
        <div class="search-bar filter-search-bar">
          <input type="text" class="search-input filter-search-input"
                 placeholder="在 #${escapeHtml(tag)} 中搜索…" autocomplete="off">
          <span class="search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:middle;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <span class="search-clear" data-action="clear-search">&times;</span>
        </div>
        <div class="problem-list" id="problemList">
          ${renderProblemList(problems)}
          <script type="application/json" id="problemsData">${JSON.stringify(problems.map(p => ({id:p.id, numId:p.numId, title:p.title, tags:p.tags, difficulty:p.difficulty, training:p.training, source:p.source, readTime:p.readTime})))}</script>
        </div>
      </div>
    `;
  }

  // ========== 更新题解页（Cloudflare + GitHub Actions 模式） ==========

  function renderUpdatePage() {
    const isCf = HAS_BACKEND;
    return `
      <div class="page">
        <div class="update-container">
          <h2 class="update-title">
            <span class="update-title-icon">🔄</span> 更新题解
          </h2>
          <p class="update-desc">通过 GitHub Actions 自动爬取最新的题解数据，完成后自动部署到网站。</p>

          <div class="update-cards">
            <!-- 洛谷卡片 -->
            <div class="update-card" id="luoguCard">
              <div class="update-card-header">
                <span class="update-card-dot luogu-dot"></span>
                <h3>洛谷</h3>
              </div>
              <div class="update-card-body">
                <p class="update-card-desc">自动获取洛谷上你所有AC题目的描述、代码和标签，生成 md 文件并更新索引。</p>
                <div class="update-field">
                  <label>洛谷 Cookie <span class="update-hint">（必填）</span></label>
                  <textarea id="luoguCookie" rows="3" placeholder="从浏览器复制完整的 Cookie 字符串...&#10;&#10;获取方式：登录洛谷 → F12 → Network → 刷新 → 任意请求的 Cookie 头" spellcheck="false"></textarea>
                </div>
                <label class="update-checkbox">
                  <input type="checkbox" id="luoguForce">
                  <span>强制重新生成所有文件（包括已存在的）</span>
                </label>
                <button class="update-btn" id="luoguBtn" data-source="luogu">
                  触发更新洛谷
                </button>
              </div>
              <div class="update-result" id="luoguResult" style="display:none;"></div>
            </div>

            <!-- 东方博宜卡片 -->
            <div class="update-card" id="dfboyCard">
              <div class="update-card-header">
                <span class="update-card-dot dfboy-dot"></span>
                <h3>东方博宜</h3>
              </div>
              <div class="update-card-body">
                <p class="update-card-desc">一键完成：爬取题目描述 → 爬取AC代码 → 重建索引。全流程自动串行执行。</p>
                <div class="update-field">
                  <label>账号 <span class="update-hint">（必填）</span></label>
                  <input type="text" id="dfboyUser" placeholder="输入你的东方博宜OJ账号" autocomplete="off">
                </div>
                <div class="update-field">
                  <label>密码 <span class="update-hint">（必填）</span></label>
                  <input type="password" id="dfboyPass" placeholder="输入密码" autocomplete="off">
                </div>
                <label class="update-checkbox">
                  <input type="checkbox" id="dfboyForce">
                  <span>强制重新生成所有文件（包括已存在的）</span>
                </label>
                <button class="update-btn" id="dfboyBtn" data-source="dfboy">
                  触发更新东方博宜
                </button>
              </div>
              <div class="update-result" id="dfboyResult" style="display:none;"></div>
            </div>
          </div>

          <!-- 重建索引 + 全部更新 -->
          <div class="update-cards-row">
            <div class="update-card update-card-sm">
              <div class="update-card-header">
                <span class="update-title-icon" style="font-size:1.1rem;">🔨</span>
                <h3>重建索引</h3>
              </div>
              <div class="update-card-body">
                <p class="update-card-desc">仅重建搜索索引（本地修改 md 后使用）。</p>
                <button class="update-btn update-btn-secondary" id="buildBtn">
                  触发重建索引
                </button>
                <div class="update-result" id="buildResult" style="display:none;"></div>
              </div>
            </div>
            <div class="update-card update-card-sm">
              <div class="update-card-header">
                <span class="update-title-icon" style="font-size:1.1rem;">📦</span>
                <h3>全部更新</h3>
              </div>
              <div class="update-card-body">
                <p class="update-card-desc">同时更新洛谷和东方博宜（需填好上方 Cookie 和账号）。</p>
                <button class="update-btn update-btn-primary" id="allBtn">
                  触发全部更新
                </button>
                <div class="update-result" id="allResult" style="display:none;"></div>
              </div>
            </div>
          </div>

          <!-- 使用提示 -->
          <div class="update-tips">
            <h4>📌 使用提示</h4>
            <ul>
              <li><strong>运行方式</strong>：点击按钮后，GitHub Actions 在云端后台运行爬虫，完成后自动部署</li>
              <li><strong>查看进度</strong>：点击下方链接查看 GitHub Actions 实时日志</li>
              <li><strong>洛谷 Cookie</strong>：需要包含登录凭证的完整 Cookie，不是只有一个 <code>_uid</code></li>
              <li><strong>东方博宜</strong>：输入你的 oj.czos.cn 账号密码，脚本会自动登录爬取</li>
              <li><strong>预计耗时</strong>：洛谷 400+ 道约 5-10 分钟，东方博宜 1000+ 道约 8-15 分钟</li>
              <li><strong>刷新页面</strong>：更新完成后刷新网站即可看到最新题解</li>
            </ul>
          </div>

          <!-- GitHub Actions 快捷链接 -->
          <div class="update-links">
            <a href="https://github.com/KongC-X/oj-blog/actions" target="_blank" rel="noopener" class="update-gh-link">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              在 GitHub 上查看运行进度
            </a>
          </div>
        </div>
      </div>
    `;
  }

  function bindUpdateEvents() {
    // 洛谷更新
    document.getElementById('luoguBtn')?.addEventListener('click', () => {
      const cookie = document.getElementById('luoguCookie').value.trim();
      if (!cookie) { alert('请填写洛谷 Cookie'); return; }
      const force = document.getElementById('luoguForce').checked;
      startUpdate('luogu', { source: 'luogu', luogu_cookie: cookie, force });
    });

    // 东方博宜更新
    document.getElementById('dfboyBtn')?.addEventListener('click', () => {
      const username = document.getElementById('dfboyUser').value.trim();
      const password = document.getElementById('dfboyPass').value;
      if (!username || !password) { alert('请填写东方博宜账号和密码'); return; }
      const force = document.getElementById('dfboyForce').checked;
      startUpdate('dfboy', { source: 'dfboy', dfboy_user: username, dfboy_pass: password, force });
    });

    // 重建索引
    document.getElementById('buildBtn')?.addEventListener('click', () => {
      startUpdate('build', { source: 'rebuild' });
    });

    // 全部更新
    document.getElementById('allBtn')?.addEventListener('click', () => {
      const cookie = document.getElementById('luoguCookie').value.trim();
      const username = document.getElementById('dfboyUser').value.trim();
      const password = document.getElementById('dfboyPass').value;
      if (!cookie) { alert('请填写洛谷 Cookie'); return; }
      if (!username || !password) { alert('请填写东方博宜账号和密码'); return; }
      const force = document.getElementById('luoguForce').checked;
      startUpdate('all', { source: 'all', luogu_cookie: cookie, dfboy_user: username, dfboy_pass: password, force });
    });
  }

  function getAuthToken() {
    const session = getSession();
    return session ? session.token : null;
  }

  function startUpdate(source, params) {
    const resultMap = {
      'luogu': 'luoguResult',
      'dfboy': 'dfboyResult',
      'build': 'buildResult',
      'all': 'allResult',
    };
    const btnMap = {
      'luogu': 'luoguBtn',
      'dfboy': 'dfboyBtn',
      'build': 'buildBtn',
      'all': 'allBtn',
    };

    const token = getAuthToken();
    if (!token) { alert('登录已过期，请重新登录'); clearSession(); renderHeader(); renderAuth(); return; }

    const resultEl = document.getElementById(resultMap[source]);
    const btn = document.getElementById(btnMap[source]);
    if (!resultEl) return;

    resultEl.style.display = 'block';
    resultEl.className = 'update-result loading';
    resultEl.innerHTML = '<div class="update-loading">⏳ 正在触发 GitHub Actions...</div>';

    if (btn) { btn.disabled = true; btn.classList.add('disabled'); }

    fetch(API_BASE + '/api/trigger-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    })
    .then(async res => {
      const data = await res.json();
      if ((res.status === 401 || res.status === 403) && data.error) {
        resultEl.className = 'update-result error';
        resultEl.innerHTML = `<div class="update-result-msg error">❌ 权限不足：${escapeHtml(data.error)}</div>`;
        clearSession();
        renderHeader();
        renderAuth();
        if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
        return;
      }
      if (data.error) {
        resultEl.className = 'update-result error';
        resultEl.innerHTML = `<div class="update-result-msg error">❌ ${escapeHtml(data.error)}</div>`;
        if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
        return;
      }
      if (data.ok) {
        resultEl.className = 'update-result success';
        resultEl.innerHTML = `
          <div class="update-result-msg success">${escapeHtml(data.message)}</div>
          <div class="update-result-hint">
            ⏱ 预计 ${params.source === 'rebuild' ? '1-2' : '10-20'} 分钟后完成，
            <a href="https://github.com/KongC-X/oj-blog/actions" target="_blank" rel="noopener">查看 GitHub Actions 进度 →</a>
          </div>
        `;
        if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
      }
    })
    .catch(err => {
      resultEl.className = 'update-result error';
      resultEl.innerHTML = `<div class="update-result-msg error">❌ 请求失败：${escapeHtml(err.message)}</div>`;
      if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
    });
  }

  function renderGuide() {
    return `
      <div class="page">
        <div class="guide-container">
          <h2 class="guide-title">
            <span class="guide-title-icon">📖</span> 使用指南
          </h2>

          <div class="guide-section">
            <h3>📁 如何添加新题解</h3>
            <ol>
              <li>在 <code>solutions/luogu/</code> 或 <code>solutions/dfboy/</code> 下创建 md 文件</li>
              <li>文件名就是题号，例如 <code>P1001.md</code>、<code>1042.md</code></li>
              <li>在 md 文件中写题解内容（支持 YAML front matter）</li>
              <li>运行 <code>node build.js</code> 重新构建索引</li>
              <li>刷新网页即可看到新题目</li>
            </ol>
          </div>

          <div class="guide-section">
            <h3>📝 Markdown 文件格式</h3>
            <pre><code>---
title: A+B Problem        # 题目名称（可选，默认用题号）
tags: [入门, 模拟]        # 标签（可选）
difficulty: 入门          # 难度（可选）
---

# P1001 A+B Problem       # 一级标题 = 题目名称

## 题目描述                # 二级标题分段

题目内容...

## 思路

解题思路...

## 代码

\`\`\`cpp
#include &lt;iostream&gt;
using namespace std;
int main() { ... }
\`\`\`</code></pre>
          </div>

          <div class="guide-section">
            <h3>📂 文件结构</h3>
            <pre><code>blog/
├── index.html              # 主页面
├── build.js                # 构建脚本（扫描md生成索引）
├── css/style.css           # 样式
├── js/app.js               # 核心逻辑
├── data/index.json         # 自动生成的索引（不要手动改）
└── solutions/              # 📌 题解文件存放目录
    ├── luogu/              # 洛谷题解
    │   ├── P1001.md
    │   ├── P1042.md
    │   └── ...
    └── dfboy/              # 东方博宜题解
        ├── 1001.md
        ├── 1042.md
        └── ...</code></pre>
          </div>

          <div class="guide-section">
            <h3>⚡ 快捷操作</h3>
            <div class="guide-shortcut-list">
              <div><kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> — 快速搜索</div>
              <div>支持按<strong>题号、题名、标签、来源</strong>搜索</div>
              <div>代码块悬停可见<strong>复制按钮</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function render404() {
    return `
      <div class="page">
        <div class="empty-state" style="padding-top:100px;">
          <div class="empty-icon">404</div>
          <p class="empty-text">页面未找到</p>
          <a href="#/" style="color:var(--accent);margin-top:16px;display:inline-flex;align-items:center;gap:6px;">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="15 18 9 12 15 6"/></svg>
            返回首页
          </a>
        </div>
      </div>
    `;
  }

  
  function renderAbout() {
    return `
      <div class="page">
        <div class="guide-container">
          <h2 class="guide-title">
            <span class="guide-title-icon">🌐</span> 关于网站
          </h2>

          <div class="guide-section">
            <h3>📖 网站简介</h3>
            <p>本站收录了 <strong>洛谷</strong> 和 <strong>东方博宜OJ</strong> 的 C++ 题解，涵盖入门到省选级别的各类算法题目。所有题解均由章老师精心编写，配有详细的题目描述、解题思路和完整代码。</p>
          </div>

          <div class="guide-section">
            <h3>📊 数据概览</h3>
            <ul>
              <li>洛谷题解：<strong>${INDEX ? INDEX.problems.filter(p => p.source === '洛谷').length : '...'} 道</strong></li>
              <li>东方博宜题解：<strong>${INDEX ? INDEX.problems.filter(p => p.source === '东方博宜').length : '...'} 道</strong></li>
              <li>总计：<strong>${INDEX ? INDEX.totalProblems : '...'} 道题解</strong></li>
            </ul>
          </div>

          <div class="guide-section">
            <h3>🔍 使用方法</h3>
            <ol>
              <li>在首页<strong>搜索框</strong>中输入题号、题名或标签关键词即可快速查找</li>
              <li>点击<strong>标签分类</strong>可按难度或题单浏览题目</li>
              <li>进入题解详情页，查看题目描述、解题思路和代码</li>
              <li>代码块右上角有<strong>复制按钮</strong>，方便复制代码</li>
              <li>支持 <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> 快捷键快速搜索</li>
            </ol>
          </div>

          <div class="guide-section">
            <h3>⚡ 功能特性</h3>
            <ul>
              <li>按<strong>来源</strong>筛选：洛谷 / 东方博宜</li>
              <li>按<strong>难度</strong>浏览：入门、普及、提高等</li>
              <li>按<strong>题单</strong>分类：入门系列、GESP考级、蓝桥杯等</li>
              <li>按<strong>标签</strong>搜索：动态规划、DFS、贪心等算法标签</li>
              <li><strong>暗色/亮色</strong>主题切换</li>
              <li>代码<strong>语法高亮</strong> + 一键复制</li>
              <li>文章<strong>目录导航</strong> + 阅读进度条</li>
            </ul>
          </div>

          <div class="guide-section">
            <h3>📌 注意事项</h3>
            <ul>
              <li>本站为教学用途，仅供学习参考</li>
              <li>题目版权归原作者及OJ平台所有</li>
              <li>题解中的代码均为 C++ 语言</li>
              <li>如有问题或建议，请联系章老师</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

// ========== Events ==========
  function bindSearchEvents() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      let debounce;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          searchQuery = e.target.value;
          const list = document.getElementById('problemList');
          if (list) list.innerHTML = renderProblemList(getProblems());
        }, 200);
      });
    }

    // Filter page search (training/diff/tag detail pages)
    const filterInputs = document.querySelectorAll('.filter-search-input');
    if (filterInputs.length) {
      filterInputs.forEach(input => {
        let debounce;
        input.addEventListener('input', (e) => {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
          const list = input.closest('.page').querySelector('#problemList');
          if (!list) return;
          const dataScript = list.querySelector('#problemsData');
          if (!dataScript) return;
          const allProblems = JSON.parse(dataScript.textContent);
            const q = e.target.value.trim().toLowerCase();
            const filtered = q ? allProblems.filter(p => {
              return (p.id || '').toLowerCase().includes(q) ||
                     (p.title || '').toLowerCase().includes(q) ||
                     (p.numId || '').toLowerCase().includes(q) ||
                     p.tags.some(t => t.toLowerCase().includes(q));
            }) : allProblems;
            list.innerHTML = renderProblemList(filtered);
            const countEl = list.closest('.page').querySelector('.filter-result-count');
            if (countEl) countEl.textContent = filtered.length;
            // 重新绑定列表内点击（已在 app.onclick 处理，无需额外绑定）
          }, 200);
        });
      });
    }

    // Search clear buttons (all search bars)
    document.querySelectorAll('.search-clear').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.closest('.search-bar').querySelector('input');
        if (!input) return;
        input.value = '';
        input.focus();
        // 触发 input 事件以刷新列表
        input.dispatchEvent(new Event('input'));
      });
    });

    // Filter tabs
    const tabs = document.getElementById('filterTabs');
    if (tabs) {
      tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-tab');
        if (!btn) return;
        currentFilter = btn.dataset.filter;
        tabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const list = document.getElementById('problemList');
        if (list) list.innerHTML = renderProblemList(getProblems());
      });
    }

    // If viewing a solution, load its content
    const hash = location.hash || '#/';
    if (hash.startsWith('#/post/')) {
      const id = hash.replace('#/post/', '');
      loadAndRenderSolution(id);
    }

    // Tags page: source tabs + category tabs
    bindTagsTabs();
  }

  function bindTagsTabs() {
    const sourceTabs = document.getElementById('sourceTabs');
    if (!sourceTabs) return;

    function updateContent() {
      const problems = INDEX.problems.filter(p => {
        return tagsSource === 'luogu' ? p.source === '洛谷' : p.source === '东方博宜';
      });
      const content = document.getElementById('tagsContent');
      if (!content) return;
      content.innerHTML = renderTagsContent(problems, tagsSource);
    }

    sourceTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.source-tab');
      if (!btn) return;
      tagsSource = btn.dataset.source;
      sourceTabs.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      updateContent();
    });

    // 难度统计条和题单列表项的事件委托
    const content = document.getElementById('tagsContent');
    if (content) {
      content.addEventListener('click', (e) => {
        const diffCard = e.target.closest('[data-action="filter-diff"]');
        if (diffCard) {
          const source = diffCard.dataset.source;
          const diff = diffCard.dataset.diff;
          location.hash = `#/diff/${source}/${encodeURIComponent(diff)}`;
          return;
        }
        const trainingCard = e.target.closest('[data-action="filter-training"]');
        if (trainingCard) {
          const source = trainingCard.dataset.source;
          const training = trainingCard.dataset.training;
          location.hash = `#/training/${source}/${encodeURIComponent(training)}`;
          return;
        }
      });
    }
  }

  // ========== Boot ==========
  document.addEventListener('DOMContentLoaded', init);

})();
