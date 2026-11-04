#!/usr/bin/env node
const https = require('https');
const fs = require('fs');

const cookie = process.env.DFBOY_COOKIE;
const BASE_URL = 'oj.czos.cn';

function httpGet(path) {
  return new Promise((resolve, reject) => {
    https.get({hostname: BASE_URL, path, headers: {Cookie: cookie, 'User-Agent': 'Mozilla/5.0'}}, res => {
      if (res.statusCode === 302 && res.headers.location) {
        httpGet(new URL(res.headers.location, `https://${BASE_URL}`).pathname).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    }).on('error', reject);
  });
}

function extractCode(html) {
  const m = html.match(/<div class="pre">(<p>[\s\S]*?<\/p>)/);
  if (!m) return null;
  return m[1].replace(/<\/p>/g, '\n').replace(/<p>/g, '').trim()
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function isCpp(code) {
  if (!code) return false;
  return ['#include', 'using namespace', 'int main', 'cout', 'cin', 'printf', 'scanf'].some(k => code.includes(k))
    && ![/print\s*\(/, /input\s*\(/, /\bdef\s/, /^import\s/m].some(r => r.test(code));
}

// 找所有无代码的题目
const missing = [];
for (const f of fs.readdirSync('solutions/dfboy')) {
  if (!f.endsWith('.md')) continue;
  const content = fs.readFileSync('solutions/dfboy/' + f, 'utf8');
  if (!content.includes('```c') && !content.includes('```cpp')) missing.push(f.replace('.md', ''));
}

// 测试前 5 个无代码题目 - 看看提交记录结构
(async () => {
  for (const pid of missing.slice(0, 5)) {
    console.log(`\n=== #${pid} ===`);
    const html = await httpGet(`/p/${pid}`);
    if (html.includes('404') || html.length < 10000) {
      console.log('  404 or page error');
      continue;
    }
    
    // 提取所有 AC source IDs
    const trs = html.split(/<tr[^>]*>/);
    const acIds = [];
    for (const tr of trs) {
      const isAC = tr.includes('通过') && tr.includes('text-success');
      if (!isAC) continue;
      const hasUser = /user\/view\?id=\d+/.test(tr);
      if (hasUser) continue; // 跳过多人列表的行
      const m = tr.match(/\/solution\/source\?id=(\d+)/);
      if (m) acIds.push(m[1]);
    }
    console.log(`  AC submissions: ${acIds.length}`);
    
    // 检查每个 AC 提交的语言
    for (let i = 0; i < Math.min(3, acIds.length); i++) {
      const codeHtml = await httpGet(`/solution/source?id=${acIds[i]}`);
      const code = extractCode(codeHtml);
      if (code) {
        const lang = isCpp(code) ? 'C++' : (code.includes('print(') || code.includes('def ') ? 'Python' : 'unknown');
        console.log(`  [${i}] id=${acIds[i]} lang=${lang} len=${code.length} preview: ${code.substring(0, 60).replace(/\n/g,' ')}`);
      } else {
        console.log(`  [${i}] id=${acIds[i]} no code`);
      }
      await new Promise(r => setTimeout(r, 200));
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
