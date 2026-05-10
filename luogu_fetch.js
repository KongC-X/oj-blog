#!/usr/bin/env node
/**
 * luogu_fetch.js v2 — 从洛谷获取用户 AC 题目及其代码、标签、题目描述
 * 
 * 用法: node luogu_fetch.js <cookie> [--force]
 *  --force  强制重新生成所有 md 文件（默认跳过已存在的）
 * 
 * Cookie 获取方式:
 * 1. 浏览器登录洛谷
 * 2. F12 → Network → 刷新 → 任意请求的 Request Headers → Cookie
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const UID = '1370195';
const OUTPUT_DIR = path.join(__dirname, 'solutions', 'luogu');
const FORCE = process.argv.includes('--force');

// 难度映射
const DIFF_MAP = {
  0: '暂无评定',
  1: '入门',
  2: '普及-',
  3: '普及/提高-',
  4: '普及+/提高',
  5: '提高+/省选-',
  6: '省选/NOI-',
  7: 'NOI/NOI+/CTSC'
};

// 洛谷算法标签 ID → 名称映射（社区公开数据）
const TAG_MAP = {
  1: '模拟',
  2: '贪心',
  3: '动态规划',
  4: '图论',
  5: '递归',
  6: '搜索',
  7: '二分',
  8: '分治',
  9: '数论',
  10: '数学',
  11: '字符串',
  12: '暴力枚举',
  13: '递推',
  14: '并查集',
  15: '树',
  16: '线段树',
  17: '树状数组',
  18: '单调队列',
  19: '高精度',
  20: '排序',
  21: 'STL',
  22: '双指针',
  23: '单调栈',
  24: '背包',
  25: 'BFS',
  26: 'DFS',
  27: '记忆化搜索',
  28: '最短路',
  29: '最小生成树',
  30: '拓扑排序',
  31: '强连通分量',
  32: '二分图',
  33: '网络流',
  34: '欧拉回路',
  35: '博弈论',
  36: '快速幂',
  37: '矩阵乘法',
  38: '位运算',
  39: 'RMQ',
  40: '差分',
  41: '前缀和',
  42: '哈希',
  43: '字典树',
  44: '后缀自动机',
  45: '后缀数组',
  46: '区间DP',
  47: '树形DP',
  48: '状压DP',
  49: '数位DP',
  50: '概率DP',
  51: '期望DP',
  52: '树链剖分',
  53: 'LCA',
  54: '最小环',
  55: '判负环',
  56: '2-SAT',
  57: '中国剩余定理',
  58: '快速傅里叶变换',
  59: '回文串',
  60: '最小割',
  61: '费用流',
  62: '匈牙利算法',
  63: 'KMP',
  64: 'AC自动机',
  65: 'Manacher',
  66: '扩展欧几里得',
  67: '欧拉函数',
  68: '素数筛',
  69: '悬线法',
  70: '笛卡尔树',
  71: '虚树',
  72: '可并堆',
  73: '左偏树',
  74: '平衡树',
  75: '动态树',
  76: 'KD-Tree',
  77: '计算几何',
  78: '三分',
  79: '自适应辛普森积分',
  80: '高斯消元',
  81: '随机化',
  82: '字符串模拟',
  83: '构造',
  84: '交互题',
  85: '签到',
  86: '暴力',
  87: '树套树',
  88: '主席树',
  89: '可持久化线段树',
  90: '可持久化Trie',
  91: 'CDQ分治',
  92: '整体二分',
  93: '莫队',
  94: 'bitset优化',
  95: '分块',
  96: '根号算法',
  97: '约数',
  98: '组合数学',
  99: '容斥原理',
  100: 'Lucas定理',
  101: '卡特兰数',
  102: '递推数列',
  103: '斐波那契数列',
  104: '素数判定',
  105: '博弈DP',
  106: 'Nim游戏',
  107: 'SG函数',
  108: '入门模拟',
  109: '字符串处理',
  110: '进制转换',
  111: '排序算法',
  112: '栈',
  113: '队列',
  114: '链表',
  115: '枚举',
  116: '循环',
  117: '条件判断',
  118: '数组',
  119: '函数',
  120: '结构体',
  121: '指针',
  122: '文件操作',
  123: '日期问题',
  124: '进制',
  125: '模拟退火',
  126: '搜索剪枝',
  127: '迭代加深',
  128: 'A*搜索',
  129: ' Dancing Links',
  130: '双连通分量',
  131: '点双连通',
  132: '边双连通',
  133: '桥',
  134: '割点',
  135: '重链剖分',
  136: '长链剖分',
  137: '树重心',
  138: '树的直径',
  139: '最近公共祖先',
  140: '树哈希',
  141: '点分治',
  142: '边分治',
  143: '树形背包',
  144: '换根DP',
  145: '期望',
  146: '线性基',
  147: 'Z函数',
  148: '后缀平衡树',
  149: '回文树',
  150: '广义后缀自动机',
  151: 'Lyndon分解',
  152: '最小表示法',
  153: '仙人掌',
  154: ' Prufer序列',
  155: '弦图',
  156: '圆方树',
  157: '支配树',
  158: '拟阵',
  159: '斯坦纳树',
  160: '最小树形图',
  161: '差分约束',
  162: '双端队列BFS',
  163: '反图',
  164: '缩点',
  165: '欧拉序',
  166: 'DFS序',
  167: '括号序',
  168: '子树查询',
  169: '树上差分',
  170: '树上倍增',
  171: '树上二分',
  172: '虚树DP',
  173: ' Prufer序',
  174: '同余方程',
  175: '离散对数',
  176: '二次剩余',
  177: '原根',
  178: 'BSGS',
  179: '多源最短路',
  180: '次短路',
  181: '差分约束系统',
  182: '分层图最短路',
  183: 'Tarjan',
  184: '搜索+DP',
  185: '分治搜索',
};

// 将标签 ID 转为名称列表
function resolveTags(tagIds) {
  return tagIds.map(id => TAG_MAP[id] || `标签${id}`).filter(t => t && !t.startsWith('标签'));
}

let sessionCookie = '';

// 处理重定向 URL：将相对路径转为绝对路径
function resolveUrl(base, relative) {
  if (relative.startsWith('http')) return relative;
  const baseObj = new URL(base);
  return new URL(relative, baseObj.origin).href;
}

// 处理洛谷反爬虫 JS：从响应体提取 C3VK cookie
function extractC3VK(body) {
  const match = body.match(/C3VK=([^;"\s]+)/);
  if (match) {
    const newC3VK = match[1];
    // 替换已有的 C3VK，而不是追加（避免 cookie 里有多个 C3VK）
    if (sessionCookie.includes('C3VK=')) {
      sessionCookie = sessionCookie.replace(/C3VK=[^;]*/, 'C3VK=' + newC3VK);
    } else {
      sessionCookie += '; C3VK=' + newC3VK;
    }
    console.log('  🔑 提取反爬虫 Cookie: C3VK=' + newC3VK);
    return true;
  }
  return false;
}

