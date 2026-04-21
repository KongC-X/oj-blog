#!/usr/bin/env node
/**
 * dfboy_difficulty_fix.js — 从东方博宜题目列表页批量获取难度，修正 md 文件中的 difficulty 字段
 * 
 * 用法: node dfboy_difficulty_fix.js
 * 
 * 东方博宜题目列表页每页 100 题，通过解析 HTML 提取题号和难度
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DFBOY_DIR = path.join(__dirname, 'solutions', 'dfboy');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { reject(new Error('Invalid URL: ' + url)); return; }
    
    const req = https.get({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }, res => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let newUrl = res.headers.location;
        if (newUrl.startsWith('/')) {
          newUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${newUrl}`;
        }
        httpGet(newUrl).then(resolve).catch(reject);
        return;
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 从 HTML 行中提取题号和难度
function extractDifficultiesFromPage(html) {
  const result = {};
  // 统一行结尾
  const normalized = html.replace(/\r\n/g, '\n');
  
  // 用更简单的方式：按 <tr 分割
  const rows = normalized.split(/<tr data-key="(\d+)">/);
  // rows[0] 是开头的垃圾，之后每3个一组：题号, 内容, 下一个tr前的内容
  
  for (let i = 1; i < rows.length - 1; i += 3) {
    const problemId = rows[i];
    const content = rows[i + 1] + rows[i + 2]; // tr 内的所有内容
    
    // 找难度：在 problem-list-tags 之后的 label
    // 难度在独立的 td 中，不在 <a> 标签里
    // 模式: </span></td><td><span class='label label-xxx'>难度</span>
    const diffMatch = content.match(/<\/span><\/td><td><span class='label label-[^']*'>([^<]+)<\/span>/);
    if (diffMatch) {
      const diff = diffMatch[1].trim();
      if (diff === '入门' || diff === '基础' || diff === '提高') {
        result[problemId] = diff;
      }
    }
  }
  
  return result;
}

function updateDifficultyField(filePath, difficulty) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (frontMatterMatch) {
    const fm = frontMatterMatch[1];
    if (fm.includes('difficulty:')) {
      content = content.replace(/difficulty:\s*.+\n/, `difficulty: ${difficulty}\n`);
    } else {
      const lastFieldEnd = fm.lastIndexOf('\n');
      const insertPos = frontMatterMatch.index + 4 + lastFieldEnd + 1;
      content = content.slice(0, insertPos) + `difficulty: ${difficulty}\n` + content.slice(insertPos);
    }
  } else {
    content = `---\ndifficulty: ${difficulty}\n---\n\n` + content;
  }
  
  fs.writeFileSync(filePath, content, 'utf-8');
}

async function main() {
  console.log('🔍 从东方博宜获取题目难度...');
  
  const allDifficulties = {};
  const totalPages = 10; // 每页 100 题，最多 1000 题

  for (let page = 1; page <= totalPages; page++) {
    process.stdout.write(`  📄 第 ${page} 页... `);
    
    try {
      const res = await httpGet(`https://oj.czos.cn/problem/index?page=${page}&per-page=100`);
      
      if (res.status !== 200) {
        console.log(`❌ HTTP ${res.status}`);
        break;
      }

      const pageData = extractDifficultiesFromPage(res.body);
      const count = Object.keys(pageData).length;
      Object.assign(allDifficulties, pageData);
      console.log(`✅ ${count} 题`);
      
      // 如果这页没有数据，说明已经到底了
      if (count === 0) break;
      
      await sleep(500);
    } catch (e) {
      console.log(`❌ ${e.message}`);
      break;
    }
  }

  console.log(`\n📊 共获取 ${Object.keys(allDifficulties).length} 道题的难度`);
  
  // 统计难度分布
  const diffCount = {};
  for (const d of Object.values(allDifficulties)) {
    diffCount[d] = (diffCount[d] || 0) + 1;
  }
  console.log('难度分布:');
  for (const [d, c] of Object.entries(diffCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d}: ${c}`);
  }

  // 更新 md 文件
  console.log('\n📝 更新 md 文件中的 difficulty 字段...');
  let updated = 0, notFound = 0, unchanged = 0;

  const files = fs.readdirSync(DFBOY_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const problemId = file.replace(/\.md$/, '');
    if (allDifficulties[problemId]) {
      const newDiff = allDifficulties[problemId];
      const filePath = path.join(DFBOY_DIR, file);
      
      // 读取当前 difficulty
      const content = fs.readFileSync(filePath, 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      const curDiff = fmMatch ? (fmMatch[1].match(/difficulty:\s*(.+)/) || [])[1] || '' : '';
      
      if (curDiff === newDiff) {
        unchanged++;
        continue;
      }
      
      updateDifficultyField(filePath, newDiff);
      updated++;
      if (updated <= 5 || updated % 100 === 0) {
        console.log(`  ✅ ${problemId}: ${curDiff || '(空)'} → ${newDiff}`);
      }
    } else {
      notFound++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 更新了 ${updated} 个文件的难度`);
  console.log(`⏭️  ${unchanged} 个文件无需更新`);
  console.log(`⚠️  ${notFound} 道题在列表中未找到`);
  console.log(`\n下一步: node build.js 重建索引`);
}

main().catch(console.error);
