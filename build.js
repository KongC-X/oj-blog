#!/usr/bin/env node
/**
 * build.js — 扫描 solutions/ 目录下所有 .md 文件，生成索引 JSON
 * 
 * 使用方式：
 *   node build.js
 * 
 * 每次添加/修改/删除 md 文件后运行一次即可。
 */

const fs = require('fs');
const path = require('path');

const SOLUTIONS_DIR = path.join(__dirname, 'solutions');
const OUTPUT_FILE = path.join(__dirname, 'data', 'index.json');

// OJ 来源映射
const OJ_MAP = {
  'luogu': '洛谷',
  'dfboy': '东方博宜',
};

function extractMeta(filePath, content) {
  const relativePath = path.relative(SOLUTIONS_DIR, filePath);
  const parts = relativePath.split(path.sep);
  const source = OJ_MAP[parts[0]] || parts[0];
  const fileName = parts[parts.length - 1];
  const problemId = fileName.replace(/\.md$/, '');
  
  // 从文件名提取纯编号（如 "P1001" → "1001"，"1042" → "1042"）
  const numId = problemId.replace(/^[A-Za-z]+/, '');
  
  // 尝试从内容提取元数据
  let title = problemId;
  let tags = [];
  let difficulty = '';
  let training = '';
  
  // 解析 YAML front matter（如果有）
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (frontMatterMatch) {
    const fm = frontMatterMatch[1];
    const titleMatch = fm.match(/title:\s*(.+)/);
    const tagsMatch = fm.match(/tags:\s*\[([^\]]*)\]/);
    const diffMatch = fm.match(/difficulty:\s*(.+)/);
    const trainingMatch = fm.match(/training:\s*(.+)/);
    
    if (titleMatch) title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
    if (tagsMatch) {
      tags = tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
    }
    if (diffMatch) difficulty = diffMatch[1].trim();
    if (trainingMatch) training = trainingMatch[1].trim().replace(/^["']|["']$/g, '');
  } else {
    // 没有 front matter 时从第一个标题提取标题
    const h1Match = content.match(/^#\s+(.+)/m);
    if (h1Match) title = h1Match[1].trim();
  }
  
  // 统计代码块
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
  
  // 估算阅读时间
  const wordCount = content.length;
  const readTime = Math.max(1, Math.ceil(wordCount / 500));
  
  // 文件修改时间
  const stat = fs.statSync(filePath);
  const lastModified = stat.mtime.toISOString().split('T')[0];
  
  return {
    id: problemId,
    numId,
    title,
    source,
    tags,
    difficulty,
    training,
    filePath: relativePath,
    codeBlocks,
    readTime,
    lastModified,
    summary: extractSummary(content),
  };
}

function extractSummary(content) {
  // 去掉 front matter
  let clean = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  // 去掉标题
  clean = clean.replace(/^#+\s+.*/gm, '');
  // 去掉代码块
  clean = clean.replace(/```[\s\S]*?```/g, '');
  // 去掉 markdown 标记
  clean = clean.replace(/[*_`~>\[\]()!|-]/g, '');
  // 取前 120 字符
  const text = clean.replace(/\s+/g, ' ').trim();
  return text.substring(0, 150) + (text.length > 150 ? '…' : '');
}

function scanDirectory() {
  const problems = [];
  
  if (!fs.existsSync(SOLUTIONS_DIR)) {
    console.log('❌ solutions/ 目录不存在，正在创建...');
    fs.mkdirSync(SOLUTIONS_DIR, { recursive: true });
    fs.mkdirSync(path.join(SOLUTIONS_DIR, 'luogu'), { recursive: true });
    fs.mkdirSync(path.join(SOLUTIONS_DIR, 'dfboy'), { recursive: true });
    console.log('✅ 已创建 solutions/luogu/ 和 solutions/dfboy/');
    return problems;
  }
  
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const meta = extractMeta(fullPath, content);
          problems.push(meta);
        } catch (err) {
          console.warn(`⚠️ 跳过 ${entry.name}: ${err.message}`);
        }
      }
    }
  }
  
  walk(SOLUTIONS_DIR);
  
  // 按题号排序
  problems.sort((a, b) => {
    const numA = parseInt(a.numId) || 0;
    const numB = parseInt(b.numId) || 0;
    return numA - numB;
  });
  
  return problems;
}

function build() {
  console.log('🔍 扫描 solutions/ 目录...');
  
  const problems = scanDirectory();
  
  // 确保输出目录存在
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  
  const index = {
    buildTime: new Date().toISOString(),
    totalProblems: problems.length,
    sources: [...new Set(problems.map(p => p.source))],
    allTags: [...new Set(problems.flatMap(p => p.tags))].sort(),
    // 按来源分组的训练题单统计
    trainingBySource: {},
    problems,
  };

  // 构建训练题单统计
  problems.forEach(p => {
    if (p.training) {
      if (!index.trainingBySource[p.source]) index.trainingBySource[p.source] = {};
      const tb = index.trainingBySource[p.source];
      if (!tb[p.training]) tb[p.training] = 0;
      tb[p.training]++;
    }
  });
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2), 'utf-8');
  
  console.log(`✅ 索引构建完成！共 ${problems.length} 道题目`);
  console.log(`📁 输出: ${path.relative(process.cwd(), OUTPUT_FILE)}`);
  
  if (problems.length > 0) {
    console.log('\n📊 统计:');
    const sourceCount = {};
    problems.forEach(p => {
      sourceCount[p.source] = (sourceCount[p.source] || 0) + 1;
    });
    Object.entries(sourceCount).forEach(([src, cnt]) => {
      console.log(`   ${src}: ${cnt} 题`);
    });
  }
}

build();
