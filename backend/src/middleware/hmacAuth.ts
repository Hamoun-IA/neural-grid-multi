import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-SHA256 authentication middleware for webhook endpoints.
 *
 * If WEBHOOK_SECRET is not set or empty, all requests pass through (rollback mode).
 * Expects header: X-Signature-256: sha256=<hex_digest>
 * Digest is computed over the raw request body.
 */
export function hmacAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.WEBHOOK_SECRET;

  // Feature flag: if no secret configured, let everything through
  if (!secret) {
    next();
    return;
  }

  const signatureHeader = req.headers['x-signature-256'];

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    res.status(401).json({ error: 'Missing X-Signature-256 header' });
    return;
  }

  if (!signatureHeader.startsWith('sha256=')) {
    res.status(401).json({ error: 'Invalid signature format' });
    return;
  }

  const providedHex = signatureHeader.slice('sha256='.length);

  // req.body at this point is a Buffer (when using express.raw())
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  const expectedHex = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    const provided = Buffer.from(providedHex, 'hex');
    const expected = Buffer.from(expectedHex, 'hex');

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}
