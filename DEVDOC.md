# OJ 题解站 — 开发文档

> 章老师的 OJ 题解站：洛谷 + 东方博宜信奥赛题解合集
> 线上地址：https://zymojblog.top
> 仓库：github.com/KongC-X/oj-blog（master 分支）

---

## 一、当前状态（2026-11-04）

| 项目 | 数值 |
|---|---|
| 题解总数 | 2222 道（洛谷 1044 + 东方博宜 1178） |
| 索引体积 | index.json 864KB（brotli 后 48KB） |
| 搜索索引 | search.json 728KB（brotli 183KB，按需加载） |
| 预渲染页 | 2222 个（`p/<id>/index.html`，共约 20MB） |
| 字体 | JetBrains Mono WOFF2 ×4（367KB，按需加载 1–2 个） |
| 部署 | Cloudflare Pages，git push 自动构建 |
| 后端 | 仅本地开发用 `server.js`，生产为纯静态 |

---

## 二、架构

```
用户浏览器
   │
   ├─ 常规访问 ──→ Cloudflare Pages 静态托管
   │                 ├─ index.html + js/app.js（SPA，hash 路由）
   │                 ├─ data/index.json（列表用，不含 summary）
   │                 ├─ data/search.json（搜索时懒加载）
   │                 ├─ solutions/*.md（详情页按需加载）
   │                 └─ p/<id>/index.html（SEO 预渲染页，无 JS 可读）
   │
   └─ 本地开发 ──→ node server.js（Express，端口 8766）
                     ├─ 登录鉴权（user / admin 双角色）
                     ├─ 触发爬虫更新题解（SSE 实时日志）
                     └─ 重建索引 + 预渲染
```

**为什么是 SPA + 预渲染双轨？**
hash 路由（`#/post/P1001`）搜索引擎不索引，因此构建期为每题生成
`/p/<id>/index.html` 静态快照提供索引与分享预览；交互仍走 SPA。

---

## 三、目录结构

```
blog/
├── index.html              入口（含 SEO meta、预加载、skip-link）
├── 404.html                Cloudflare Pages 自动使用的 404 页
├── manifest.json           PWA 清单
├── robots.txt / sitemap.xml 由 prerender.js 生成
├── _headers                Cloudflare Pages 响应头（CSP、缓存策略）
├── js/app.js               前端全部逻辑（SPA 路由、渲染、搜索）
├── css/style.css           样式（含 SEO 静态页、分页、可访问性）
├── vendor/                 marked + highlight.js 打包（bundle.min.js）
├── fonts/                  JetBrains Mono（.woff2 生效，.ttf 为源文件）
├── data/
│   ├── index.json          题目索引（不含 summary）
│   ├── search.json         id → 摘要，搜索时懒加载
│   ├── templates.json      代码模版索引
│   └── courseware.json     课件索引
├── solutions/
│   ├── luogu/*.md          洛谷题解（P1001.md、B2001.md）
│   └── dfboy/*.md          东方博宜题解（纯数字命名）
├── p/<id>/index.html       预渲染静态页（构建产物，需提交）
├── templates/              代码模版 md
├── courseware/             课件（csp / gesp）
├── server.js               本地开发后端
├── build.js                扫描 solutions 生成索引（会自动调用 prerender）
├── prerender.js            生成静态页 + sitemap + robots
├── luogu_fetch.js          洛谷爬虫
├── dfboy_fetch.js          东方博宜题目描述爬虫
├── fetch_dfboy_codes.js    东方博宜 AC 代码爬虫
└── scripts/                维护工具（见第七节）
```

---

## 四、开发与运行

```bash
cd blog
npm install                     # 首次
node server.js                  # 启动本地服务，默认 8766
```

环境变量（可选，不设置则使用开发默认密码）：

```bash
PORT=8766
USER_PASSWORD=...               # 默认 oi2026
ADMIN_PASSWORD=...              # 默认 zym2026
```

