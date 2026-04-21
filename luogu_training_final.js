#!/usr/bin/env node
/**
 * luogu_training_final.js — 最终版：用 C3VK cookie jar 模式获取洛谷题单
 * 核心修复：第一次请求会被302并给新C3VK，需要带新C3VK重试
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const LUOGU_DIR = path.join(__dirname, 'solutions', 'luogu');
const BASE_COOKIE = process.env.LUOGU_COOKIE || '';
let c3vk = '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function doFetch(url) {
  return new Promise(resolve => {
    const fullCookie = BASE_COOKIE + (c3vk ? '; C3VK=' + c3vk : '');
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.luogu.com.cn/',
        'Cookie': fullCookie,
      }
    }, res => {
      // 检查 set-cookie 中的 C3VK
      const sc = res.headers['set-cookie'];
      if (sc) {
        for (const c of sc) {
          const m = c.match(/C3VK=([^;]+)/);
          if (m) c3vk = m[1];
        }
      }
      // 不跟重定向，让调用者处理
      if (res.statusCode === 302) {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: 302, location: res.headers.location, body }));
        return;
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
}

function findPids(obj, set = new Set()) {
  if (!obj || typeof obj !== 'object') return set;
  if (Array.isArray(obj)) { obj.forEach(x => findPids(x, set)); return set; }
  if (obj.pid && typeof obj.pid === 'string' && /^P\d+$/.test(obj.pid)) set.add(obj.pid);
  if (obj.problem && obj.problem.pid && /^P\d+$/.test(obj.problem.pid)) set.add(obj.problem.pid);
  Object.values(obj).forEach(v => { if (typeof v === 'object') findPids(v, set); });
  return set;
}

function updateMd(filePath, training) {
  let c = fs.readFileSync(filePath, 'utf-8');
  if (c.includes('training:')) {
    c = c.replace(/training:\s*.+\n/, `training: ${training}\n`);
  } else if (c.startsWith('---\n')) {
    c = c.replace('---\n', `---\ntraining: ${training}\n`);
  } else {
    c = `---\ntraining: ${training}\n---\n\n` + c;
  }
  fs.writeFileSync(filePath, c, 'utf-8');
}

async function fetchTraining(id) {
  const url = `https://www.luogu.com.cn/training/${id}?_contentOnly=1`;
  // 第一次请求可能返回302 + 新C3VK
  const r1 = await doFetch(url);
  if (r1.status === 200 && r1.body.trim().startsWith('{')) {
    return r1.body;
  }
  // 如果是302，用新的C3VK重试
  await sleep(500);
  const r2 = await doFetch(url);
  if (r2.status === 200 && r2.body.trim().startsWith('{')) {
    return r2.body;
  }
  // 再等一下重试
  await sleep(2000);
  const r3 = await doFetch(url);
  if (r3.status === 200 && r3.body.trim().startsWith('{')) {
    return r3.body;
  }
  return null;
}

async function main() {
  const list = [
    { id: 201, name: '普及1-排序' }, { id: 202, name: '普及2-贪心' },
    { id: 203, name: '普及3-二分查找与分治' }, { id: 204, name: '普及4-搜索' },
    { id: 301, name: '提高1-动态规划' }, { id: 302, name: '提高2-图论' },
    { id: 303, name: '提高3-数据结构进阶' }, { id: 304, name: '提高4-数学' },
  ];

  const map = {};
  let total = 0;

  for (const t of list) {
    process.stdout.write(`${t.name}... `);
    const body = await fetchTraining(t.id);
    if (body) {
      try {
        const data = JSON.parse(body);
        const pids = findPids(data);
        if (pids.size > 0) {
          pids.forEach(p => map[p] = t.name);
          console.log(`OK ${pids.size}题`);
          total += pids.size;
        } else {
          console.log('0题');
        }
      } catch (e) {
        console.log(`JSON解析失败: ${e.message}`);
      }
    } else {
      console.log('FAIL');
    }
    await sleep(1500);
  }

  console.log(`\n共获取 ${total} 道题的题单映射`);

  // 更新md文件
  console.log('更新md文件...');
  let updated = 0;
  for (const f of fs.readdirSync(LUOGU_DIR).filter(x => x.endsWith('.md'))) {
    const pid = f.replace('.md', '');
    if (!map[pid]) continue;
    updateMd(path.join(LUOGU_DIR, f), map[pid]);
    updated++;
    console.log(`  ${pid} -> ${map[pid]}`);
  }
  console.log(`\n更新了 ${updated} 个文件`);

  // 重建索引
  console.log('\n重建索引...');
  require('./build.js');
}

main().catch(console.error);
