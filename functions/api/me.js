/**
 * Cloudflare Pages Function — 获取当前登录状态
 *
 * GET /api/me
 *   Header: Authorization: Bearer <token>
 *   Success: { role: "admin" }
 *   Error:   { error: string }
 */
import { verifyToken } from './auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  // 只接受 GET
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 从 Authorization header 提取 token
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();

  if (!token) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 验证 token
  const session = await verifyToken(token, env.TOKEN_SECRET || 'default-token-secret-change-me');
  if (!session) {
    return new Response(JSON.stringify({ error: '登录已过期，请重新登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ role: session.role }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
