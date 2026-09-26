import type { Response } from 'express';

// Machine-readable errors for the integration API. The envelope stays compatible with
// Kala's existing `{ error: string }` convention and adds a stable `code` (plus
// optional per-field `details`) so external systems can branch without parsing text.
// Internal stack traces are never returned.

export type IntegrationErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'unknown_provider'
  | 'provider_disabled'
  | 'provider_mismatch'
  | 'validation_error'
  | 'rate_limited'
  | 'internal_error';

export interface IntegrationErrorDetail {
  field: string;
  message: string;
}

export class IntegrationError extends Error {
  readonly status: number;
  readonly code: IntegrationErrorCode;
  readonly details?: IntegrationErrorDetail[];

  constructor(
    status: number,
    code: IntegrationErrorCode,
    message: string,
    details?: IntegrationErrorDetail[]
  ) {
    super(message);
    this.name = 'IntegrationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Invalid or missing integration API key') =>
  new IntegrationError(401, 'unauthorized', message);

export const forbidden = (message: string) => new IntegrationError(403, 'forbidden', message);

export const notFound = (message = 'Not found') => new IntegrationError(404, 'not_found', message);

export const validationError = (details: IntegrationErrorDetail[], message = 'Validation failed') =>
  new IntegrationError(422, 'validation_error', message, details);

export const rateLimited = (retryAfterSeconds: number) =>
  new IntegrationError(429, 'rate_limited', `Rate limit exceeded. Retry in ${retryAfterSeconds}s`);

/** Writes any thrown value as an integration error response. Logs internals, never returns them. */
export function sendIntegrationError(res: Response, err: unknown): void {
  if (res.headersSent) return;
  if (err instanceof IntegrationError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }
  // Unexpected failure: log it server-side, hand the caller a generic 500 without a
  // stack trace or any internal details.
  console.error('Integration API error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'internal_error' });
}
