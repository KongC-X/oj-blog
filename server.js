#!/usr/bin/env node
/**
 * server.js — OJ题解站后端服务
 * 
 * 功能：
 *   - 双角色登录鉴权（普通用户 + 管理员）
 *   - 管理员才能执行更新题解操作
 *   - 调用 luogu_fetch.js / dfboy_fetch.js 爬取题解
 *   - SSE 实时日志推送
 *   - 重建索引
 * 
 * 用法：
 *   node server.js              # 默认端口 8766
 *   PORT=3000 node server.js    # 自定义端口
 */

const express = require('express');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');

// 安全依赖
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 8766;

// ========== 安全头（helmet） ==========
app.use(helmet({
  contentSecurityPolicy: false, // SPA 需要内联脚本，关闭 CSP
  crossOriginEmbedderPolicy: false,
}));

// ========== 账户配置 ==========
// 密码必须通过环境变量设置，不再硬编码默认值
const USER_PASSWORD = process.env.USER_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!USER_PASSWORD || !ADMIN_PASSWORD) {
  console.warn('');
  console.warn('⚠️  安全警告：未设置环境变量 USER_PASSWORD 或 ADMIN_PASSWORD');
  console.warn('   请在 .env 文件或启动命令中设置密码');
  console.warn('   当前使用开发模式默认密码（仅限本地开发）');
  console.warn('');
}

// 开发模式默认密码（仅在未设置环境变量时使用）
const ACCOUNTS = [
  { password: USER_PASSWORD || 'oi2026', role: 'user' },
  { password: ADMIN_PASSWORD || 'zym2026', role: 'admin' },
];

// Token 管理（内存存储）
const tokenStore = new Map(); // token -> { role, timestamp }
const TOKEN_EXPIRE = 24 * 60 * 60 * 1000; // 24小时

// ========== 密码哈希（bcrypt） ==========
// 预计算密码哈希（启动时计算一次）
const BCRYPT_ROUNDS = 10;
const ACCOUNT_HASHES = [];

async function initPasswords() {
  for (const account of ACCOUNTS) {
    const hash = await bcrypt.hash(account.password, BCRYPT_ROUNDS);
    ACCOUNT_HASHES.push({ hash, role: account.role });
  }
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// 中间件
app.use(express.json({ limit: '1mb' }));

// ========== 静态资源缓存策略 ==========
app.use((req, res, next) => {
  const url = req.path;
  if (/^\/vendor\//.test(url) || /^\/fonts\//.test(url)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (/\.(css|js)(\?|$)/.test(url)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  } else if (/\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/i.test(url)) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  }
  next();
});

app.use(express.static(path.join(__dirname)));  // 静态文件（也托管网站）

// ========== CORS（可配置白名单） ==========
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:8765', 'http://localhost:8766', 'http://127.0.0.1:8765', 'http://127.0.0.1:8766'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin || CORS_ORIGINS.includes('*')) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ========== 速率限制 ==========
// 登录接口：每 IP 每分钟最多 10 次尝试
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '登录尝试过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 更新接口：每 IP 每小时最多 5 次
const updateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: '更新请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ========== 鉴权中间件 ==========
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录，请先登录' });

  const session = tokenStore.get(token);
  if (!session) return res.status(401).json({ error: '登录已过期，请重新登录' });
  if (Date.now() - session.timestamp > TOKEN_EXPIRE) {
    tokenStore.delete(token);
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  req.user = { role: session.role };
  next();
}

// 管理员专用中间件
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// ========== 健康检查端点 ==========
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime().toFixed(0) + 's',
    timestamp: new Date().toISOString(),
    problems: (() => {
      try {
        const index = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/index.json'), 'utf-8'));
        return index.totalProblems || 0;
      } catch { return 0; }
    })(),
  });
});

// ========== 登录接口 ==========
app.post('/api/auth', authLimiter, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '请输入密码' });

  const account = ACCOUNT_HASHES.find(a => verifyPassword(password, a.hash));
  if (!account) return res.status(401).json({ error: '密码错误' });

  // 签发 token
  const token = randomUUID();
  tokenStore.set(token, { role: account.role, timestamp: Date.now() });

  res.json({ token, role: account.role });
});

