/**
 * Cloudflare Pages Function — 登录鉴权（双权限）
 *
 * POST /api/auth
 *   Body: { password: string }
 *   Success: { token: string, role: "user" | "admin" }
 *   Error:   { error: string }
 *
 * 权限说明：
 *   - 密码为 oi2026（硬编码） → 普通用户，只能看题解
 *   - 密码为 AUTH_PASSWORD 环境变量值 → 管理员，可使用更新题解等功能
 *
 * 需要设置的环境变量（Cloudflare Pages 面板 → Settings → Environment Variables）：
 *   AUTH_PASSWORD  — 管理员密码（当前为 zym2026）
 *   TOKEN_SECRET   — Token 签名密钥（必填，建议随机字符串）
 */

// Token 有效期（毫秒）
const TOKEN_EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 小时

// 普通用户密码（硬编码，只能看题解）
const USER_PASSWORD = 'oi2026';

export async function onRequest(context) {
  const { request, env } = context;

  // 只接受 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
    });
  }

  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '无效的请求体' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { password } = body;
  if (!password) {
    return new Response(JSON.stringify({ error: '请输入密码' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 双权限验证：
  // 1. 管理员密码（来自环境变量 AUTH_PASSWORD）
  // 2. 普通用户密码（硬编码 oi2026）
  const adminPassword = env.AUTH_PASSWORD;
  let role = null;

  if (password === adminPassword) {
    role = 'admin';
  } else if (password === USER_PASSWORD) {
    role = 'user';
  }

  if (!role) {
    return new Response(JSON.stringify({ error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 签发 Token（携带角色信息）
  const token = await createToken(role, env.TOKEN_SECRET || 'default-token-secret-change-me');

  return new Response(JSON.stringify({ token, role }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * 创建带过期时间的 HMAC 签名 Token
 * 格式：base64(timestamp.json).base64(signature)
 */
async function createToken(role, secret) {
  const timestamp = Date.now() + TOKEN_EXPIRE_MS;
  const payload = JSON.stringify({ role, exp: timestamp });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  // base64url 编码
  const payloadB64 = btoa(payload).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${payloadB64}.${sigB64}`;
}

/**
 * 验证 Token（导出供其他 Function 使用）
 */
export async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, sigB64] = parts;

    // 解码 payload
    const payloadStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadStr);

    // 检查过期
    if (Date.now() > payload.exp) return null;

    // 验证签名
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const expectedSig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify('HMAC', key, expectedSig, encoder.encode(payloadStr));

    if (!isValid) return null;

    return { role: payload.role, exp: payload.exp };
  } catch {
    return null;
  }
}
