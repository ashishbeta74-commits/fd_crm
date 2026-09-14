import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    return res.status(400).json({
      error: first ? `Invalid ${first.path || 'input'}: ${first.message}` : 'Validation failed',
      details,
    });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ error: `Invalid value for ${err.path}` });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value', details: err.keyValue });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  console.error(err);
  return res.status(500).json({ error: err?.message || 'Internal server error' });
}