访问 http://localhost:8766 ，管理员密码登录后可进入「更新题解」。

> ⚠️ 生产环境是 Cloudflare Pages 纯静态托管，**不运行 server.js**。
> 所有鉴权与更新能力仅存在于本地开发环境。

---

## 五、更新题解流程

### 5.1 洛谷

```bash
LUOGU_COOKIE='_uid=...; __client_id=...' node luogu_fetch.js
```

- 需要登录态 Cookie（浏览器 F12 → Network → 任意请求 → Cookie 整行）
- **翻页逻辑**：按该账号 AC 总数动态翻完所有页（约 57 页），再逐题取代码与描述
- 增量：本地已有 `<pid>.md` 的题目会跳过；`--force` 强制全部重抓

### 5.2 东方博宜

```bash
DFBOY_USER=账号 DFBOY_PASS=密码 node dfboy_fetch.js --nocodes
DFBOY_USER=账号 DFBOY_PASS=密码 node fetch_dfboy_codes.js
```

第一步抓题目描述，第二步补 AC 代码，两步都由后端的「更新题解」按钮串行执行。

### 5.3 构建与发布

```bash
node build.js          # 重建索引 + 增量预渲染 + sitemap
node build.js --no-prerender   # 只重建索引（快）
node prerender.js --clean      # 强制全量重建静态页

git add -A && git commit -m "更新题解" && git push origin master
```

Cloudflare Pages 检测到 master 更新后自动部署，约 1–2 分钟生效。

---

## 六、关键技术约定

### 6.1 洛谷接口（易踩坑）

洛谷 2025 年改版后，带 `_contentOnly=1` 也返回完整 HTML，数据内联在：

```html
<script id="lentille-context" type="application/json">{...}</script>
```

结构为 `{instance, template, status, data, user, time}`，业务数据在 `data`：

| 场景 | 路径 |
|---|---|
| 记录列表 | `data.records.{perPage,count,result}` |
| 单条提交 | `data.record.sourceCode` |
| 题目详情 | `data.problem`（name/difficulty/tags/content/samples） |
| 标签词典 | `https://www.luogu.com.cn/_lfe/tags` |

注意：题目名是 `problem.name`，**不是** `problem.title`。
`luogu_fetch.js` 里的 `parseLuoguPayload()` 同时兼容新旧两种格式。

### 6.2 难度体系（新版 8 级）

洛谷已从旧版 7 级改为新版 8 级，数值 ID 对应关系：

| ID | 名称 |
|---|---|
| 0 | 暂无评定 |
| 1 | 入门 |
| 2 | 普及- |
| 3 | 普及 |
| 4 | 普及+/提高- |
| 5 | 提高 |
| 6 | 提高+/省选- |
| 7 | 省选/NOI- |
| 8 | NOI/NOI+/CTS |

东方博宜是独立体系：入门 / 基础 / 提高。**修改洛谷难度时不要影响博宜。**

### 6.3 缓存策略

| 资源 | 策略 |
|---|---|
| `/fonts/*`、`/vendor/*` | 1 年 immutable |
| `/css/*`、`/js/*` | 7 天，靠 index.html 的 `?v=` 破缓存 |
| `/data/*`、`/solutions/*`、`/p/*` | `max-age=0, must-revalidate`，走 ETag 协商缓存（304） |

**不要再给 JSON/MD 加 `?t=Date.now()`**，那会让 CDN 缓存完全失效。

改 `css/style.css` 或 `js/app.js` 后，必须同步更新：
- `index.html` 里的 `?v=`
- `prerender.js` 里的 `ASSET_VER`

否则浏览器与已生成的静态页会读到旧资源。

### 6.4 前端约定

- 卡片用 `<a href="#/post/<id>">` 而非 `<div onclick>`（键盘可访问）
- 列表分页 50 条/页（`PAGE_SIZE`），避免一次渲染 2000+ 节点
- 搜索命中摘要需 `await ensureSearchMap()`，摘要不在主索引里
- 页面标题/描述由 `setPageMeta()` 在路由切换时更新

