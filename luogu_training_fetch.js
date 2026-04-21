#!/usr/bin/env node
/**
 * luogu_training_fetch.js — 获取洛谷官方题单中所有题目的题号，并写入对应 md 文件的 training 字段
 * 
 * 用法: LUOGU_COOKIE="cookie" node luogu_training_fetch.js
 * 
 * 洛谷官方题单编号：
 *   入门1-5: 100-108
 *   普及1-4: 201-204
 *   提高1-4: 301-304
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LUOGU_DIR = path.join(__dirname, 'solutions', 'luogu');

// 洛谷官方题单映射
const TRAINING_LIST = [
  { id: 100, name: '入门1-顺序结构' },
  { id: 101, name: '入门2-分支结构' },
  { id: 102, name: '入门3-循环结构' },
  { id: 103, name: '入门4-数组' },
  { id: 104, name: '入门5-字符串' },
  { id: 105, name: '入门6-函数与结构体' },
  { id: 106, name: '入门7-暴力枚举' },
  { id: 107, name: '入门8-模拟' },
  { id: 108, name: '入门9-高精度' },
  { id: 201, name: '普及1-排序' },
  { id: 202, name: '普及2-贪心' },
  { id: 203, name: '普及3-二分查找与分治' },
  { id: 204, name: '普及4-搜索' },
  { id: 301, name: '提高1-动态规划' },
  { id: 302, name: '提高2-图论' },
  { id: 303, name: '提高3-数据结构进阶' },
  { id: 304, name: '提高4-数学' },
];

let sessionCookie = '';

function resolveUrl(base, relative) {
  if (relative.startsWith('http')) return relative;
  const baseObj = new URL(base);
  return new URL(relative, baseObj.origin).href;
}

function extractC3VK(body) {
  const match = body.match(/C3VK=([^;"\s]+)/);
  if (match) {
    sessionCookie += '; C3VK=' + match[1];
    console.log('  🔑 提取反爬虫 Cookie: C3VK=' + match[1]);
    return true;
  }
  return false;
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

function doFetch(url, extraHeaders, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 15) { resolve({ status: 0, body: '' }); return; }
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': extraHeaders?.['x-lentille-request'] ? 'application/json' : (extraHeaders?.Accept || 'application/json'),
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.luogu.com.cn/',
      'Cookie': sessionCookie,
    };
    if (extraHeaders) Object.assign(headers, extraHeaders);

    const req = https.get(url, { headers }, (res) => {
      updateCookies(res.headers['set-cookie'] || []);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = resolveUrl(url, res.headers.location);
        doFetch(newUrl, extraHeaders, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (body.includes('C3VK=') && extractC3VK(body)) {
          doFetch(url, extraHeaders, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 在 md 文件中更新 training 字段
function updateTrainingField(filePath, training) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (frontMatterMatch) {
    const fm = frontMatterMatch[1];
    // 检查是否已有 training 字段
    if (fm.includes('training:')) {
      // 替换已有 training
      content = content.replace(/training:\s*.+\n/, `training: ${training}\n`);
    } else {
      // 在 front matter 中添加 training（在最后一个字段后面）
      const lastFieldEnd = fm.lastIndexOf('\n');
      const insertPos = frontMatterMatch.index + 4 + lastFieldEnd + 1;
      content = content.slice(0, insertPos) + `training: ${training}\n` + content.slice(insertPos);
    }
  } else {
    // 没有 front matter，创建一个
    content = `---\ntraining: ${training}\n---\n\n` + content;
  }
  
  fs.writeFileSync(filePath, content, 'utf-8');
}

// 从题单数据中提取所有题目 PID
function extractProblemIds(trainingData) {
  const pids = [];
  
  // 题单结构可能是 trainingData.problems 或其他
  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) traverse(item);
      return;
    }
    // 查找包含 pid 字段的对象
    if (obj.pid && typeof obj.pid === 'string' && obj.pid.match(/^P\d+$/)) {
      pids.push(obj.pid);
    }
    // 查找包含 problem 字段的对象
    if (obj.problem && obj.problem.pid) {
      pids.push(obj.problem.pid);
    }
    // 递归搜索其他可能的嵌套结构
    for (const key of Object.keys(obj)) {
      if (key === 'pids' && Array.isArray(obj[key])) {
        for (const p of obj[key]) {
          if (typeof p === 'string' && p.match(/^P\d+$/)) pids.push(p);
        }
      }
      if (typeof obj[key] === 'object') {
        traverse(obj[key]);
      }
    }
  }
  
  traverse(trainingData);
  return [...new Set(pids)]; // 去重
}

async function main() {
  sessionCookie = process.env.LUOGU_COOKIE || '';
  if (!sessionCookie) {
    console.error('❌ 请提供洛谷 Cookie：LUOGU_COOKIE="cookie" node luogu_training_fetch.js');
    process.exit(1);
  }
  
  console.log('Cookie length:', sessionCookie.length, 'chars');

  // 初始化 session
  console.log('🌐 初始化会话...');
  const homeRes = await doFetch('https://www.luogu.com.cn/', { Accept: 'text/html' });
  console.log('  首页访问:', homeRes.status === 200 ? '✅' : '⚠️ ' + homeRes.status);
  await sleep(500);

  // 获取所有题单的题目映射
  const trainingMap = {}; // pid -> training name
  let totalProblems = 0;
  let emptyTrainings = 0;

  for (const training of TRAINING_LIST) {
    process.stdout.write(`📋 获取题单 ${training.id} (${training.name})... `);
    
    try {
      const res = await doFetch(`https://www.luogu.com.cn/training/${training.id}?_contentOnly=1`, {
        'x-lentille-request': 'content-only',
      });
      await sleep(400);

      if (res.status !== 200) {
        console.log(`❌ HTTP ${res.status}`);
        emptyTrainings++;
        continue;
      }

      if (!res.body.trim().startsWith('{')) {
        console.log(`❌ 返回非 JSON (${res.body.substring(0, 50)}...)`);
        emptyTrainings++;
        continue;
      }

      const data = JSON.parse(res.body);
      const pids = extractProblemIds(data);
      
      if (pids.length === 0) {
        // 可能数据结构不同，打印原始 key 帮助调试
        const keys = Object.keys(data);
        if (data.data) {
          const dataKeys = Object.keys(data.data);
          console.log(`⚠️ 未找到题目 (data keys: ${dataKeys.join(', ')})`);
        } else {
          console.log(`⚠️ 未找到题目 (top keys: ${keys.join(', ')})`);
        }
        emptyTrainings++;
        continue;
      }

      for (const pid of pids) {
        trainingMap[pid] = training.name;
      }
      
      console.log(`✅ ${pids.length} 题`);
      totalProblems += pids.length;
    } catch (e) {
      console.log(`❌ ${e.message}`);
      emptyTrainings++;
    }
  }

  console.log(`\n📊 共获取 ${totalProblems} 道题的题单映射，覆盖 ${Object.keys(trainingMap).length} 道不同题目`);
  console.log(`⚠️  ${emptyTrainings} 个题单获取失败或为空`);

  // 将 training 写入已有的 md 文件
  console.log('\n📝 更新 md 文件中的 training 字段...');
  let updated = 0, notInTraining = 0;

  const files = fs.readdirSync(LUOGU_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const pid = file.replace(/\.md$/, ''); // 如 P1001
    if (trainingMap[pid]) {
      const filePath = path.join(LUOGU_DIR, file);
      updateTrainingField(filePath, trainingMap[pid]);
      updated++;
      if (updated <= 5 || updated % 50 === 0) {
        console.log(`  ✅ ${pid} → ${trainingMap[pid]}`);
      }
    } else {
      notInTraining++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 更新了 ${updated} 个文件的 training 字段`);
  console.log(`📋 ${notInTraining} 道题不在官方题单中`);
  console.log(`\n下一步: node build.js 重建索引`);
}

main().catch(console.error);
