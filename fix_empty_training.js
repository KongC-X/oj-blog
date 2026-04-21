/**
 * 修复东方博宜题解 md 文件中空的 training 字段
 * 将 "training: " 或 "training: \n" 这样的空值行直接删除
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'solutions/dfboy');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

let fixed = 0;
let skipped = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // 匹配 training: 后面是空白（空格、tab、空行）
  if (/^training:\s*$/m.test(content)) {
    const newContent = content.replace(/^training:\s*\n/m, '');
    fs.writeFileSync(filePath, newContent, 'utf8');
    fixed++;
  } else {
    skipped++;
  }
}

console.log(`修复完成：${fixed} 个文件删除了空 training 字段，${skipped} 个文件无需修改`);
