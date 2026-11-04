#!/usr/bin/env node
/**
 * fix_luogu_tags.js — 修正洛谷题解的算法标签
 *
 * 背景：
 *   luogu_fetch.js 早期使用的是社区整理的硬编码标签 ID 表，官方 ID 变动后
 *   从 ID 2 起就整体错位（例：ID 2 官方是「字符串」，表里写成「贪心」），
 *   导致已有题解的 tags 字段大量错误。
 *
 * 做法：
 *   1. 从 https://www.luogu.com.cn/_lfe/tags 拉取官方最新词典
 *   2. 扫描 solutions/luogu/*.md，逐题请求题目页取 problem.tags（ID 数组）
 *   3. 映射成名称，只更新 front matter 的 tags 行和正文的「算法标签」行
 *   4. 正文、代码、题目描述一概不动
 *
 * 用法：
 *   LUOGU_COOKIE="..." node fix_luogu_tags.js             # 正式执行
 *   LUOGU_COOKIE="..." node fix_luogu_tags.js --dry-run   # 只预览不写文件
 *   LUOGU_COOKIE="..." node fix_luogu_tags.js --only=P1001,P1982
 *
 * 断点续跑：进度记录在 /tmp/lg_tag_progress.json，中断后重跑会自动跳过已完成题目
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'solutions', 'luogu');
const PROGRESS_FILE = '/tmp/lg_tag_progress.json';
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_ARG = process.argv.find(a => a.startsWith('--only='));
const ONLY = ONLY_ARG ? ONLY_ARG.slice(7).split(',').map(s => s.trim()).filter(Boolean) : null;

let cookie = process.env.LUOGU_COOKIE || '';
if (!cookie) {
  console.error('请设置环境变量 LUOGU_COOKIE');
  process.exit(1);
}

let TAG_MAP = {};

// ============ HTTP ============

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function updateCookies(setCookies) {
  for (const c of (setCookies || [])) {
    const name = c.split('=')[0].trim();
    const m = c.match(/=([^;]+)/);
    if (name && m) {
      if (cookie.includes(name + '=')) {
        cookie = cookie.replace(new RegExp(name + '=[^;]*'), name + '=' + m[1]);
      } else {
        cookie += '; ' + name + '=' + m[1];
      }
    }
  }
}

function doFetch(url, extraHeaders, redirectCount = 0) {
  return new Promise((resolve) => {
    if (redirectCount > 8) return resolve({ status: 0, body: '' });
    const headers = Object.assign({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/json',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.luogu.com.cn/',
      'x-luogu-type': 'content-only',
      'Cookie': cookie,
    }, extraHeaders || {});

    https.get(url, { headers }, (res) => {
      updateCookies(res.headers['set-cookie']);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        return doFetch(next, extraHeaders, redirectCount + 1).then(resolve);
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        // 洛谷反爬：返回的 JS 里带新 C3VK，换了再请求一次
        if (body.includes('C3VK=')) {
          const m = body.match(/C3VK=([0-9a-zA-Z]+)/);
          if (m) {
            cookie = cookie.replace(/C3VK=[^;]*/, 'C3VK=' + m[1]);
            return doFetch(url, extraHeaders, redirectCount + 1).then(resolve);
          }
        }
        resolve({ status: res.statusCode, body });
      });
    }).on('error', () => resolve({ status: 0, body: '' }));
  });
}

// 兼容新版 lentille-context 与旧版纯 JSON
function parseLuoguPayload(body) {
  const text = (body || '').trim();
  if (!text) return null;
  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text);
      return j.currentData || j.data || j;
    } catch { return null; }
  }
  const m = text.match(/<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    const ctx = JSON.parse(m[1]);
    return ctx.data || null;
  } catch { return null; }
}

// ============ 标签词典 ============

async function loadTagDict() {
  const res = await doFetch('https://www.luogu.com.cn/_lfe/tags', { Accept: 'application/json' });
  const data = parseLuoguPayload(res.body);
  const list = data && data.tags;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('标签词典拉取失败（status=' + res.status + ', len=' + res.body.length + '）');
  }
  TAG_MAP = {};
  for (const t of list) {
    if (t && t.id !== undefined && t.name) TAG_MAP[t.id] = t.name;
  }
  console.log(`🏷️  标签词典加载完成：${list.length} 个标签`);
}

// ============ 抓取单题标签 ============

