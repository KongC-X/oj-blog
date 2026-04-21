#!/usr/bin/env node
/**
 * apply_training_map.js — 从题单分类 md 读取映射，写入洛谷 md 文件的 training 字段
 * 用法: node apply_training_map.js <题单分类md文件路径>
 */
const fs = require('fs');
const path = require('path');

const MAPPING_FILE = process.argv[2];
const LUOGU_DIR = path.join(__dirname, 'solutions', 'luogu');

if (!MAPPING_FILE) { console.error('用法: node apply_training_map.js <题单分类md路径>'); process.exit(1); }

// 解析映射
const content = fs.readFileSync(MAPPING_FILE, 'utf-8');
const lines = content.split('\n');
const map = {};
let current = '';
for (const line of lines) {
  if (line.startsWith('# ')) { current = line.replace(/^# /, '').trim(); continue; }
  if (!line.trim()) continue;
  const m = line.match(/^(P\d+|B\d+)\s/);
  if (m && current) map[m[1]] = current;
}

console.log(`解析到 ${Object.keys(map).length} 个题号映射，${new Set(Object.values(map)).size} 个题单`);
new Set(Object.values(map)).forEach(t => {
  const cnt = Object.values(map).filter(v => v === t).length;
  console.log(`  ${t}: ${cnt} 题`);
});

// 写入 md 文件
let updated = 0, skipped = 0, notFound = 0;
const files = fs.readdirSync(LUOGU_DIR).filter(f => f.endsWith('.md'));

for (const file of files) {
  const pid = file.replace(/\.md$/, '');
  if (!map[pid]) { notFound++; continue; }

  const filePath = path.join(LUOGU_DIR, file);
  let c = fs.readFileSync(filePath, 'utf-8');

  if (c.includes('training:')) {
    if (c.includes('training: ' + map[pid])) { skipped++; continue; }
    c = c.replace(/training:\s*.+\n/, 'training: ' + map[pid] + '\n');
  } else if (c.startsWith('---\n')) {
    c = c.replace('---\n', '---\ntraining: ' + map[pid] + '\n');
  } else {
    c = '---\ntraining: ' + map[pid] + '\n---\n\n' + c;
  }

  fs.writeFileSync(filePath, c, 'utf-8');
  updated++;
}

console.log(`\n结果:`);
console.log(`  更新: ${updated} 个文件`);
console.log(`  跳过(已存在): ${skipped} 个`);
console.log(`  未在分类中: ${notFound} 个`);

// 重建索引
console.log('\n重建索引...');
require('./build.js');
