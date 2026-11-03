#!/usr/bin/env node
/**
 * fix_luogu_difficulty.js — 把洛谷题解的 difficulty 迁移到新版 8 级命名
 *
 * 背景：
 *   洛谷已把难度体系从旧版 7 级改为新版 8 级，同一个数值 ID 对应的名称变了：
 *     ID 3：普及/提高-  → 普及
 *     ID 4：普及+/提高  → 普及+/提高-
 *     ID 5：提高+/省选- → 提高
 *     ID 6：省选/NOI-   → 提高+/省选-
 *     ID 7：NOI/NOI+/CTSC → 省选/NOI-
 *   旧文件里存的是旧名称，需要按下表整体平移。
 *
 * 只改两处：
 *   1. front matter 的 difficulty: 行
 *   2. 正文的 "> **洛谷** | <难度> | ..." 行
 *   其余内容一律不动。仅处理 solutions/luogu/，不影响东方博宜（它也有「提高」这一级）。
 *
 * 用法：
 *   node fix_luogu_difficulty.js            # 正式执行
 *   node fix_luogu_difficulty.js --dry-run  # 只统计不写文件
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'solutions', 'luogu');
const DRY_RUN = process.argv.includes('--dry-run');

// 旧名称 → 新名称
const DIFF_RENAME = {
  '暂无评定': '暂无评定',
  '入门': '入门',
  '普及-': '普及-',
  '普及/提高-': '普及',
  '普及+/提高': '普及+/提高-',
  '提高+/省选-': '提高',
  '省选/NOI-': '提高+/省选-',
  'NOI/NOI+/CTSC': '省选/NOI-',
};

function convert(md) {
  const lines = md.split('\n');
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    // 1. front matter：只在开头连续区域内处理
    if (i < 30 && /^difficulty:\s*(.+)$/.test(lines[i])) {
      const old = lines[i].match(/^difficulty:\s*(.+)$/)[1].trim();
      const neu = DIFF_RENAME[old];
      if (neu && neu !== old) {
        lines[i] = `difficulty: ${neu}`;
        changed = true;
      }
      continue;
    }

    // 2. 正文头部信息行：" > **洛谷** | 难度 | C++14 | 提交时间: ..."
    const m = lines[i].match(/^(> \*\*洛谷\*\* \| )([^|]+)(\|.*)$/);
    if (m) {
      const old = m[2].trim();
      const neu = DIFF_RENAME[old];
      if (neu && neu !== old) {
        lines[i] = m[1] + neu + m[3];
        changed = true;
      }
    }
  }

  return { text: lines.join('\n'), changed };
}

function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md'));
  console.log(`📁 待处理：${files.length} 个文件${DRY_RUN ? '（预览模式）' : ''}`);

  const stat = {};
  let changedFiles = 0;

  for (const f of files) {
    const fp = path.join(DIR, f);
    const md = fs.readFileSync(fp, 'utf-8');
    const m = md.match(/^difficulty:\s*(.+)$/m);
    const oldName = m ? m[1].trim() : '(无)';

    const { text, changed } = convert(md);
    if (changed) {
      if (!DRY_RUN) fs.writeFileSync(fp, text, 'utf-8');
      changedFiles++;
      const key = `${oldName} → ${DIFF_RENAME[oldName] || oldName}`;
      stat[key] = (stat[key] || 0) + 1;
    }
  }

  console.log('\n迁移明细：');
  Object.entries(stat).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}：${v} 个`));
  console.log(`\n✅ 已修改 ${changedFiles} 个文件${DRY_RUN ? '（未写入）' : ''}`);
  if (!DRY_RUN && changedFiles > 0) console.log('下一步：node build.js 重建索引');
}

main();