// 通用 fetch 函数，支持自定义 headers 和反爬虫处理
function doFetch(url, extraHeaders, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    // 防止无限重定向
    if (redirectCount > 15) {
      resolve({ status: 0, body: '' });
      return;
    }
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': extraHeaders?.['x-lentille-request'] ? 'application/json' : (extraHeaders?.Accept || 'application/json'),
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.luogu.com.cn/',
      'Cookie': sessionCookie,
    };
    if (extraHeaders) Object.assign(headers, extraHeaders);

    const requestModule = url.startsWith('https') ? https : http;
    const req = requestModule.get(url, { headers }, (res) => {
      updateCookies(res.headers['set-cookie'] || []);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = resolveUrl(url, res.headers.location);
        doFetch(newUrl, extraHeaders, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        // 检测洛谷反爬虫 JS 并提取 C3VK cookie
        if (body.includes('C3VK=') && extractC3VK(body)) {
          // 用新 cookie 重新请求
          doFetch(url, extraHeaders, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', (err) => {
      // 连接错误（如被服务器断开），resolve 而不是 reject，让调用方处理重试
      console.log(`     ⚠️ 连接错误: ${err.message}`);
      resolve({ status: 0, body: '', error: err.message });
    });
  });
}

function updateCookies(setCookies) {
  for (const c of setCookies) {
    const name = c.split('=')[0].trim();
    const value = c.match(/=([^;]+)/);
    if (name && value) {
      if (sessionCookie.includes(name + '=')) {
        sessionCookie = sessionCookie.replace(new RegExp(name + '=[^;]*'), name + '=' + value[1]);
      } else {
        sessionCookie += '; ' + name + '=' + value[1];
      }
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Step 1: 获取最近的 AC 提交记录（只翻前几页，避免被限速）
// 洛谷会在约 6-7 页后断开连接，所以只取前 5 页（100 条记录）
// 新 AC 的题一定在前几页
async function fetchRecentACRecords(firstPageBody) {
  let allRecords = [];
  const MAX_PAGES = 3; // 只翻 3 页（60 条记录），新 AC 的题一定在前几页

  // 如果已有第一页数据，直接解析
  if (firstPageBody) {
    try {
      const data = JSON.parse(firstPageBody);
      const records = data?.currentData?.records?.result || [];
      if (records.length > 0) {
        allRecords.push(...records);
        const count = data?.currentData?.records?.count || 0;
        console.log(`  📄 第 1 页...`);
        console.log(`     本页 ${records.length} 条，总 AC 数: ${count}`);
      }
    } catch {
      // 忽略解析错误
    }
  }

  for (let page = 2; page <= MAX_PAGES; page++) {
    console.log(`  📄 第 ${page} 页...`);
    await sleep(1000 + Math.random() * 500);

    let res;
    let retries = 0;
    while (retries < 3) {
      res = await doFetch(
        `https://www.luogu.com.cn/record/list?user=${UID}&page=${page}&status=12&_contentOnly=1`
      );
      console.log('     status=' + res.status + ', bodyLen=' + res.body.length);

      if (res.status === 200 && res.body.length > 100) break;
      retries++;
      if (retries < 3) {
        const waitTime = 5000 * retries;
        console.log(`     ⚠️ 请求失败，${(waitTime / 1000)}s 后重试 (${retries}/3)...`);
        await sleep(waitTime);
      }
    }

    if (res.status !== 200 || res.body.length < 100) {
      console.log(`  ⚠️ 第 ${page} 页获取失败，停止翻页`);
      break;
    }

    try {
      const data = JSON.parse(res.body);
      const records = data?.currentData?.records?.result || [];
      if (records.length === 0) break;
      allRecords.push(...records);
      console.log(`     本页 ${records.length} 条，已获取 ${allRecords.length} 条`);
    } catch {
      break;
    }
  }

  return allRecords;
}

// Step 2: 去重，保留每道题最新的 AC 提交
function deduplicate(records) {
  const map = new Map();
  for (const r of records) {
    const pid = r.problem.pid;
    if (!map.has(pid) || r.submitTime > map.get(pid).submitTime) {
      map.set(pid, r);
    }
  }
  return Array.from(map.values());
}

// Step 3: 获取每道题的 AC 代码（带重试）
async function fetchCode(recordId) {
  for (let retry = 0; retry < 3; retry++) {
    try {
      const res = await doFetch(
        `https://www.luogu.com.cn/record/${recordId}?_contentOnly=1`
      );
      if (res.status === 200 && res.body.length > 10) {
        const data = JSON.parse(res.body);
        const code = data?.currentData?.record?.sourceCode || null;
        if (code) return code;
      }
    } catch {
      // 忽略，继续重试
    }
    if (retry < 2) await sleep(3000 + retry * 3000);
  }
  return null;
}

// Step 4: 获取题目详情（使用 lentille API，含标签和题目描述，带重试）
async function fetchProblemDetail(pid) {
  for (let retry = 0; retry < 3; retry++) {
    try {
      const res = await doFetch(`https://www.luogu.com.cn/problem/${pid}`, {
        'x-lentille-request': 'content-only',
      });
      if (res.status === 200 && res.body.trim().startsWith('{') && res.body.length > 20) {
        const data = JSON.parse(res.body);
        const problem = data?.data?.problem || null;
        if (problem) return problem;
      }
    } catch {
      // 忽略，继续重试
    }
    if (retry < 2) await sleep(3000 + retry * 3000);
  }
  return null;
}

// 简单清理洛谷的 Markdown 内容中的 LaTeX 公式（保持原样，让前端渲染）
function cleanMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 生成 Markdown 文件
function generateMd(record, code, problemDetail) {
  const pid = record.problem.pid;
  const title = record.problem.title || pid;
  const difficulty = DIFF_MAP[record.problem.difficulty] || '';
  const submitDate = new Date(record.submitTime * 1000).toISOString().split('T')[0];
  const lang = record.language === 28 ? 'C++14' : record.language === 1 ? 'C' : `Lang${record.language}`;

  // 解析标签
  let tagIds = [];
  if (problemDetail && problemDetail.tags) {
    tagIds = Array.isArray(problemDetail.tags) ? problemDetail.tags : [];
  }
  const tagNames = resolveTags(tagIds);
  // 去重并取前面最多6个
  const uniqueTags = [...new Set(tagNames)].slice(0, 6);

  let md = `---\ntitle: ${title}\ntags: [${uniqueTags.length > 0 ? uniqueTags.map(t => t).join(', ') : '洛谷'}]\ndifficulty: ${difficulty}\n---\n\n`;
  md += `# ${pid} ${title}\n\n`;
  md += `> **洛谷** | ${difficulty} | ${lang} | 提交时间: ${submitDate}\n\n`;

  // 算法标签
  if (uniqueTags.length > 0) {
    md += `**算法标签**：${uniqueTags.map(t => `\`${t}\``).join('、')}\n\n`;
  }

  // 题目描述（从 lentille API 获取，content 是对象）
  if (problemDetail) {
    const content = problemDetail.content;
    if (content && typeof content === 'object') {
      if (content.background && content.background.trim().length > 10) {
        md += `## 题目背景\n\n${cleanMarkdown(content.background)}\n\n`;
      }
      if (content.description && content.description.trim().length > 10) {
        md += `## 题目描述\n\n${cleanMarkdown(content.description)}\n\n`;
      }
      if (content.formatI && content.formatI.trim().length > 10) {
        md += `## 输入格式\n\n${cleanMarkdown(content.formatI)}\n\n`;
      }
      if (content.formatO && content.formatO.trim().length > 10) {
        md += `## 输出格式\n\n${cleanMarkdown(content.formatO)}\n\n`;
      }
    }
  }

  // 样例
  if (problemDetail && problemDetail.samples && problemDetail.samples.length > 0) {
    md += `## 样例\n\n`;
    problemDetail.samples.forEach((s, i) => {
      const input = Array.isArray(s) ? (s[0] || '') : '';
      const output = Array.isArray(s) ? (s[1] || '') : '';
      md += `**样例输入 #${i + 1}**\n\`\`\`\n${input}\`\`\`\n\n`;
      if (output) {
        md += `**样例输出 #${i + 1}**\n\`\`\`\n${output}\`\`\`\n\n`;
      }
    });
  }

  // AC 代码
  if (code) {
    md += `## AC 代码\n\n\`\`\`cpp\n${code}\n\`\`\`\n`;
  }

  return md;
}

