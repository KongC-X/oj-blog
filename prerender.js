#!/usr/bin/env node
/**
 * prerender.js — 构建期生成静态 HTML，供搜索引擎抓取
 *
 * 生成三类页面：
 *   1. 详情页  /p/<id>/            每题一页，含完整正文
 *   2. 聚合页  /tags/              标签/难度/题单总览
 *              /d/<src>/<diff>/     某难度下的题目列表
 *              /t/<src>/<training>/ 某题单下的题目列表
 *              /tag/<tag>/          某标签下的题目列表
 *   3. 同时产出 sitemap.xml 与 robots.txt
 *
 * 设计要点：
 *   - 页面全部不依赖 JS，禁用脚本也能完整阅读与跳转
 *   - 详情页与聚合页互相链接，形成可爬的内链网络
 *   - 默认增量（比对 mtime + ASSET_VER），--clean 全量，--limit=N 调试
 *
 * 用法：
 *   node prerender.js                # 增量
 *   node prerender.js --clean        # 全量重建
 *   node prerender.js --limit=20     # 只处理前 20 题（调试）
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'p');
const INDEX_FILE = path.join(ROOT, 'data', 'index.json');
const SITE = 'https://zymojblog.top';
const ASSET_VER = '20261104e';
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.slice(8), 10) : 0;

// ---------- 工具 ----------

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// URL 片段：保留中文（可读、利于中文搜索），去掉路径敏感与保留字符
function slugify(name) {
  return String(name || '')
    .replace(/[\/\\]/g, '-')
    .replace(/[【】「」《》()（）\[\]]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[!@#$%^&*+=|~`'",:;<>?]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// 难度用固定英文 slug，避免中文与 + / 在 URL 中的歧义
const DIFF_SLUG = {
  '暂无评定': 'unrated',
  '入门': 'rumen',
  '普及-': 'puji-jian',
  '普及': 'puji',
  '普及+/提高-': 'puji-plus',
  '提高': 'tigao',
  '提高+/省选-': 'tigao-plus',
  '省选/NOI-': 'shengxuan',
  'NOI/NOI+/CTS': 'noi',
  '基础': 'jichu',
};

const SOURCE_SLUG = { '洛谷': 'luogu', '东方博宜': 'dfboy' };

const DIFF_ORDER = [
  '暂无评定', '入门', '普及-', '普及', '普及+/提高-', '提高',
  '提高+/省选-', '省选/NOI-', 'NOI/NOI+/CTS', '基础',
];

function stripFrontMatter(md) {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

function plainText(md, maxLen) {
  let t = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[->*+]\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen && t.length > maxLen) t = t.slice(0, maxLen - 1) + '…';
  return t;
}

function buildDescription(body, fallback) {
  const sec = body.match(/##\s*题目描述\s*\n([\s\S]*?)(?=\n##\s|$)/);
  let src = sec ? sec[1] : body;
  if (!sec) {
    src = src
      .replace(/^>\s*\*\*[^*]+\*\*\s*\|.*$/gm, '')
      .replace(/^\*\*算法标签\*\*：.*$/gm, '')
      .replace(/^##\s*(题目背景|输入格式|样例).*$/gm, '');
  }
  const text = plainText(src, 150);
  return text || fallback;
}

// ---------- 统一布局 ----------

function renderLayout({ title, description, canonicalPath, bodyHtml, hasMath, jsonLd }) {
  const pageUrl = SITE + canonicalPath;
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="章老师的OJ题解站">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/vendor/github-dark.min.css">
<link rel="stylesheet" href="/css/style.css?v=${ASSET_VER}">
${hasMath ? '<link rel="stylesheet" href="/vendor/katex/katex.min.css">' : ''}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body>
<a class="skip-link" href="#seoMain">跳到主要内容</a>
<header class="seo-header">
  <a class="seo-logo" href="/">章老师的OJ题解站</a>
  <nav class="seo-nav">
    <a href="/#/">全部题解</a>
    <a href="/tags/">标签分类</a>
    <a href="/#/about">关于</a>
  </nav>
</header>
<main class="seo-main" id="seoMain">
${bodyHtml}
</main>
<footer class="seo-footer">© 2026 章老师的OJ题解站 · 信奥赛教练的题解合集</footer>
</body>
</html>`;
}

// ---------- 题目列表组件 ----------

function renderProblemRows(problems) {
  return `<ul class="seo-problem-list">
${problems.map(p => `  <li><a href="/p/${encodeURIComponent(p.id)}/"><span class="seo-plist-id">${escapeHtml(p.id)}</span><span class="seo-plist-title">${escapeHtml(p.title)}</span><span class="seo-plist-diff">${escapeHtml(p.difficulty || '')}</span></a></li>`).join('\n')}
</ul>`;
}

// ---------- 详情页 ----------

function renderDetailPage(p, bodyHtml, description, related, prev, next, validTags) {
  const pageUrl = `${SITE}/p/${encodeURIComponent(p.id)}/`;
  const title = `${p.id} ${p.title} 题解 - 章老师的OJ题解站`;
  const hasMath = bodyHtml.includes('class="katex');
  const srcSlug = SOURCE_SLUG[p.source] || '';
  const diffSlug = DIFF_SLUG[p.difficulty] || '';

  // 只有题量足够的标签才建了独立页面，其余渲染成不可点的标签，避免死链
  const tagsHtml = (p.tags || [])
    .map(t => (validTags.has(t)
      ? `<a class="seo-tag" href="/tag/${encodeURIComponent(slugify(t))}/">${escapeHtml(t)}</a>`
      : `<span class="seo-tag">${escapeHtml(t)}</span>`))
    .join('');
  const trainingHtml = (p.training || [])
    .filter(() => srcSlug)
    .map(t => `<a class="seo-tag seo-tag-soft" href="/t/${srcSlug}/${encodeURIComponent(slugify(t))}/">${escapeHtml(t)}</a>`)
    .join('');

  const crumb = `<div class="seo-crumb">
  <a href="/">首页</a> /
  <a href="/#/">${escapeHtml(p.source)}</a>
  ${diffSlug ? `/ <a href="/d/${srcSlug}/${diffSlug}/">${escapeHtml(p.difficulty)}</a>` : ''}
  / <span>${escapeHtml(p.id)}</span>
</div>`;

  const navHtml = (prev || next) ? `
<nav class="seo-pn" aria-label="上下篇题解">
  ${prev ? `<a class="seo-pn-item" href="/p/${encodeURIComponent(prev.id)}/"><span class="seo-pn-label">← 上一篇</span><span class="seo-pn-title">${escapeHtml(prev.id)} ${escapeHtml(prev.title)}</span></a>` : '<span class="seo-pn-item seo-pn-empty"></span>'}
  ${next ? `<a class="seo-pn-item seo-pn-next" href="/p/${encodeURIComponent(next.id)}/"><span class="seo-pn-label">下一篇 →</span><span class="seo-pn-title">${escapeHtml(next.id)} ${escapeHtml(next.title)}</span></a>` : '<span class="seo-pn-item seo-pn-empty"></span>'}
</nav>` : '';

  const relatedHtml = related.length ? `
<section class="seo-related">
  <h2 class="seo-section-title">相关题解</h2>
  ${renderProblemRows(related)}
</section>` : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: `${p.id} ${p.title}`,
    headline: `${p.id} ${p.title} 题解`,
    description,
    url: pageUrl,
    inLanguage: 'zh-CN',
    educationalLevel: p.difficulty || undefined,
    learningResourceType: '题解',
    about: (p.tags || []).join('、') || undefined,
    isPartOf: { '@type': 'WebSite', name: '章老师的OJ题解站', url: SITE },
    author: { '@type': 'Person', name: '章老师' },
  };

  const body = `${crumb}
<h1 class="seo-title">${escapeHtml(p.id)} ${escapeHtml(p.title)}</h1>
<div class="seo-meta">
  <span class="seo-badge seo-badge-source">${escapeHtml(p.source)}</span>
  ${p.difficulty ? `<span class="seo-badge">${escapeHtml(p.difficulty)}</span>` : ''}
</div>
${(tagsHtml || trainingHtml) ? `<div class="seo-tags">${tagsHtml}${trainingHtml}</div>` : ''}
<article class="markdown-body seo-article">
${bodyHtml}
</article>
<div class="seo-cta">
  <a href="/#/post/${encodeURIComponent(p.id)}">在交互版中打开</a>
  <span>支持站内搜索、标签筛选、代码复制</span>
</div>
${navHtml}
${relatedHtml}`;

  return renderLayout({
    title, description, canonicalPath: `/p/${encodeURIComponent(p.id)}/`, bodyHtml: body, hasMath, jsonLd,
  });
}

// ---------- 聚合页 ----------

function renderListPage({ h1, description, canonicalPath, problems, intro, children }) {
  const title = `${h1} - 章老师的OJ题解站`;
  const body = `<div class="seo-crumb"><a href="/">首页</a> / <a href="/tags/">标签分类</a></div>
<h1 class="seo-title">${escapeHtml(h1)}</h1>
<p class="seo-lead">${escapeHtml(intro)}</p>
<div class="seo-list-meta">共 <strong>${problems.length}</strong> 道题解</div>
${children || renderProblemRows(problems)}
<div class="seo-cta">
  <a href="/#/">进入交互版</a>
  <span>支持搜索与筛选</span>
</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: h1,
    description,
    url: SITE + canonicalPath,
    inLanguage: 'zh-CN',
    isPartOf: { '@type': 'WebSite', name: '章老师的OJ题解站', url: SITE },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: problems.length,
      itemListElement: problems.slice(0, 50).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE}/p/${encodeURIComponent(p.id)}/`,
        name: `${p.id} ${p.title}`,
      })),
    },
  };

  return renderLayout({ title, description, canonicalPath, bodyHtml: body, hasMath: false, jsonLd });
}

function renderTagsIndex({ byDifficulty, tagCounts, trainingBySource, validTags }) {
  const canonicalPath = '/tags/';
  const title = '标签分类 - 章老师的OJ题解站';
  const description = '按难度、题单、算法标签浏览全部信奥赛题解，覆盖洛谷与东方博宜 2200+ 道题目。';

  const diffBlocks = Object.entries(byDifficulty).map(([src, diffs]) => {
    const srcSlug = SOURCE_SLUG[src];
    if (!srcSlug) return '';
    const items = Object.entries(diffs)
      .sort((a, b) => DIFF_ORDER.indexOf(a[0]) - DIFF_ORDER.indexOf(b[0]))
      .map(([d, cnt]) => `<a class="seo-chip" href="/d/${srcSlug}/${DIFF_SLUG[d] || slugify(d)}/">${escapeHtml(d)}<span>${cnt}</span></a>`)
      .join('');
    return `<section class="seo-block"><h2 class="seo-section-title">${escapeHtml(src)} · 按难度</h2><div class="seo-chips">${items}</div></section>`;
  }).join('');

  const trainingBlocks = Object.entries(trainingBySource).map(([src, map]) => {
    const srcSlug = SOURCE_SLUG[src];
    if (!srcSlug) return '';
    const items = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([t, cnt]) => `<a class="seo-chip" href="/t/${srcSlug}/${encodeURIComponent(slugify(t))}/">${escapeHtml(t)}<span>${cnt}</span></a>`)
      .join('');
    return `<section class="seo-block"><h2 class="seo-section-title">${escapeHtml(src)} · 按题单</h2><div class="seo-chips">${items}</div></section>`;
  }).join('');

  const tagItems = Object.entries(tagCounts)
    .filter(([t]) => validTags.has(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([t, cnt]) => `<a class="seo-chip" href="/tag/${encodeURIComponent(slugify(t))}/">${escapeHtml(t)}<span>${cnt}</span></a>`)
    .join('');

  const body = `<div class="seo-crumb"><a href="/">首页</a> / <span>标签分类</span></div>
<h1 class="seo-title">标签分类</h1>
<p class="seo-lead">按难度、题单或算法标签浏览全部题解。</p>
${diffBlocks}
${trainingBlocks}
<section class="seo-block"><h2 class="seo-section-title">按算法标签</h2><div class="seo-chips">${tagItems}</div></section>
<div class="seo-cta"><a href="/#/">进入交互版</a><span>支持站内搜索与多条件筛选</span></div>`;

  return renderLayout({ title, description, canonicalPath, bodyHtml: body, hasMath: false });
}

// ---------- 主流程 ----------

async function main() {
  const { marked } = await import('marked');
  const hljs = require(path.join(ROOT, 'vendor', 'bundle.min.js'));
  const katex = require('katex');

  const blockMath = {
    name: 'blockMath',
    level: 'block',
    start(src) { const i = src.indexOf('$$'); return i < 0 ? undefined : i; },
    tokenizer(src) {
      const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
      if (m) return { type: 'blockMath', raw: m[0], text: m[1].trim() };
    },
    renderer(token) {
      try {
        return katex.renderToString(token.text, { throwOnError: false, displayMode: true, strict: false });
      } catch {
        return `<pre class="math-fallback">${escapeHtml(token.text)}</pre>`;
      }
    },
  };

  const inlineMath = {
    name: 'inlineMath',
    level: 'inline',
    start(src) { const i = src.indexOf('$'); return i < 0 ? undefined : i; },
    tokenizer(src) {
      const m = /^\$(?!\$)([^$\n]+?)\$/.exec(src);
      if (m) return { type: 'inlineMath', raw: m[0], text: m[1].trim() };
    },
    renderer(token) {
      try {
        return katex.renderToString(token.text, { throwOnError: false, displayMode: false, strict: false });
      } catch {
        return `<code>${escapeHtml(token.raw)}</code>`;
      }
    },
  };

  marked.use({
    extensions: [blockMath, inlineMath],
    renderer: {
      code(token) {
        const text = typeof token === 'string' ? token : token.text;
        const lang = typeof token === 'string' ? arguments[1] : token.lang;
        const language = lang && hljs.getLanguage(lang) ? lang : 'cpp';
        let inner;
        try {
          inner = hljs.highlight(text, { language }).value;
        } catch {
          inner = escapeHtml(text);
        }
        return `<pre><code class="hljs language-${language}">${inner}</code></pre>`;
      },
    },
  });
  marked.setOptions({ gfm: true, breaks: true });

  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  const fullProblems = index.problems || [];
  let problems = fullProblems;
  if (LIMIT > 0) problems = problems.slice(0, LIMIT);

  const CLEAN = process.argv.includes('--clean');
  // 注意：不删除 p/ 目录。整目录递归删除会触发安全策略的批量删除保护，
  // 且当前没有删题场景。CLEAN 仅表示「跳过增量判断，强制重写所有页面」。
  // 需要真正清空时，改大 ASSET_VER 让所有页面自然重建即可。
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const urls = new Set([SITE + '/']);
  let ok = 0, fail = 0, skipped = 0;

  // ---------- 1. 详情页 ----------
  const bySource = {};
  for (const p of problems) {
    (bySource[p.source] = bySource[p.source] || []).push(p);
  }
  for (const list of Object.values(bySource)) {
    list.sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-CN', { numeric: true }));
  }
  const byTag = {};
  for (const p of problems) {
    for (const t of (p.tags || [])) {
      (byTag[t] = byTag[t] || []).push(p);
    }
  }

  // 标签题量统计：题量不足的标签不建独立页面，避免搜索引擎判定为薄内容
  const MIN_TAG_COUNT = 3;
  const tagCounts = {};
  for (const [t, list] of Object.entries(byTag)) tagCounts[t] = list.length;
  const validTags = new Set(
    Object.entries(tagCounts).filter(([, c]) => c >= MIN_TAG_COUNT).map(([t]) => t)
  );

  for (const p of problems) {
    const mdPath = path.join(ROOT, 'solutions', p.filePath);
    const dir = path.join(OUT_DIR, p.id);
    const outPath = path.join(dir, 'index.html');

    let mdStat;
    try {
      mdStat = fs.statSync(mdPath);
    } catch {
      fail++;
      continue;
    }

    const canonicalPath = `/p/${encodeURIComponent(p.id)}/`;
    urls.add(SITE + canonicalPath);

    if (!CLEAN && fs.existsSync(outPath)) {
      const outStat = fs.statSync(outPath);
      if (outStat.mtimeMs >= mdStat.mtimeMs) {
        const head = fs.readFileSync(outPath, 'utf-8').slice(0, 3000);
        if (head.includes(`?v=${ASSET_VER}`)) {
          skipped++;
          continue;
        }
      }
    }

    let md;
    try {
      md = fs.readFileSync(mdPath, 'utf-8');
    } catch {
      fail++;
      continue;
    }
    const bodyMd = stripFrontMatter(md);
    let bodyHtml;
    try {
      bodyHtml = marked.parse(bodyMd);
    } catch {
      bodyHtml = `<pre>${escapeHtml(bodyMd)}</pre>`;
    }
    const description = buildDescription(bodyMd, `${p.id} ${p.title} 的题解`);

    // 相关题：同标签最多 3 道
    const related = [];
    const seen = new Set([p.id]);
    for (const t of (p.tags || [])) {
      for (const cand of (byTag[t] || [])) {
        if (related.length >= 3) break;
        if (seen.has(cand.id)) continue;
        seen.add(cand.id);
        related.push(cand);
      }
      if (related.length >= 3) break;
    }

    // 上下篇：同来源、按题号排序的相邻项
    const list = bySource[p.source] || [];
    const idx = list.findIndex(x => x.id === p.id);
    const prev = idx > 0 ? list[idx - 1] : null;
    const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, renderDetailPage(p, bodyHtml, description, related, prev, next, validTags), 'utf-8');
    ok++;
  }

  // ---------- 2. 聚合页 ----------
  let aggCount = 0;
  const writeAgg = (relPath, html) => {
    const dir = path.join(ROOT, relPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8');
    // 与 canonical 保持一致，统一带尾斜杠
    urls.add(SITE + '/' + relPath.replace(/\\/g, '/') + '/');
    aggCount++;
  };

  const byDifficulty = {};
  for (const p of fullProblems) {
    byDifficulty[p.source] = byDifficulty[p.source] || {};
    byDifficulty[p.source][p.difficulty || '暂无评定'] =
      (byDifficulty[p.source][p.difficulty || '暂无评定'] || 0) + 1;
  }

  writeAgg('tags', renderTagsIndex({
    byDifficulty,
    tagCounts,
    trainingBySource: index.trainingBySource || {},
    validTags,
  }));

  for (const [src, diffs] of Object.entries(byDifficulty)) {
    const srcSlug = SOURCE_SLUG[src];
    if (!srcSlug) continue;
    for (const [diff, cnt] of Object.entries(diffs)) {
      const dSlug = DIFF_SLUG[diff] || slugify(diff);
      const list = fullProblems
        .filter(p => p.source === src && (p.difficulty || '暂无评定') === diff)
        .sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-CN', { numeric: true }));
      writeAgg(`d/${srcSlug}/${dSlug}`, renderListPage({
        h1: `${src} · ${diff} 难度题解`,
        description: `${src}「${diff}」难度共 ${cnt} 道题解，含完整 AC 代码与解题思路。`,
        canonicalPath: `/d/${srcSlug}/${dSlug}/`,
        problems: list,
        intro: `${src}题库中难度为「${diff}」的全部题解，按题号排序。`,
      }));
    }
  }

  for (const [src, map] of Object.entries(index.trainingBySource || {})) {
    const srcSlug = SOURCE_SLUG[src];
    if (!srcSlug) continue;
    for (const [training, cnt] of Object.entries(map)) {
      const tSlug = slugify(training);
      if (!tSlug) continue;
      const list = fullProblems
        .filter(p => p.source === src && Array.isArray(p.training) && p.training.includes(training))
        .sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-CN', { numeric: true }));
      writeAgg(`t/${srcSlug}/${tSlug}`, renderListPage({
        h1: `${training} 题单（${src}）`,
        description: `${src}「${training}」题单共 ${cnt} 道题解，含完整 AC 代码。`,
        canonicalPath: `/t/${srcSlug}/${tSlug}/`,
        problems: list,
        intro: `${src}「${training}」题单包含的题目，按题号排序。`,
      }));
    }
  }

  for (const [tag, cnt] of Object.entries(tagCounts)) {
    if (!validTags.has(tag)) continue; // 题量不足的标签不建页
    const tSlug = slugify(tag);
    if (!tSlug) continue;
    const list = fullProblems
      .filter(p => Array.isArray(p.tags) && p.tags.includes(tag))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-CN', { numeric: true }));
    writeAgg(`tag/${tSlug}`, renderListPage({
      h1: `${tag} 算法题解`,
      description: `标注「${tag}」算法的信奥赛题解共 ${cnt} 道，覆盖洛谷与东方博宜。`,
      canonicalPath: `/tag/${tSlug}/`,
      problems: list,
      intro: `全部使用「${tag}」算法的题解，按题号排序。`,
    }));
  }

  // ---------- 3. sitemap / robots ----------
  const today = new Date().toISOString().slice(0, 10);
  const urlList = [...urls].sort();
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlList.map(u => `  <url><loc>${encodeURI(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf-8');

  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf-8');

  console.log(`✅ 详情页：新建 ${ok}，跳过 ${skipped}（未变更），失败 ${fail}`);
  console.log(`✅ 聚合页：${aggCount} 个（总览 / 难度 / 题单 / 标签）`);
  console.log(`🗺️  sitemap.xml：${urlList.length} 条 URL`);
  console.log(`🤖 robots.txt：已生成`);
}

main().catch(e => {
  console.error('❌ 预渲染失败:', e.message);
  process.exit(1);
});
