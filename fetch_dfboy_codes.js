#!/usr/bin/env node
/**
 * 从东方博宜OJ爬取缺代码题目的AC代码并写入md文件
 * 
 * 流程：
 *   1. 登录 → 获取当前用户名
 *   2. 扫描所有缺代码的 md 文件
 *   3. 逐题访问题目页面，提取【当前用户】最新的C++ AC提交的 source id
 *   4. 访问 /solution/source?id=XXX 获取代码
 *   5. 写入对应 md 文件（不覆盖已有的正确C++代码）
 * 
 * 用法：DFBOY_USER=账号 DFBOY_PASS=密码 node fetch_dfboy_codes.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://oj.czos.cn';
const OUTPUT_DIR = path.join(__dirname, 'solutions/dfboy');
const USERNAME = process.env.DFBOY_USER || '';
const PASSWORD = process.env.DFBOY_PASS || '';

if (!USERNAME || !PASSWORD) {
  console.error('请设置环境变量 DFBOY_USER 和 DFBOY_PASS');
  process.exit(1);
}

// ============================================================
// HTTP 工具
// ============================================================
let cookieJar = {};
function updateCookies(headers) {
  if (!headers) return;
  const h = Array.isArray(headers) ? headers : [headers];
  for (const s of h) {
    const p = s.split(';')[0].trim();
    const i = p.indexOf('=');
    if (i > 0) cookieJar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
}
function getCookie() { return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; '); }

function httpGet(urlPath, useCookie = true) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
    if (useCookie) headers['Cookie'] = getCookie();
    https.get({ hostname: 'oj.czos.cn', path: urlPath, headers }, res => {
      if (res.statusCode === 302 && res.headers.location) {
        const newUrl = new URL(res.headers.location, BASE_URL);
        updateCookies(res.headers['set-cookie']);
        httpGet(newUrl.pathname + newUrl.search, useCookie).then(resolve).catch(reject);
        return;
      }
      updateCookies(res.headers['set-cookie']);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
  });
}

function httpPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': getCookie(),
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/site/login`,
    };
    const r = https.request({ hostname: 'oj.czos.cn', path: urlPath, method: 'POST', headers }, res => {
      updateCookies(res.headers['set-cookie']);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ============================================================
// 登录
// ============================================================
async function login() {
  console.log('🔑 登录...');
  const loginPage = await httpGet('/site/login');
  const csrfMatch = loginPage.body.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error('无法获取 CSRF token');
  
  await httpPost('/site/login', {
    _csrf: csrfMatch[1],
    'LoginForm[username]': USERNAME,
    'LoginForm[password]': PASSWORD,
    'LoginForm[rememberMe]': '1',
    'login-button': '',
  });
  
  const home = await httpGet('/');
  if (home.body.includes('logout') || home.body.includes('/site/logout')) {
    console.log('✅ 登录成功');
    return true;
  }
  console.error('❌ 登录失败');
  return false;
}

// ============================================================
// 获取当前登录用户的用户名
// ============================================================
function getLoggedInUsername(html) {
  // 从页面中提取当前用户名
  const m = html.match(/user\/view\?id=\d+[^>]*>\s*([^<]+)/);
  if (m) return m[1].trim();
  // 另一种模式
  const m2 = html.match(/>([^<]+)\s*<\/a>\s*<[^>]*logout/);
  if (m2) return m2[1].trim();
  return USERNAME; // fallback: 用登录用户名
}

// ============================================================
// 从题目页面提取【当前用户】最新C++ AC提交的source id
// 关键修复：必须过滤用户名，只取自己的提交！
// ============================================================
function extractMyCppACSourceId(html, myUsername) {
  // 按 <tr> 切分，找到包含用户名 + 通过(AC) + /solution/source 的行
  const trBlocks = html.split(/<tr[^>]*>/);
  let myAcIds = [];
  
  for (const tr of trBlocks) {
    // 检查是否包含"通过"标记（text-success 或 "通过"文字）
    const isAC = tr.includes('通过') && (tr.includes('text-success') || tr.includes('label-success'));
    if (!isAC) continue;
    
    // 检查是否是当前用户的提交
    // 用户名通常在 <td> 或 <a href="/user/view?id=XXX"> 用户名 </a> 中
    if (myUsername && !tr.includes(myUsername)) continue;
    
    // 提取 source id
    const srcMatch = tr.match(/\/solution\/source\?id=(\d+)/);
    if (srcMatch) myAcIds.push(srcMatch[1]);
  }
  
  if (myAcIds.length === 0) return null;
  // 返回第一个（最新的）
  return myAcIds[0];
}

// ============================================================
// 从 source 页面提取代码
// ============================================================
function extractCodeFromSource(html) {
  // 代码在 <div class="pre"><p>...</p></div> 里
  const preMatch = html.match(/<div class="pre">(<p>[\s\S]*?<\/p>)/);
  if (!preMatch) return null;
  
  let code = preMatch[1]
    .replace(/<\/p>/g, '\n')
    .replace(/<p>/g, '');
  code = decodeEntities(code);
  return code.trim();
}

// ============================================================
// 判断代码是否为 C++
// ============================================================
function isCppCode(code) {
  if (!code) return false;
  const trimmed = code.trim();
  const hasCppFeature = ['#include', 'using namespace', 'int main', 'cout', 'cin', 'printf', 'scanf', 'endl'].some(k => trimmed.includes(k));
  const hasPythonFeature = [/print\s*\(/, /input\s*\(/, 'def ', /^import /m].some(r => r.test(trimmed));
  return hasCppFeature && !hasPythonFeature;
}

// ============================================================
// 将代码写入 md 文件（安全的写入方式）
// ============================================================
function writeCodeToMd(problemId, code) {
  const mdPath = path.join(OUTPUT_DIR, `${problemId}.md`);
  if (!fs.existsSync(mdPath)) return false;
  
  let content = fs.readFileSync(mdPath, 'utf8');
  
  // 如果已经有 C++ 题解代码块，不覆盖
  const codeBlocks = [...content.matchAll(/```cpp\n([\s\S]*?)```/g)];
  for (const block of codeBlocks) {
    if (isCppCode(block[1])) {
      return false; // 已有正确的 C++ 代码
    }
  }
  
  // 如果有空的或非C++的 "## 题解" 或 "## AC代码" 部分，删除它
  content = content.replace(/\n## 解题思路\n\n## AC代码\n\n```cpp\n[\s\S]*?```\n/, '');
  content = content.replace(/\n## AC代码\n\n```cpp\n[\s\S]*?```\n/, '');
  
  // 追加 C++ 代码块
  const codeBlock = `\n## AC代码\n\n\`\`\`cpp\n${code}\n\`\`\`\n`;
  content = content.trimEnd() + codeBlock + '\n';
  
  fs.writeFileSync(mdPath, content, 'utf8');
  return true;
}

// ============================================================
// 扫描本地缺代码的 md 文件
// ============================================================
function findMissingCodeFiles() {
  const missing = [];
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    if (!f.endsWith('.md')) continue;
    const id = f.replace('.md', '');
    const content = fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf8');
    
    // 检查是否有有效的 C++ 代码块
    const blocks = [...content.matchAll(/```cpp\n([\s\S]*?)```/g)];
    let hasValidCode = false;
    for (const block of blocks) {
      if (isCppCode(block[1]) && block[1].trim().length > 30) {
        hasValidCode = true;
        break;
      }
    }
    
    if (!hasValidCode) {
      missing.push(id);
    }
  }
  return missing.sort((a, b) => parseInt(a) - parseInt(b));
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log('🚀 东方博宜OJ AC代码补全工具');
  console.log(`👤 用户: ${USERNAME}`);
  
  // 1. 登录
  const ok = await login();
  if (!ok) process.exit(1);
  
  // 2. 获取当前用户名
  const home = await httpGet('/');
  const myUsername = getLoggedInUsername(home.body);
  console.log(`📌 当前用户名: ${myUsername}`);
  
  // 3. 扫描缺代码文件
  const targets = findMissingCodeFiles();
  console.log(`📋 缺少有效C++代码的文件: ${targets.length} 个`);
  
  if (targets.length === 0) {
    console.log('✅ 所有题目都已有正确的C++代码');
    return;
  }
  
  // 4. 逐题爬取
  let success = 0, skipped = 0, failed = 0, noCode = 0;
  
  for (let i = 0; i < targets.length; i++) {
    const pid = targets[i];
    const progress = `[${i + 1}/${targets.length}]`;
    
    try {
      // 访问题目页面（需要登录才能看到提交记录）
      const probPage = await httpGet(`/p/${pid}`);
      
      if (probPage.status !== 200 || probPage.body.length < 1000) {
        console.log(`${progress} #${pid} ⚠️ 题目页面异常`);
        failed++;
        await sleep(500);
        continue;
      }
      
      // 提取【当前用户】的AC source id
      const sourceId = extractMyCppACSourceId(probPage.body, myUsername);
      if (!sourceId) {
        console.log(`${progress} #${pid} ⚠️ 未找到你的AC提交记录`);
        noCode++;
        await sleep(300);
        continue;
      }
      
      // 获取代码
      const srcPage = await httpGet(`/solution/source?id=${sourceId}`);
      const code = extractCodeFromSource(srcPage.body);
      
      if (!code || code.length < 10 || !isCppCode(code)) {
        console.log(`${progress} #${pid} ⚠️ 代码无效或非C++`);
        noCode++;
        await sleep(300);
        continue;
      }
      
      // 写入md
      const written = writeCodeToMd(pid, code);
      if (written) {
        success++;
        console.log(`${progress} #${pid} ✅ 写入成功 (${code.length}字符)`);
      } else {
        skipped++;
        console.log(`${progress} #${pid} ⏭️ 已有代码，跳过`);
      }
      
    } catch (e) {
      console.log(`${progress} #${pid} ❌ 错误: ${e.message}`);
      failed++;
    }
    
    await sleep(300 + Math.random() * 200);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 完成！`);
  console.log(`  ✅ 写入成功: ${success}`);
  console.log(`  ⏭️ 已有代码: ${skipped}`);
  console.log(`  ⚠️ 无AC记录: ${noCode}`);
  console.log(`  ❌ 失败: ${failed}`);
  console.log('='.repeat(50));
  
  // 5. 重建索引
  console.log('\n🔨 重建索引...');
  try {
    const { execSync } = require('child_process');
    execSync('node build.js', { cwd: __dirname, stdio: 'inherit' });
  } catch (e) {
    console.error('重建索引失败:', e.message);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
