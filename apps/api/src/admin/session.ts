import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { getDb } from '../db';
import type { AdminUserRow } from '../domain/moderation';

const COOKIE_NAME = 'patimeet_admin';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: { id: string; email: string; name: string };
    }
  }
}

/**
 * İmzalı oturum çerezi.
 *
 * `<adminId>.<expiry>.<hmac>` biçiminde; sunucu tarafında durum tutmaya gerek
 * kalmaz. İmza gizli anahtarla üretilir, süre dolduğunda geçersiz olur.
 */
function sign(payload: string): string {
  return crypto.createHmac('sha256', config.adminSessionSecret).update(payload).digest('base64url');
}

export function createSessionCookie(adminId: string): string {
  const expiresAt = Date.now() + config.adminSessionTtlSeconds * 1000;
  const payload = `${adminId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionCookie(value: string | undefined): string | null {
  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;

  const [adminId, expiresAt, signature] = parts;
  const payload = `${adminId}.${expiresAt}`;

  const expected = sign(payload);
  // Zamanlama saldırılarına karşı sabit süreli karşılaştırma.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  if (Number(expiresAt) < Date.now()) return null;
  return adminId;
}

/** Basit çerez ayrıştırma — tek çerez okuduğumuz için ek bağımlılık gerekmiyor. */
export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function setSessionCookie(res: Response, adminId: string): void {
  const parts = [
    `${COOKIE_NAME}=${createSessionCookie(adminId)}`,
    'Path=/admin',
    'HttpOnly',
    // Panel formları aynı siteden gönderilir; Lax, CSRF yüzeyini daraltır.
    'SameSite=Lax',
    `Max-Age=${config.adminSessionTtlSeconds}`,
  ];
  // Yayında çerez yalnızca HTTPS üzerinden gönderilir.
  if (config.isProduction) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

/** Panel sayfaları için oturum kontrolü; oturum yoksa giriş sayfasına yönlendirir. */
export async function requireAdminSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cookies = parseCookies(req.header('cookie'));
  const adminId = readSessionCookie(cookies[COOKIE_NAME]);

  if (!adminId) {
    res.redirect('/admin/login');
    return;
  }

  const row = await getDb().one<AdminUserRow>('SELECT * FROM admin_users WHERE id = $1', [adminId]);
  if (!row || row.status !== 'active') {
    clearSessionCookie(res);
    res.redirect('/admin/login');
    return;
  }

  req.admin = { id: row.id, email: row.email, name: row.name };
  next();
}

export function currentAdmin(req: Request): { id: string; email: string; name: string } {
  if (!req.admin) throw new Error('Yönetici oturumu yok.');
  return req.admin;
}

export { COOKIE_NAME };
