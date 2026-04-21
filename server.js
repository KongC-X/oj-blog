#!/usr/bin/env node
/**
 * server.js — OJ题解站后端服务
 * 
 * 功能：
 *   - 鉴权（复用 oi2026 密码）
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

const app = express();
const PORT = process.env.PORT || 8766;

// 鉴权密码（与前端 CONFIG.simplePassword 保持一致）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'oi2026';

// 中间件
app.use(express.json({ limit: '1mb' }));

// 静态资源缓存策略
// vendor/ 和 fonts/ 不常变动 → 长期缓存
// css/ 和 js/ 有版本号 → 长期缓存
// 其他静态文件 → 短期缓存
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

// CORS（开发时前端可能在不同端口）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ========== 鉴权中间件 ==========
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '未授权，请提供正确的密码' });
  }
  next();
}

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

// ========== SSE 实时日志 ==========
const sseListeners = new Map(); // taskId -> Set<res>

// SSE 端点：客户端订阅任务日志
app.get('/api/update/stream/:taskId', (req, res) => {
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

  // 发送历史日志（新连接只收到从连接开始的日志）
  // 不发送历史日志，只发送实时日志

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
app.post('/api/update/luogu', requireAuth, (req, res) => {
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
        addLog(task, '✅ 索引重建完成，刷新网页即可看到新题解');
        finishTask(task, 'done');
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

// ========== 东方博宜更新接口 ==========
app.post('/api/update/dfboy', requireAuth, (req, res) => {
  const { username, password, force } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请提供东方博宜的账号和密码' });
  }

  const task = createTask('东方博宜题解更新');
  const args = [path.join(__dirname, 'dfboy_fetch.js')];
  if (force) args.push('--force');

  addLog(task, '🚀 开始更新东方博宜题解...');
  addLog(task, `👤 用户: ${username}`);
  addLog(task, `📦 Force 模式: ${force ? '开启' : '关闭'}`);

  const env = { ...process.env, DFBOY_USER: username, DFBOY_PASS: password };
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
      addLog(task, '✅ 东方博宜题解更新完成！');
      finishTask(task, 'done');
    } else {
      addLog(task, '');
      addLog(task, `❌ 东方博宜题解更新失败（退出码: ${code}）`);
      finishTask(task, 'error');
    }
  });

  child.on('error', (err) => {
    addLog(task, `❌ 进程启动失败: ${err.message}`);
    finishTask(task, 'error');
  });

  setTimeout(() => {
    if (task.status === 'running') {
      child.kill();
      addLog(task, '⏰ 任务超时（30分钟），已终止');
      finishTask(task, 'error');
    }
  }, 30 * 60 * 1000);

  res.json({ taskId: task.id, message: '任务已启动' });
});

// ========== 东方博宜代码更新接口 ==========
app.post('/api/update/dfboy-codes', requireAuth, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请提供东方博宜的账号和密码' });
  }

  const task = createTask('东方博宜代码更新');
  const scriptPath = path.join(__dirname, 'fetch_dfboy_codes.js');

  if (!require('fs').existsSync(scriptPath)) {
    addLog(task, '❌ fetch_dfboy_codes.js 文件不存在');
    finishTask(task, 'error');
    return res.json({ taskId: task.id, message: '任务已启动' });
  }

  addLog(task, '🚀 开始更新东方博宜 AC 代码...');
  addLog(task, `👤 用户: ${username}`);

  const env = { ...process.env, DFBOY_USER: username, DFBOY_PASS: password };
  const child = spawn('node', [scriptPath], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => addLog(task, line));
  });

  child.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => addLog(task, '⚠️ ' + line));
  });

  child.on('close', (code) => {
    if (code === 0) {
      addLog(task, '');
      addLog(task, '✅ 代码更新完成！');
      finishTask(task, 'done');
    } else {
      addLog(task, `❌ 代码更新失败（退出码: ${code}）`);
      finishTask(task, 'error');
    }
  });

  child.on('error', (err) => {
    addLog(task, `❌ 进程启动失败: ${err.message}`);
    finishTask(task, 'error');
  });

  setTimeout(() => {
    if (task.status === 'running') {
      child.kill();
      addLog(task, '⏰ 任务超时（30分钟），已终止');
      finishTask(task, 'error');
    }
  }, 30 * 60 * 1000);

  res.json({ taskId: task.id, message: '任务已启动' });
});

// ========== 手动重建索引 ==========
app.post('/api/build', requireAuth, (req, res) => {
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
      finishTask(task, 'done');
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
app.listen(PORT, () => {
  console.log(`\n🚀 OJ题解站后端服务已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   静态文件: ${__dirname}`);
  console.log(`   API: http://localhost:${PORT}/api/update/luogu`);
  console.log(`   API: http://localhost:${PORT}/api/update/dfboy`);
  console.log(`   API: http://localhost:${PORT}/api/update/dfboy-codes`);
  console.log(`   API: http://localhost:${PORT}/api/build`);
  console.log('');
});