async function main() {
  // Cookie 来源（按优先级）：
  // 1. 环境变量 LUOGU_COOKIE
  // 2. 文件路径作为第一个参数
  // 3. 第一个参数作为 cookie 字符串（可能被 shell 截断 % 编码）
  
  sessionCookie = process.env.LUOGU_COOKIE || '';
  
  if (!sessionCookie) {
    const arg = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0]) || '';
    if (arg && fs.existsSync(arg)) {
      sessionCookie = fs.readFileSync(arg, 'utf-8').trim();
    } else if (arg && arg.length > 50) {
      sessionCookie = arg;
    }
  }
  
  if (!sessionCookie) {
    console.error('❌ Cookie 为空，请通过以下方式提供：');
    console.error('   LUOGU_COOKIE="cookie字符串" node luogu_fetch.js --force');
    console.error('   或将 cookie 写入文件：node luogu_fetch.js cookie.txt --force');
    process.exit(1);
  }
  
  console.log('Cookie length:', sessionCookie.length, 'chars');

  // Step 0: 初始化反爬虫 Cookie（访问洛谷首页）
  console.log('🌐 访问洛谷首页获取反爬虫 Cookie...');
  const homeRes = await doFetch('https://www.luogu.com.cn/', { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' });
  if (homeRes.status === 200) {
    console.log('  ✅ 首页访问成功，Cookie 更新为:', sessionCookie.length, 'chars');
  } else {
    console.log('  ⚠️ 首页访问返回', homeRes.status, '(继续尝试)');
  }

  // Init session — 同时获取第一页数据
  console.log('🔗 初始化会话...');
  const initRes = await doFetch('https://www.luogu.com.cn/record/list?user=' + UID + '&page=1&status=12&_contentOnly=1');
  console.log('会话初始化:', initRes.status === 200 ? '✅ 成功' : '⚠️ 可能需要重新提供 Cookie');

  // Debug: 如果返回的是 HTML 而不是 JSON
  if (initRes.body && !initRes.body.trim().startsWith('{')) {
    console.error('❌ API 返回了 HTML 而不是 JSON！');
    console.error('   这通常意味着 Cookie 中缺少登录凭证（需要完整的浏览器 Cookie）');
    console.error('   请确保从浏览器的 Network 请求中复制完整的 Cookie 字符串');
    console.error('   Body preview:', initRes.body.substring(0, 100));
    process.exit(1);
  }

  if (initRes.status !== 200) {
    console.error('❌ 无法访问洛谷，Cookie 可能已过期');
    process.exit(1);
  }

  // Ensure output dir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Fetch AC records（复用第一页数据，只取最近几页）
  console.log('\n📋 获取最近 AC 提交记录...');
  const allRecords = await fetchRecentACRecords(initRes.body);
  console.log(`\n✅ 共获取 ${allRecords.length} 条提交记录`);

  // Deduplicate
  const unique = deduplicate(allRecords);
  console.log(`📊 去重后 ${unique.length} 道不同的题目`);

  // 筛选出本地不存在的新题（增量更新）
  const newProblems = unique.filter(r => !fs.existsSync(path.join(OUTPUT_DIR, `${r.problem.pid}.md`)));
  const existingCount = unique.length - newProblems.length;
  console.log(`📁 已有 ${existingCount} 题，新题 ${newProblems.length} 题`);

  if (newProblems.length === 0 && !FORCE) {
    console.log('\n✅ 没有新题需要更新！');
    console.log(`\n下一步: 运行 node build.js 重新构建索引`);
    return;
  }

  if (FORCE) {
    console.log(`📦 Force 模式：将更新全部 ${unique.length} 题`);
  }

  // Fetch code + detail for new problems only (unless --force)
  const toProcess = FORCE ? unique : newProblems;
  console.log('\n💾 获取题目详情并生成 md 文件...\n');

  // 翻页后洛谷可能会限速，等待一段时间让限制窗口过去
  if (toProcess.length > 0) {
    console.log('  ⏳ 重新获取反爬虫 Cookie...');
    await sleep(2000);
    const refreshRes = await doFetch('https://www.luogu.com.cn/', { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' });
    console.log('  ✅ Cookie 刷新:', refreshRes.status === 200 ? '成功' : '失败');
    console.log('  ⏳ 等待 5 秒...');
    await sleep(5000);
  }
  let success = 0, failed = 0;
  let tagFoundCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const record = toProcess[i];
    const pid = record.problem.pid;
    const title = record.problem.title || pid;

    process.stdout.write(`  📥 [${i + 1}/${toProcess.length}] ${pid} ${title} ... `);

    try {
      // Fetch code
      const code = await fetchCode(record.id);
      await sleep(2000 + Math.random() * 1000);

      // Fetch problem detail (tags + description)
      let detail = null;
      try {
        detail = await fetchProblemDetail(pid);
        if (detail && detail.tags && detail.tags.length > 0) tagFoundCount++;
        await sleep(2000 + Math.random() * 1000);
      } catch (e) {
        // Problem detail fetch failed, continue without it
      }

      const md = generateMd(record, code, detail);
      // 只有内容足够完整才写入（至少有代码）
      const minLines = code ? true : false;
      const filePath = path.join(OUTPUT_DIR, `${pid}.md`);
      if (minLines) {
        fs.writeFileSync(filePath, md, 'utf-8');
        const tagInfo = detail?.tags ? `(${detail.tags.length}个标签)` : '(无标签)';
        console.log(`✅ ${tagInfo}`);
        success++;
      } else {
        console.log(`⚠️ 无描述无代码，跳过`);
        failed++;
      }
    } catch (e) {
      console.log(`❌ ${e.message}`);
      failed++;
    }

    // Rate limiting
    if ((i + 1) % 10 === 0) {
      await sleep(2000 + Math.random() * 1000);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 完成！新题 ${success} 个，失败 ${failed} 个，已有 ${existingCount} 个`);
  console.log(`🏷️  获取到标签的题目: ${tagFoundCount} 个`);
  console.log(`📁 文件保存在: ${OUTPUT_DIR}`);
  console.log(`\n下一步: 运行 node build.js 重新构建索引`);
}

main().catch(console.error);
