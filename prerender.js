#!/usr/bin/env node
/**
 * prerender.js — 为每题生成静态 HTML 快照，供搜索引擎抓取
 *
 * 背景：
 *   站点是 hash 路由 SPA（#/post/P1001），HTML 是空壳，搜索引擎无法索引内容。
 *   本脚本在构建期为每道题生成 /p/<id>/index.html：
 *     - 含完整正文、标题、描述、canonical、OG、JSON-LD
 *     - 不依赖 JS，禁用 JS 也能读
 *     - 页内提供入口跳转到交互版（hash 路由）
 *
 * 同时生成 robots.txt 与 sitemap.xml。
 *
 * 用法：
 *   node prerender.js              # 全量生成
 *   node prerender.js --limit=20   # 只生成前 20 题（调试用）
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'p');
const INDEX_FILE = path.join(ROOT, 'data', 'index.json');
const SITE = 'https://zymojblog.top';
const ASSET_VER = '20261104c';
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

// 剥离 front matter，返回正文
function stripFrontMatter(md) {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

// 生成页面描述：优先取「题目描述」章节，其次退化为正文首段
function buildDescription(body, fallback) {
  const sec = body.match(/##\s*题目描述\s*\n([\s\S]*?)(?=\n##\s|$)/);
  let src = sec ? sec[1] : body;
  if (!sec) {
    // 去掉开头的元信息行（> **洛谷** | ...、**算法标签**：...）
    src = src
      .replace(/^>\s*\*\*[^*]+\*\*\s*\|.*$/gm, '')
      .replace(/^\*\*算法标签\*\*：.*$/gm, '')
      .replace(/^##\s*(题目背景|输入格式|样例).*$/gm, '');
  }
  const text = plainText(src, 150);
  return text || fallback;
}
function plainText(md, maxLen) {
  let t = md
    .replace(/```[\s\S]*?```/g, ' ')          // 代码块
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')        // 块公式
    .replace(/\$[^$\n]+\$/g, ' ')             // 行内公式
    .replace(/^#{1,6}\s+/gm, '')              // 标题标记
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // 链接保留文字
    .replace(/^\s*[->*+]\s+/gm, '')           // 列表符号
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen && t.length > maxLen) t = t.slice(0, maxLen - 1) + '…';
  return t;
}

// ---------- 页面模板 ----------

function renderPage(p, bodyHtml, description) {
  const pageUrl = `${SITE}/p/${p.id}/`;
  const title = `${p.id} ${p.title} 题解 - 章老师的OJ题解站`;
  const tagsHtml = (p.tags || [])
    .map(t => `<a class="seo-tag" href="/#/tag/${encodeURIComponent(t)}">${escapeHtml(t)}</a>`)
    .join('');
  const diffHtml = p.difficulty
    ? `<span class="seo-badge">${escapeHtml(p.difficulty)}</span>`
    : '';
  const trainingHtml = (p.training || [])
    .map(t => `<span class="seo-badge seo-badge-soft">${escapeHtml(t)}</span>`)
    .join('');

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

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="article">
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
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<header class="seo-header">
  <a class="seo-logo" href="/">章老师的OJ题解站</a>
  <nav class="seo-nav">
    <a href="/">全部题解</a>
    <a href="/#/tags">标签分类</a>
  </nav>
</header>
<main class="seo-main">
  <div class="seo-crumb"><a href="/">首页</a> / <span>${escapeHtml(p.source)}</span> / <span>${escapeHtml(p.id)}</span></div>
  <h1 class="seo-title">${escapeHtml(p.id)} ${escapeHtml(p.title)}</h1>
  <div class="seo-meta">
    <span class="seo-badge seo-badge-source">${escapeHtml(p.source)}</span>
    ${diffHtml}
    ${trainingHtml}
  </div>
  ${tagsHtml ? `<div class="seo-tags">${tagsHtml}</div>` : ''}
  <article class="markdown-body seo-article">
${bodyHtml}
  </article>
  <div class="seo-cta">
    <a href="/#/post/${encodeURIComponent(p.id)}">在交互版中打开</a>
    <span>支持目录跳转、代码复制、上下篇导航</span>
  </div>
</main>
<footer class="seo-footer">© 2026 章老师的OJ题解站 · 信奥赛教练的题解合集</footer>
</body>
</html>`;
}

// ---------- 主流程 ----------

async function main() {
  const { marked } = await import('marked');
  const hljs = require(path.join(ROOT, 'vendor', 'bundle.min.js'));

  // 代码块高亮
  marked.use({
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
  let problems = index.problems || [];
  if (LIMIT > 0) problems = problems.slice(0, LIMIT);

  // 默认增量：源文件未更新且资源版本一致时跳过
  // --clean 强制全量重建（会先清空 p/ 目录）
  const CLEAN = process.argv.includes('--clean');
  if (CLEAN && !LIMIT && fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0, fail = 0, skipped = 0;
  const urls = [];

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

    // 增量判断：输出存在、比源文件新、且版本号一致
    if (!CLEAN && fs.existsSync(outPath)) {
      const outStat = fs.statSync(outPath);
      if (outStat.mtimeMs >= mdStat.mtimeMs) {
        const head = fs.readFileSync(outPath, 'utf-8').slice(0, 3000);
        if (head.includes(`?v=${ASSET_VER}`)) {
          skipped++;
          urls.push(`${SITE}/p/${p.id}/`);
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
    const body = stripFrontMatter(md);
    let bodyHtml;
    try {
      bodyHtml = marked.parse(body);
    } catch {
      bodyHtml = `<pre>${escapeHtml(body)}</pre>`;
    }
    const description = buildDescription(body, `${p.id} ${p.title} 的题解`);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, renderPage(p, bodyHtml, description), 'utf-8');
    ok++;
    urls.push(`${SITE}/p/${p.id}/`);
  }

  // sitemap.xml
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf-8');

  // robots.txt
  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf-8');

  console.log(`✅ 预渲染完成：成功 ${ok}，跳过 ${skipped}（未变更），失败 ${fail}`);
  console.log(`📁 输出: p/<id>/index.html`);
  console.log(`🗺️  sitemap.xml: ${urls.length + 1} 条 URL`);
  console.log(`🤖 robots.txt: 已生成`);
}

main().catch(e => {
  console.error('❌ 预渲染失败:', e.message);
  process.exit(1);
});