// 获取当前用户信息
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ role: req.user.role });
});

// 退出登录
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) tokenStore.delete(token);
  res.json({ ok: true });
});

// ========== 任务管理 ==========
const tasks = new Map(); // taskId -> { status, logs[], pid }

function createTask(name) {
  const id = randomUUID().slice(0, 8);
  const task = {
    id,
    name,
    status: 'running',  // running | done | error
    logs: [],
    startTime: Date.now(),
  };
  tasks.set(id, task);
  return task;
}

function addLog(task, msg) {
  const line = msg.toString().replace(/\n$/, '');
  if (!line) return;
  task.logs.push({ time: Date.now(), text: line });
  // 通知 SSE 订阅者
  const listeners = sseListeners.get(task.id);
  if (listeners) {
    const data = JSON.stringify({ type: 'log', text: line, id: task.id, status: task.status });
    listeners.forEach(res => res.write(`data: ${data}\n\n`));
  }
}

function finishTask(task, status) {
  task.status = status;
  task.endTime = Date.now();
  task.duration = ((task.endTime - task.startTime) / 1000).toFixed(1);
  // 通知 SSE 订阅者任务结束
  const listeners = sseListeners.get(task.id);
  if (listeners) {
    const data = JSON.stringify({ type: 'end', id: task.id, status: task.status, duration: task.duration, logCount: task.logs.length });
    listeners.forEach(res => {
      res.write(`data: ${data}\n\n`);
      res.end();
    });
    sseListeners.delete(task.id);
  }
}

// ========== FTP 自动同步到龙虾云 ==========
function triggerFtpSync(task) {
  const syncScript = path.join(__dirname, 'ftp_sync.py');
  if (!fs.existsSync(syncScript)) {
    addLog(task, '☁️ ftp_sync.py 不存在，跳过云端同步');
    finishTask(task, 'done');
    return;
  }
  addLog(task, '');
  addLog(task, '☁️ 正在同步到龙虾云...');

  const syncChild = spawn('python3', [syncScript], {
    cwd: __dirname, env: process.env, stdio: ['ignore', 'pipe', 'pipe']
  });
  syncChild.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) addLog(task, text);
  });
  syncChild.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) addLog(task, '⚠️ ' + text);
  });
  syncChild.on('close', (code) => {
    if (code === 0) {
      addLog(task, '✅ 云端同步完成！');
    } else {
      addLog(task, '⚠️ 云端同步失败，请手动运行 python3 ftp_sync.py');
    }
    finishTask(task, 'done');
  });
  syncChild.on('error', (err) => {
    addLog(task, '⚠️ 同步进程启动失败: ' + err.message);
    finishTask(task, 'done');
  });
}

// ========== SSE 实时日志（需要鉴权） ==========
const sseListeners = new Map(); // taskId -> Set<res>

