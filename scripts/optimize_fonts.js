#!/usr/bin/env node
/**
 * scripts/optimize_fonts.js — 把 fonts/ 下的 TTF 转为 WOFF2
 *
 * WOFF2 使用 Brotli 压缩字体表，通常比 TTF 小 60-70%，
 * 且所有现代浏览器（Chrome/Firefox/Safari/Edge）都支持。
 *
 * 用法：node scripts/optimize_fonts.js
 * 依赖：wawoff2（开发依赖，纯 JS 实现，无需系统工具）
 */

const fs = require('fs');
const path = require('path');

const FONT_DIR = path.join(__dirname, '..', 'fonts');

async function main() {
  const wawoff2 = require('wawoff2');
  const files = fs.readdirSync(FONT_DIR).filter(f => f.toLowerCase().endsWith('.ttf'));

  if (files.length === 0) {
    console.log('未找到 TTF 字体');
    return;
  }

  let before = 0, after = 0;
  for (const f of files) {
    const src = path.join(FONT_DIR, f);
    const out = src.replace(/\.ttf$/i, '.woff2');
    const ttf = fs.readFileSync(src);
    const woff2 = await wawoff2.compress(ttf);

    fs.writeFileSync(out, Buffer.from(woff2));
    before += ttf.length;
    after += woff2.length;
    console.log(`  ${f}: ${(ttf.length / 1024).toFixed(0)}KB → ${(woff2.length / 1024).toFixed(0)}KB`);
  }

  const saved = ((1 - after / before) * 100).toFixed(1);
  console.log(`\n✅ 完成：${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB（减少 ${saved}%）`);
  console.log('下一步：把 css/style.css 里的 @font-face 指向 .woff2');
}

main().catch(e => {
  console.error('❌ 转换失败:', e.message);
  process.exit(1);
});
