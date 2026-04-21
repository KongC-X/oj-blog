/**
 * 东方博宜题单分类写入脚本
 * 读取 /Users/kongc/Desktop/东方博宜题单分类.md
 * 将题单名写入 solutions/dfboy/{num}.md 的 front matter training 字段
 * 最后重建索引
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CLASSIFY_FILE = '/Users/kongc/Desktop/东方博宜题单分类.md';
const DFBOY_DIR = path.join(__dirname, 'solutions/dfboy');

// ===== 1. 解析分类文件 =====
const content = fs.readFileSync(CLASSIFY_FILE, 'utf-8');
const lines = content.split('\n');

const trainingMap = {}; // numId -> trainingName
let currentTraining = '';

for (const line of lines) {
  const trimmed = line.trim();
  // ### 题单名
  const titleMatch = trimmed.match(/^###\s+(.+)/);
  if (titleMatch) {
    currentTraining = titleMatch[1].trim();
    continue;
  }
  // 逗号分隔的题号行
  if (currentTraining && trimmed && /^\d/.test(trimmed)) {
    const nums = trimmed.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
    for (const num of nums) {
      // 同一题出现在多个题单时，以先出现的为准
      if (!trainingMap[num]) {
        trainingMap[num] = currentTraining;
      }
    }
  }
}

console.log(`📋 共解析 ${Object.keys(trainingMap).length} 个题号 → 题单映射`);

// ===== 2. 写入 md 文件 =====
const files = fs.readdirSync(DFBOY_DIR).filter(f => f.endsWith('.md'));
let written = 0, skipped = 0, unchanged = 0;

for (const file of files) {
  const numId = path.basename(file, '.md');
  const training = trainingMap[numId];
  const filePath = path.join(DFBOY_DIR, file);
  let text = fs.readFileSync(filePath, 'utf-8');

  const hasFrontMatter = text.startsWith('---');

  if (training) {
    if (hasFrontMatter) {
      // 检查是否已有 training 字段
      const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        if (fm.includes('training:')) {
          // 更新已有值
          const newFm = fm.replace(/training:\s*.+/, `training: ${training}`);
          if (newFm === fm) { unchanged++; continue; }
          text = text.replace(/^---\n([\s\S]*?)\n---/, `---\n${newFm}\n---`);
        } else {
          // 插入 training 字段到 front matter 首行
          text = text.replace(/^---\n/, `---\ntraining: ${training}\n`);
        }
      }
    } else {
      // 无 front matter，添加
      text = `---\ntraining: ${training}\n---\n\n${text}`;
    }
    fs.writeFileSync(filePath, text, 'utf-8');
    written++;
  } else {
    // 没有题单，确保不留错误的 training 字段（不删除已有的，只跳过）
    skipped++;
  }
}

console.log(`✅ 写入: ${written} 个文件`);
console.log(`⏭  未分类: ${skipped} 个文件`);
console.log(`🔄 已是最新: ${unchanged} 个文件`);

// ===== 3. 重建索引 =====
console.log('\n🔨 重建索引...');
execSync('node build.js', { cwd: __dirname, stdio: 'inherit' });
console.log('✅ 完成');