app.get('/api/update/stream/:taskId', (req, res) => {
  // SSE 鉴权：EventSource 不支持 header，通过 query param 传 token
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });

  const session = tokenStore.get(token);
  if (!session) return res.status(401).json({ error: '登录已过期' });
  if (Date.now() - session.timestamp > TOKEN_EXPIRE) {
    tokenStore.delete(token);
    return res.status(401).json({ error: '登录已过期' });
  }

  const { taskId } = req.params;
  const task = tasks.get(taskId);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx
  res.flushHeaders();

  if (!sseListeners.has(taskId)) sseListeners.set(taskId, new Set());
  sseListeners.get(taskId).add(res);

  // 如果任务已结束，直接发送结束信号
  if (task.status !== 'running') {
    const data = JSON.stringify({
      type: 'end',
      id: task.id,
      status: task.status,
      duration: task.duration,
      logCount: task.logs.length,
      logs: task.logs.slice(-50) // 发送最近50条日志
    });
    res.write(`data: ${data}\n\n`);
    res.end();
    sseListeners.get(taskId)?.delete(res);
    return;
  }

  // 心跳
  const heartbeat = setInterval(() => {
    if (res.writableEnded) { clearInterval(heartbeat); return; }
    res.write(`: heartbeat\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseListeners.get(taskId)?.delete(res);
  });
});

// ========== 洛谷更新接口 ==========
app.post('/api/update/luogu', requireAuth, requireAdmin, updateLimiter, (req, res) => {
  const { cookie, force } = req.body;

  if (!cookie || typeof cookie !== 'string' || cookie.trim().length < 20) {
    return res.status(400).json({ error: '请提供有效的洛谷 Cookie（至少20个字符）' });
  }

  const task = createTask('洛谷题解更新');
  const args = [path.join(__dirname, 'luogu_fetch.js')];
  if (force) args.push('--force');

  addLog(task, '🚀 开始更新洛谷题解...');
  addLog(task, `📋 Cookie 长度: ${cookie.trim().length} 字符`);
  addLog(task, `📦 Force 模式: ${force ? '开启' : '关闭'}`);

  const env = { ...process.env, LUOGU_COOKIE: cookie.trim() };
  const child = spawn('node', args, { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => addLog(task, line));
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => addLog(task, '⚠️ ' + line));
  });

  child.on('close', (code) => {
    if (code === 0) {
      addLog(task, '');
      addLog(task, '✅ 洛谷题解更新完成！');
      // 自动重建索引
      addLog(task, '');
      addLog(task, '🔨 重建索引...');
      const { execSync } = require('child_process');
      try {
        execSync('node build.js', { cwd: __dirname, encoding: 'utf-8' });
        addLog(task, '✅ 索引重建完成');
        // 自动同步到龙虾云
        triggerFtpSync(task);
      } catch (e) {
        addLog(task, '⚠️ 索引重建失败，请手动运行 node build.js');
        addLog(task, '   错误: ' + e.message);
        finishTask(task, 'done');
      }
    } else {
      addLog(task, '');
      addLog(task, `❌ 洛谷题解更新失败（退出码: ${code}）`);
      finishTask(task, 'error');
    }
  });

  child.on('error', (err) => {
    addLog(task, `❌ 进程启动失败: ${err.message}`);
    finishTask(task, 'error');
  });

  // 超时保护（30分钟）
  setTimeout(() => {
    if (task.status === 'running') {
      child.kill();
      addLog(task, '⏰ 任务超时（30分钟），已终止');
      finishTask(task, 'error');
    }
  }, 30 * 60 * 1000);

  res.json({ taskId: task.id, message: '任务已启动' });
});

// ========== 东方博宜更新接口（描述 + 代码 + 重建，一键完成） ==========
app.post('/api/update/dfboy', requireAuth, requireAdmin, updateLimiter, (req, res) => {
  const { username, password, force } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请提供东方博宜的账号和密码' });
  }

  const task = createTask('东方博宜题解更新（描述+代码）');

  addLog(task, '🚀 开始更新东方博宜题解...');
  addLog(task, '📋 步骤 1/3: 爬取题目描述...');
  addLog(task, `👤 用户: ${username}`);
  addLog(task, `📦 Force 模式: ${force ? '开启' : '关闭'}`);

  const env = { ...process.env, DFBOY_USER: username, DFBOY_PASS: password };

  // 阶段1: 爬取描述
  const dfboyScript = path.join(__dirname, 'dfboy_fetch.js');
  const args1 = [dfboyScript, '--nocodes'];
  if (force) args1.push('--force');

  const child1 = spawn('node', args1, { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });

  child1.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => addLog(task, line));
  });
  child1.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => addLog(task, '⚠️ ' + line));
  });

  child1.on('close', (code1) => {
    if (code1 !== 0) {
      addLog(task, '');
      addLog(task, `❌ 题目描述爬取失败（退出码: ${code1}）`);
      finishTask(task, 'error');
      return;
    }

    addLog(task, '');
    addLog(task, '✅ 题目描述爬取完成！');
    addLog(task, '');
    addLog(task, '📋 步骤 2/3: 爬取 AC 代码...');

    // 阶段2: 爬取代码
    const codesScript = path.join(__dirname, 'fetch_dfboy_codes.js');
    if (!fs.existsSync(codesScript)) {
      addLog(task, '⚠️ fetch_dfboy_codes.js 不存在，跳过代码爬取');
      runBuild();
      return;
    }

    const child2 = spawn('node', [codesScript], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });

    child2.stdout.on('data', (data) => {
      data.toString().split('\n').forEach(line => addLog(task, line));
    });
    child2.stderr.on('data', (data) => {
      data.toString().split('\n').forEach(line => addLog(task, '⚠️ ' + line));
    });
    child2.on('close', (code2) => {
      if (code2 !== 0) {
        addLog(task, '');
        addLog(task, `⚠️ AC 代码爬取失败（退出码: ${code2}），但描述已更新`);
        // 不算完全失败，继续重建
      } else {
        addLog(task, '');
        addLog(task, '✅ AC 代码爬取完成！');
      }
      runBuild();
    });
    child2.on('error', (err) => {
      addLog(task, `⚠️ 代码爬取进程启动失败: ${err.message}`);
      runBuild();
    });
  });

  function runBuild() {
    addLog(task, '');
    addLog(task, '📋 步骤 3/3: 重建索引...');
    const child3 = spawn('node', [path.join(__dirname, 'build.js')], {
      cwd: __dirname, env: process.env, stdio: ['ignore', 'pipe', 'pipe']
    });
    child3.stdout.on('data', (data) => {
      data.toString().split('\n').forEach(line => addLog(task, line));
    });
    child3.stderr.on('data', (data) => {
      data.toString().split('\n').forEach(line => addLog(task, '⚠️ ' + line));
    });
    child3.on('close', (code3) => {
      addLog(task, '');
      if (code3 === 0) {
        addLog(task, '✅ 东方博宜题解全部更新完成！');
        // 自动同步到龙虾云
        triggerFtpSync(task);
      } else {
        addLog(task, '⚠️ 索引重建失败，请手动运行 node build.js');
        finishTask(task, 'done');
      }
    });
  }

  // 超时保护
  setTimeout(() => {
    if (task.status === 'running') {
      try { child1.kill(); } catch {}
      addLog(task, '⏰ 任务超时（30分钟），已终止');
      finishTask(task, 'error');
    }
  }, 30 * 60 * 1000);

  res.json({ taskId: task.id, message: '任务已启动' });
});

// ========== 手动重建索引 ==========
app.post('/api/build', requireAuth, requireAdmin, (req, res) => {
  const task = createTask('重建索引');
  addLog(task, '🔨 开始重建索引...');

  const child = spawn('node', [path.join(__dirname, 'build.js')], {
    cwd: __dirname, env: process.env, stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => addLog(task, line));
  });
  child.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => addLog(task, '⚠️ ' + line));
  });
  child.on('close', (code) => {
    if (code === 0) {
      addLog(task, '✅ 索引重建完成！');
      // 自动同步到龙虾云
      triggerFtpSync(task);
    } else {
      addLog(task, `❌ 索引重建失败（退出码: ${code}）`);
      finishTask(task, 'error');
    }
  });

  res.json({ taskId: task.id, message: '任务已启动' });
});

// ========== 查询任务状态 ==========
app.get('/api/update/status/:taskId', requireAuth, (req, res) => {
  const task = tasks.get(req.params.taskId);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json({
    id: task.id,
    name: task.name,
    status: task.status,
    logCount: task.logs.length,
    duration: task.duration || ((Date.now() - task.startTime) / 1000).toFixed(1),
  });
});

// ========== 启动 ==========
initPasswords().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`\n🚀 OJ题解站后端服务已启动`);
    console.log(`   地址: http://localhost:${PORT}`);
    console.log(`   静态文件: ${__dirname}`);
    console.log(`   API: http://localhost:${PORT}/api/update/luogu`);
    console.log(`   API: http://localhost:${PORT}/api/update/dfboy`);
    console.log(`   API: http://localhost:${PORT}/api/build`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log('');
    console.log(`   密码: ${USER_PASSWORD ? '已从环境变量加载' : '⚠️ 使用默认密码（仅限本地开发）'}`);
    console.log(`   CORS: ${CORS_ORIGINS.join(', ')}`);
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ 端口 ${PORT} 已被占用，请检查是否有其他服务正在运行`);
      console.error(`   提示: 使用 PORT=其他端口 node server.js 指定端口`);
      console.error(`   或运行: lsof -i :${PORT} 查看占用进程`);
      process.exit(1);
    }
    throw err;
  });
});
