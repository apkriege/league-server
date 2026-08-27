import { Request, Response, NextFunction } from 'express';

const errorNames: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  405: 'MethodNotAllowed',
  409: 'Conflict',
  413: 'PayloadTooLarge',
  415: 'UnsupportedMediaType',
  422: 'UnprocessableEntity',
  429: 'TooManyRequests',
  500: 'InternalServerError',
  502: 'BadGateway',
  503: 'ServiceUnavailable',
  504: 'GatewayTimeout',
};

const errorMessages: Record<number, string> = {
  400: 'Bad request.',
  401: 'Not authenticated.',
  403: 'Forbidden.',
  404: 'Route not found.',
  405: 'Method not allowed.',
  409: 'Conflict.',
  413: 'Request body is too large.',
  415: 'Unsupported media type.',
  422: 'Request could not be processed.',
  429: 'Too many requests.',
  500: 'Internal server error',
  502: 'Upstream service error.',
  503: 'Service temporarily unavailable.',
  504: 'Upstream service timeout.',
};

const createErrorBody = (req: Request, status: number, message?: string) => ({
  status,
  name: errorNames[status] || (status >= 500 ? 'ServerError' : 'RequestError'),
  message:
    status >= 500
      ? errorMessages[status] || 'Internal server error'
      : message || errorMessages[status] || 'Request failed.',
  requestId: (req as any).requestId,
});

export const normalizeErrorResponses = (req: Request, res: Response, next: NextFunction) => {
  const originalSend = res.send.bind(res);
  const originalSendStatus = res.sendStatus.bind(res);

  res.sendStatus = ((status: number) => {
    if (status < 400) return originalSendStatus(status);
    return res.status(status).json(createErrorBody(req, status));
  }) as Response['sendStatus'];

  res.send = ((body?: unknown) => {
    const status = res.statusCode;
    const contentType = String(res.getHeader('Content-Type') || '');
    if (status >= 400 && typeof body === 'string' && !contentType.includes('application/json')) {
      const looksLikeHtml = /^\s*(?:<!doctype|<html)/i.test(body);
      const message = looksLikeHtml ? undefined : body.trim() || undefined;
      return res.status(status).json(createErrorBody(req, status, message));
    }
    return originalSend(body);
  }) as Response['send'];

  next();
};
