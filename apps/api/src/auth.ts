import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { getDb } from './db';
import { forbidden, unauthorized } from './http';

export interface AuthUser {
  id: string;
  email: string;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

function readBearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

/**
 * Korumalı uçlar için zorunlu kimlik doğrulama. Pasife alınmış veya silinmiş
 * hesaplar geçerli token taşısa bile reddedilir.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = readBearer(req);
  if (!token) return next(unauthorized());

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    return next(unauthorized('Oturumunuzun süresi doldu. Tekrar giriş yapın.'));
  }

  try {
    const row = await getDb().one<AuthUser>(
      'SELECT id, email, status FROM users WHERE id = $1',
      [String(payload.sub)]
    );

    if (!row) return next(unauthorized('Hesap bulunamadı.'));
    if (row.status !== 'active') {
      return next(forbidden('Hesabınız aktif değil. Destek ile iletişime geçin.'));
    }

    req.user = row;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Makineden makineye moderasyon erişimi (paylaşılan anahtar). İnsan
 * kullanıcılar için oturum tabanlı panel girişi vardır (bkz. admin/).
 */
export function requireAdminToken(req: Request, _res: Response, next: NextFunction): void {
  const token = req.header('x-admin-token');
  if (!token || token !== config.adminToken) {
    return next(forbidden('Geçersiz yönetim anahtarı.'));
  }
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