---

## 七、脚本职责

### 常驻（根目录）

| 脚本 | 用途 |
|---|---|
| `server.js` | 本地后端：鉴权、触发爬虫、SSE 日志 |
| `build.js` | 扫描 solutions → index.json + search.json，并调用预渲染 |
| `prerender.js` | 生成 `p/<id>/index.html`、sitemap.xml、robots.txt |
| `luogu_fetch.js` | 洛谷题解抓取 |
| `dfboy_fetch.js` | 东方博宜题目描述抓取 |
| `fetch_dfboy_codes.js` | 东方博宜 AC 代码抓取 |

### 维护工具（`scripts/`）

| 脚本 | 用途 |
|---|---|
| `scripts/optimize_fonts.js` | TTF → WOFF2（已执行，字体已转换） |
| `scripts/fix/fix_luogu_tags.js` | 按官方词典批量修正标签 |
| `scripts/fix/fix_luogu_difficulty.js` | 难度命名迁移（旧 7 级 → 新 8 级），支持 `--dry-run` |
| `scripts/fix/dfboy_difficulty_fix.js` | 修正东方博宜难度 |
| `scripts/fix/fix_empty_training.js` | 清理空的题单字段 |
| `scripts/fix/apply_training_map.js` | 按分类文件写入 training 字段 |
| `scripts/fix/apply_dfboy_training.js` | 批量写入博宜题单归属 |
| `scripts/fetch/luogu_training_fetch.js` | 拉取洛谷题单归属 |
| `scripts/fetch/luogu_training_final.js` | 洛谷题单归属最终版处理 |
| `scripts/legacy/code_import.js` | 从本地课程 md 批量导入代码（依赖 OCR 映射表） |
| `scripts/legacy/check_missing.js` | 检查缺失题号（**需在 blog 根目录运行**，用相对路径） |
| `scripts/legacy/ftp_sync.py` | 早期 FTP 同步，已废弃（现由 GitHub + Cloudflare 部署） |
| `scripts/legacy/ecosystem.config.js` | PM2 配置，cwd 已指向项目根目录 |

> 所有脚本的 `solutions/`、`data/` 路径都已按新位置修正为 `path.join(__dirname, '..', '..', ...)`。
> 新加脚本时请沿用同一约定，避免依赖调用时的 cwd。

---

## 八、已知限制

1. **详情页 URL 不可索引**：SPA 详情仍是 `#/post/<id>`，能被搜索的是预渲染的 `/p/<id>/`。
   彻底方案是改 history 路由 + 全站预渲染，工作量大，暂未做。
2. **数学公式**：题解中的 LaTeX 在预渲染页里以原文显示（未接 KaTeX），
   SPA 内同样未渲染。如需渲染，建议构建期接 KaTeX 服务端渲染。
3. **CSP 保留 `unsafe-inline`**：前端仍有内联 style/onclick，需先清理才能移除。
4. **无自动化测试**：改动靠人工验证 + `node --check` 语法检查。
5. **登录态会过期**：洛谷 Cookie 有效期有限，抓取失败时优先怀疑 Cookie。

---

## 九、常见问题

**Q：更新后线上没变化？**
检查是否 push 到 master；Cloudflare 部署约 1–2 分钟；浏览器需硬刷新（Cmd+Shift+R）。

**Q：抓取报「无法解析洛谷返回的数据」？**
Cookie 失效或未登录。验证方法：带 Cookie 请求
`/record/list?user=<uid>&status=12&_contentOnly=1`，401 表示未登录。

**Q：预渲染很慢？**
默认增量（比对 mtime + 资源版本号），只有变更的题会重写。
首次或改 `ASSET_VER` 后会全量，约 100 秒。

**Q：新增题解后忘记预渲染？**
直接跑 `node build.js` 即可，它会自动调用 prerender。

---

*最后更新：2026-11-04*
