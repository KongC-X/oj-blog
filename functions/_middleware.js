/**
 * Cloudflare Pages Functions — 全局中间件
 *
 * 处理：CORS 头、OPTIONS 预检请求、安全头
 */

// 允许的域名（生产环境可限制为具体域名）
const ALLOWED_ORIGINS = [
  'https://zymojblog.top',
  'https://www.zymojblog.top',
  'http://localhost:8765',
  'http://localhost:8766',
  'http://127.0.0.1:8765',
  'http://127.0.0.1:8766',
];

export async function onRequest(context) {
  const { request, next } = context;
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);

  // 只有 /api/* 路径需要经过 Functions
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  // 判断是否为允许的域名
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://zymojblog.top';

  // OPTIONS 预检请求 — 直接返回
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 正常请求：先执行目标 handler，再附加 CORS 头
  const response = await next();

  // 给 API 响应添加 CORS 头
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', allowOrigin);
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
