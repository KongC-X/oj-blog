#!/usr/bin/env node
/**
 * 东方博宜OJ (oj.czos.cn) 题解爬虫
 * 
 * 策略：
 *   1. 登录 → 获取个人主页上所有AC题号
 *   2. 逐题爬取题目描述（题目页不需要登录）
 *   3. 从本地 md 文件补充代码（用户本地有代码记录）
 * 
 * 用法：DFBOY_USER=账号 DFBOY_PASS=密码 node dfboy_fetch.js
 *       加 --force 可强制重新抓取已存在的文件
 *       加 --nocodes 跳过本地代码匹配
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'https://oj.czos.cn';
const OUTPUT_DIR = path.join(__dirname, 'solutions/dfboy');
const USERNAME = process.env.DFBOY_USER || '';
const PASSWORD = process.env.DFBOY_PASS || '';
const FORCE = process.argv.includes('--force');
const NO_CODES = process.argv.includes('--nocodes');

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
      updateCookies(res.headers['set-cookie']);
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

function httpPost(urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': getCookie(),
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/site/login`,
      ...extraHeaders,
    };
    const r = https.request({ hostname: 'oj.czos.cn', path: urlPath, method: 'POST', headers }, res => {
      updateCookies(res.headers['set-cookie']);
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, location: res.headers.location }));
    });
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  
  // 验证登录：访问首页检查是否有 logout
  const home = await httpGet('/');
  if (home.body.includes('logout') || home.body.includes('/site/logout')) {
    console.log('✅ 登录成功');
    return true;
  }
  console.error('❌ 登录失败');
  return false;
}

// ============================================================
// 从个人主页获取所有AC题号
// ============================================================

async function fetchACProblemIds() {
  console.log('\n📋 获取AC题目列表...');
  const home = await httpGet('/');
  
  // 从首页或个人主页提取AC题号
  // 先从首页的题目链接中找（首页可能显示了最近做题）
  let userId = '';
  const userMatch = home.body.match(/href="\/user\/view\?id=(\d+)"/);
  if (userMatch) userId = userMatch[1];
  
  if (!userId) {
    console.error('❌ 无法获取用户ID');
    return [];
  }
  console.log(`  用户ID: ${userId}`);
  
  // 访问个人主页
  const profile = await httpGet(`/user/view?id=${userId}`);
  const problemIds = [...profile.body.matchAll(/href="\/p\/(\d+)"/g)].map(m => m[1]);
  const uniqueIds = [...new Set(problemIds)].sort((a, b) => parseInt(a) - parseInt(b));
  
  console.log(`  找到 ${uniqueIds.length} 道 AC 题目`);
  return uniqueIds;
}

// ============================================================
// 爬取题目详情
// ============================================================

async function fetchProblem(problemId) {
  const res = await httpGet(`/p/${problemId}`, false);
  const html = res.body;
  
  if (html.includes('Not Found') || html.includes('404') || html.length < 5000) {
    return null;
  }
  
  // 标题
  const titleMatch = html.match(/<title>(\d+)\s*[-–]\s*([^<]+)-东方博宜OJ<\/title>/);
  const title = titleMatch ? titleMatch[2].trim() : `题目${problemId}`;
  
  // 难度
  const difficulty = extractDifficulty(html);
  
  // 标签
  const tags = extractTags(html, difficulty);
  
  // 限制
  const timeLimit = (html.match(/时间限制[：:]\s*([^<\s]+)/) || [])[1] || '';
  const memLimit = (html.match(/内存限制[：:]\s*([^<\s]+)/) || [])[1] || '';
  
  // 板块内容
  const sections = extractSections(html);
  
  return { id: problemId, title, difficulty, tags, timeLimit, memLimit, sections };
}

function extractDifficulty(html) {
  const m = html.match(/label-(success|warning|info|danger|primary)[^>]*>\s*([^<]+?)\s*<\/span>/);
  const diffMap = { success: '入门', warning: '基础', info: '普及/提高', danger: '提高', primary: '入门' };
  return (m && diffMap[m[1]]) ? diffMap[m[1]] : '';
}

function extractTags(html, difficulty) {
  const tags = new Set();
  const re = /href="\/problem\/index\?tag=([^"]+)"[^>]*><span class="label label-(?:primary|success|info|warning|danger)[^"]*">([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = m[2].trim();
    if (t !== difficulty && t !== '入门' && t !== '基础' && t !== '提高') tags.add(t);
  }
  return [...tags];
}

function extractSections(html) {
  const sections = {};
  
  const headerRe = /<div class="content-header">\s*<span>([\s\S]*?)<\/span>/g;
  const headerPositions = [];
  let hMatch;
  while ((hMatch = headerRe.exec(html)) !== null) {
    headerPositions.push({
      name: hMatch[1].replace(/<[^>]+>/g, '').trim(),
      endOfHeader: hMatch.index + hMatch[0].length,
    });
  }
  
  for (let i = 0; i < headerPositions.length; i++) {
    const cur = headerPositions[i];
    const nextStart = i + 1 < headerPositions.length
      ? html.indexOf('<div class="content-header">', cur.endOfHeader)
      : html.indexOf('<footer', cur.endOfHeader);
    if (nextStart < 0) continue;
    
    const contentHtml = html.slice(cur.endOfHeader, nextStart);
    const wrapperMatch = contentHtml.match(/<div class="content-wrapper">([\s\S]*?)<\/div>\s*(?:<\/div>)?$/);
    if (!wrapperMatch) continue;
    const content = wrapperMatch[1];
    
    if (cur.name === '样例' || cur.name.startsWith('样例')) {
      const inM = content.match(/<div class="input">\s*<h4>[^<]*<\/h4>\s*<pre>([\s\S]*?)<\/pre>/);
      const outM = content.match(/<div class="output">\s*<h4>[^<]*<\/h4>\s*<pre>([\s\S]*?)<\/pre>/);
      if (inM) sections['样例输入'] = decodeEntities(inM[1].trim());
      if (outM) sections['样例输出'] = decodeEntities(outM[1].trim());
      continue;
    }
    
    const cleaned = cleanHtml(content);
    if (cleaned.trim()) sections[cur.name] = cleaned.trim();
  }
  
  return sections;
}

function cleanHtml(html) {
  // KaTeX - 先处理有 annotation 的（复杂公式）
  html = html.replace(/<span class="katex[^"]*"[^>]*>[\s\S]*?annotation encoding="application\/x-tex">([^<]+)<\/annotation>[\s\S]*?<\/span>/g, '$$$1$$');
  // 再处理简单内联公式（只有数字或简单变量的 span）
  html = html.replace(/<span class="katex math inline">([^<]+)<\/span>/g, '$$$1$$');
  // 清理剩余 katex 标签
  html = html.replace(/<span class="katex[^"]*">[\s\S]*?<\/span>/g, '');
  // 标签转换
  html = html.replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**');
  html = html.replace(/<b>([\s\S]*?)<\/b>/g, '**$1**');
  html = html.replace(/<em>([\s\S]*?)<\/em>/g, '*$1*');
  html = html.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`');
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<\/p>\s*<p>/gi, '\n\n');
  html = html.replace(/<p>([\s\S]*?)<\/p>/g, '$1\n\n');
  html = html.replace(/<li>([\s\S]*?)<\/li>/g, '- $1\n');
  html = html.replace(/<\/?[ou]l[^>]*>/gi, '\n');
  html = html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/g, (_, code) => `\n\`\`\`\n${decodeEntities(code.trim())}\n\`\`\`\n`);
  html = html.replace(/<[^>]+>/g, '');
  html = decodeEntities(html);
  html = html.replace(/\n{3,}/g, '\n\n');
  return html.trim();
}

function decodeEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ============================================================
// 从本地 md 文件中提取代码
// ============================================================

function findLocalCode(problemId) {
  if (NO_CODES) return null;
  
  // 在用户桌面课程文件夹中搜索包含该题号的 md 文件
  const searchDir = '/Users/kongc/Desktop/课程体系/C++';
  if (!fs.existsSync(searchDir)) return null;
  
  try {
    // 在所有 md 文件中搜索题号
    const allMdFiles = execSync(`grep -rl "${problemId}" "${searchDir}" --include="*.md" 2>/dev/null || true`, {
      encoding: 'utf-8', timeout: 5000
    }).trim().split('\n').filter(Boolean);
    
    for (const file of allMdFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      // 提取该文件中所有代码块（仅 c/cpp/c++）
      const codeBlockRe = /```(?:c|cpp|c\+\+)\n([\s\S]*?)```/g;
      let match;
      
      // 找与该题号最近的 C/C++ 代码块
      const lines = content.split('\n');
      let bestCode = null;
      let bestDistance = Infinity;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(problemId)) {
          // 找附近最近的 C/C++ 代码块
          for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
            if (lines[j].startsWith('```c') || lines[j].startsWith('```cpp')) {
              const codeStart = j + 1;
              let codeEnd = codeStart;
              for (let k = codeStart; k < lines.length; k++) {
                if (lines[k].startsWith('```')) { codeEnd = k; break; }
              }
              const code = lines.slice(codeStart, codeEnd).join('\n').trim();
              const distance = j - i;
              // 验证是有效的 C++ 代码（不是截图路径或文字）
              const hasCppFeature = code.includes('#include') || code.includes('int main') 
                || code.includes('using namespace') || code.includes('scanf') || code.includes('printf');
              if (code.length > 20 && hasCppFeature && distance < bestDistance) {
                bestCode = code;
                bestDistance = distance;
              }
              break; // 只取最近的代码块
            }
          }
          // 也检查题号上方的代码块
          for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
            if (lines[j].trim() === '```') {
              // j 是代码块结尾，往回找开始
              let codeEnd = j;
              let codeStart = j - 1;
              for (let k = codeStart; k >= 0; k--) {
                if (lines[k].startsWith('```c') || lines[k].startsWith('```cpp')) {
                  codeStart = k + 1;
                  break;
                }
              }
              const code = lines.slice(codeStart, codeEnd).join('\n').trim();
              const hasCppFeature = code.includes('#include') || code.includes('int main')
                || code.includes('using namespace') || code.includes('scanf') || code.includes('printf');
              if (code.length > 20 && hasCppFeature) {
                bestCode = code;
                break;
              }
              break; // 只取最近的一个
            }
          }
        }
      }
      
      if (bestCode) return bestCode;
    }
  } catch (e) {
    // 静默忽略搜索错误
  }
  return null;
}

// ============================================================
// 生成 Markdown
// ============================================================

function generateMarkdown(problem, code) {
  const lines = [];
  
  lines.push('---');
  lines.push(`title: "${problem.title.replace(/"/g, '\\"')}"`);
  if (problem.tags.length > 0) {
    lines.push(`tags: [${problem.tags.map(t => JSON.stringify(t)).join(', ')}]`);
  }
  if (problem.difficulty) lines.push(`difficulty: ${problem.difficulty}`);
  lines.push(`source: dfboy`);
  lines.push(`problem_id: ${problem.id}`);
  lines.push('---');
  lines.push('');
  
  lines.push(`# ${problem.id} - ${problem.title}`);
  lines.push('');
  
  if (problem.timeLimit || problem.memLimit) {
    const limits = [];
    if (problem.timeLimit) limits.push(`时间限制：${problem.timeLimit}`);
    if (problem.memLimit) limits.push(`内存限制：${problem.memLimit}`);
    lines.push(`> ${limits.join(' | ')}`);
    lines.push('');
  }
  
  const order = ['题目描述', '输入', '输入格式', '输出', '输出格式', '说明', '提示'];
  for (const name of order) {
    if (problem.sections[name]) {
      lines.push(`## ${name}`);
      lines.push('');
      lines.push(problem.sections[name]);
      lines.push('');
    }
  }
  for (const [name, content] of Object.entries(problem.sections)) {
    if (!order.includes(name) && name !== '样例输入' && name !== '样例输出') {
      lines.push(`## ${name}`);
      lines.push('');
      lines.push(content);
      lines.push('');
    }
  }
  
  if (problem.sections['样例输入'] || problem.sections['样例输出']) {
    lines.push('## 样例');
    lines.push('');
    if (problem.sections['样例输入']) {
      lines.push('**输入**');
      lines.push('```');
      lines.push(problem.sections['样例输入']);
      lines.push('```');
      lines.push('');
    }
    if (problem.sections['样例输出']) {
      lines.push('**输出**');
      lines.push('```');
      lines.push(problem.sections['样例输出']);
      lines.push('```');
      lines.push('');
    }
  }
  
  if (code) {
    lines.push('## 解题思路');
    lines.push('');
    lines.push('## AC代码');
    lines.push('');
    lines.push('```cpp');
    lines.push(code);
    lines.push('```');
    lines.push('');
  }
  
  return lines.join('\n');
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('🚀 东方博宜OJ题解爬虫');
  console.log(`📁 输出: ${OUTPUT_DIR}`);
  console.log(`👤 用户: ${USERNAME}`);
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // 1. 登录
  if (!(await login())) process.exit(1);
  
  // 2. 获取AC题号
  const problemIds = await fetchACProblemIds();
  if (problemIds.length === 0) {
    console.log('⚠️ 未找到AC题目');
    process.exit(0);
  }
  
  // 3. 爬取题目描述
  console.log('\n📥 开始爬取题目描述...');
  let success = 0, failed = 0, skipped = 0;
  const errors = [];
  
  for (let i = 0; i < problemIds.length; i++) {
    const pid = problemIds[i];
    const outFile = path.join(OUTPUT_DIR, `${pid}.md`);
    
    if (fs.existsSync(outFile) && !FORCE) {
      skipped++;
      continue;
    }
    
    try {
      process.stdout.write(`  [${i + 1}/${problemIds.length}] ${pid} ... `);
      
      const problem = await fetchProblem(pid);
      if (!problem) {
        console.log('⚠️ 不存在');
        failed++;
        continue;
      }
      
      // 尝试从本地匹配代码
      const localCode = findLocalCode(pid);
      
      const md = generateMarkdown(problem, localCode);
      fs.writeFileSync(outFile, md, 'utf-8');
      
      const sectionCount = Object.keys(problem.sections).length;
      console.log(`✅ "${problem.title}" (${sectionCount} sections${localCode ? ', 本地代码' : ', 待补充代码'})`);
      success++;
      
      await sleep(200);
    } catch (e) {
      console.log(`❌ ${e.message}`);
      failed++;
      errors.push({ id: pid, reason: e.message });
    }
    
    // 每50题打印进度
    if ((i + 1) % 50 === 0) {
      console.log(`  --- 进度: ${i + 1}/${problemIds.length} (成功${success}, 跳过${skipped}, 失败${failed}) ---`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 完成！成功: ${success}, 跳过: ${skipped}, 失败: ${failed}`);
  if (errors.length > 0) {
    console.log('失败题目:', errors.map(e => e.id).join(', '));
  }
  
  // 4. 重建索引
  console.log('\n🔨 重建索引...');
  try {
    execSync('node build.js', { cwd: __dirname, stdio: 'inherit' });
  } catch (e) {
    console.log('⚠️ 请手动运行: node build.js');
  }
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
