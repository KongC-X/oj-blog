/**
 * Cloudflare Pages Function — 触发 GitHub Actions 更新题解
 *
 * POST /api/trigger-update
 *   Header:  Authorization: Bearer <token>
 *   Body: {
 *     source: "luogu" | "dfboy" | "all" | "rebuild",
 *     luogu_cookie?: string,  // 洛谷 Cookie（仅 source=luogu/all 时需要）
 *     dfboy_user?: string,    // 东方博宜账号（仅 source=dfboy/all 时需要）
 *     dfboy_pass?: string,    // 东方博宜密码（仅 source=dfboy/all 时需要）
 *     force?: boolean
 *   }
 *   Success: { ok: true, message: string }
 *   Error:   { error: string }
 *
 * 需要设置的环境变量（Cloudflare Pages 面板）：
 *   GITHUB_TOKEN    — GitHub Personal Access Token（需 repo 权限）
 *   GITHUB_OWNER    — GitHub 用户名/组织（如 KongC-X）
 *   GITHUB_REPO     — GitHub 仓库名（如 oj-blog）
 *   TOKEN_SECRET    — 与 auth.js 相同的 Token 签名密钥
 */
import { verifyToken } from './auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  // 只接受 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ==================== 鉴权 ====================
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();

  if (!token) {
    return new Response(JSON.stringify({ error: '未登录，请先登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await verifyToken(token, env.TOKEN_SECRET || 'default-token-secret-change-me');
  if (!session) {
    return new Response(JSON.stringify({ error: '登录已过期，请重新登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (session.role !== 'admin') {
    return new Response(JSON.stringify({ error: '需要管理员权限' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ==================== 参数验证 ====================
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '无效的请求体' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { source, luogu_cookie, dfboy_user, dfboy_pass, force } = body;

  // 验证 source
  const validSources = ['luogu', 'dfboy', 'all', 'rebuild'];
  if (!source || !validSources.includes(source)) {
    return new Response(JSON.stringify({
      error: '请指定更新源: luogu / dfboy / all / rebuild',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 根据 source 验证必要参数
  if ((source === 'luogu' || source === 'all') && !luogu_cookie) {
    return new Response(JSON.stringify({ error: '更新洛谷需要提供 Cookie' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if ((source === 'dfboy' || source === 'all') && (!dfboy_user || !dfboy_pass)) {
    return new Response(JSON.stringify({ error: '更新东方博宜需要提供账号和密码' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ==================== 检查 GitHub 配置 ====================
  const githubToken = env.GITHUB_TOKEN;
  const githubOwner = env.GITHUB_OWNER;
  const githubRepo = env.GITHUB_REPO;

  if (!githubToken || !githubOwner || !githubRepo) {
    return new Response(JSON.stringify({
      error: 'GitHub 配置不完整，请在 Cloudflare Pages 环境变量中设置 GITHUB_TOKEN、GITHUB_OWNER、GITHUB_REPO',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ==================== 触发 GitHub Actions ====================
  try {
    const payload = {
      event_type: 'update-solutions',
      client_payload: {
        source: source,
        force: force || false,
      },
    };

    // 只在有实际 cookie/密码时才传递（不传空值到 Action 日志）
    if (luogu_cookie) payload.client_payload.luogu_cookie = luogu_cookie;
    if (dfboy_user) payload.client_payload.dfboy_user = dfboy_user;
    if (dfboy_pass) payload.client_payload.dfboy_pass = dfboy_pass;

    const githubResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'oj-blog-cf-functions',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!githubResponse.ok) {
      const errText = await githubResponse.text().catch(() => 'unknown error');
      console.error('GitHub API error:', githubResponse.status, errText);
      return new Response(JSON.stringify({
        error: `GitHub Actions 触发失败 (HTTP ${githubResponse.status})，请检查 GITHUB_TOKEN 权限是否为 repo 范围`,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sourceNames = {
      luogu: '洛谷',
      dfboy: '东方博宜',
      all: '洛谷 + 东方博宜',
      rebuild: '重建索引',
    };

    return new Response(JSON.stringify({
      ok: true,
      message: `🚀 已触发 ${sourceNames[source] || source} 更新任务！GitHub Actions 将在后台运行，完成后自动部署到网站。`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Trigger update failed:', err);
    return new Response(JSON.stringify({
      error: '触发 GitHub Actions 失败: ' + err.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