async function fetchProblemTags(pid) {
  for (let retry = 0; retry < 3; retry++) {
    const res = await doFetch(`https://www.luogu.com.cn/problem/${pid}?_contentOnly=1`);
    if (res.status === 200 && res.body.length > 500) {
      const data = parseLuoguPayload(res.body);
      const problem = data && data.problem;
      if (problem && Array.isArray(problem.tags)) {
        return problem.tags;
      }
    }
    if (retry < 2) await sleep(3000 * (retry + 1));
  }
  return null;
}

// ============ 只改 tags 相关行 ============

function updateTagsInMarkdown(md, tagNames) {
  const lines = md.split('\n');

  // 定位 front matter 区间
  let fmStart = -1, fmEnd = -1;
  if (lines[0] === '---') {
    fmStart = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') { fmEnd = i; break; }
    }
  }

  let changed = false;
  const tagLine = tagNames.length > 0 ? `tags: [${tagNames.join(', ')}]` : null;

  // 1. front matter 里的 tags 行
  if (fmStart >= 0 && fmEnd > fmStart) {
    for (let i = fmStart + 1; i < fmEnd; i++) {
      if (/^tags:/.test(lines[i])) {
        if (tagLine && lines[i] !== tagLine) {
          lines[i] = tagLine;
          changed = true;
        }
        break;
      }
    }
  }

  // 2. 正文的「**算法标签**：」行（存在才更新，不新增）
  if (tagNames.length > 0) {
    for (let i = (fmEnd > 0 ? fmEnd : 0); i < lines.length; i++) {
      if (/^\*\*算法标签\*\*：/.test(lines[i])) {
        const newLine = `**算法标签**：${tagNames.map(t => '`' + t + '`').join('、')}`;
        if (lines[i] !== newLine) {
          lines[i] = newLine;
          changed = true;
        }
        break;
      }
    }
  }

  return { text: lines.join('\n'), changed };
}

// ============ 进度 ============

function loadProgress() {
  try {
    const raw = fs.readFileSync(PROGRESS_FILE, 'utf-8');
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}

function saveProgress(done) {
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done]), 'utf-8'); } catch {}
}

// ============ 主流程 ============

async function main() {
  console.log('🚀 洛谷题解标签修正');
  console.log(`📁 目录: ${DIR}${DRY_RUN ? '  【预览模式，不写文件】' : ''}`);

  await loadTagDict();

  let files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
  if (ONLY) files = files.filter(f => ONLY.includes(f.replace(/\.md$/, '')));
  console.log(`📋 待处理题解：${files.length} 个`);

  const done = DRY_RUN ? new Set() : loadProgress();

  let updated = 0, unchanged = 0, failed = 0, skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const pid = file.replace(/\.md$/, '');
    const fp = path.join(DIR, file);
    const prefix = `  [${i + 1}/${files.length}] ${pid}`;

    if (done.has(pid)) { skipped++; continue; }

    const tagIds = await fetchProblemTags(pid);
    if (!tagIds) {
      console.log(`${prefix} ⚠️ 获取标签失败`);
      failed++;
      await sleep(1500);
      continue;
    }

    const names = [...new Set(tagIds.map(id => TAG_MAP[id]).filter(Boolean))];
    const md = fs.readFileSync(fp, 'utf-8');
    const { text, changed } = updateTagsInMarkdown(md, names);

    if (changed) {
      if (!DRY_RUN) fs.writeFileSync(fp, text, 'utf-8');
      console.log(`${prefix} ✅ ${names.join('、') || '(无标签)'}`);
      updated++;
      if (!DRY_RUN) { done.add(pid); saveProgress(done); }
    } else {
      unchanged++;
      if (!DRY_RUN) { done.add(pid); saveProgress(done); }
    }

    await sleep(900 + Math.random() * 400);
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ 完成！已更新 ${updated}，无需改动 ${unchanged}，失败 ${failed}，跳过(已完成) ${skipped}`);
  if (DRY_RUN) console.log('（预览模式，文件未改动）');
  else if (failed === 0) {
    console.log(`\n下一步：node build.js 重建索引，然后 git commit && git push`);
    try { fs.unlinkSync(PROGRESS_FILE); } catch {}
  } else {
    console.log(`\n存在失败题目，重跑本脚本会自动续跑（进度已记录）`);
  }
}

main().catch(e => { console.error('❌ 执行出错:', e.message); process.exit(1); });
