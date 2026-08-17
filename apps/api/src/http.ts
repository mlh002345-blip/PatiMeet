import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

/** İstemciye anlamlı mesaj dönebilmek için kullanılan hata tipi. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code = 'bad_request') => new ApiError(400, code, msg);
export const unauthorized = (msg = 'Oturum açmanız gerekiyor.') =>
  new ApiError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Bu işlem için yetkiniz yok.') =>
  new ApiError(403, 'forbidden', msg);
export const notFound = (msg = 'Kayıt bulunamadı.') => new ApiError(404, 'not_found', msg);
export const conflict = (msg: string, code = 'conflict') => new ApiError(409, code, msg);

/** Async route handler'larda atılan hataları Express error middleware'ine aktarır. */
export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Gövdeyi zod ile doğrular; hata mesajlarını Türkçe alan adıyla birleştirir. */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const field = first.path.join('.');
      throw badRequest(field ? `${field}: ${first.message}` : first.message, 'validation_error');
    }
    throw error;
  }
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  console.error('[patimeet] beklenmeyen hata:', error);
  res.status(500).json({
    error: { code: 'internal_error', message: 'Beklenmeyen bir hata oluştu. Tekrar deneyin.' },
  });
}
