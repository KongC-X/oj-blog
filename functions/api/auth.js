/**
 * Cloudflare Pages Function — 登录鉴权
 *
 * POST /api/auth
 *   Body: { password: string }
 *   Success: { token: string, role: "admin" }
 *   Error:   { error: string }
 *
 * 需要设置的环境变量（Cloudflare Pages 面板 → Settings → Environment Variables）：
 *   AUTH_PASSWORD  — 管理员密码（必填，默认 oi2026）
 *   TOKEN_SECRET   — Token 签名密钥（必填，建议随机字符串）
 */

// Token 有效期（毫秒）
const TOKEN_EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 小时

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

  // 验证密码
  const validPassword = env.AUTH_PASSWORD || 'oi2026';
  if (password !== validPassword) {
    return new Response(JSON.stringify({ error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 签发 Token（HMAC-SHA256 签名，stateless，无需 KV 存储）
  const token = await createToken(env.TOKEN_SECRET || 'default-token-secret-change-me');

  return new Response(JSON.stringify({ token, role: 'admin' }), {
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
async function createToken(secret) {
  const timestamp = Date.now() + TOKEN_EXPIRE_MS;
  const payload = JSON.stringify({ role: 'admin', exp: timestamp });

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
