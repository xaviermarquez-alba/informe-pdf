import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateInformePdf } from './generate.js';
import type { RenderOptions } from './render.js';

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

export interface ServiceOptions extends RenderOptions {
  token: string;
  maxBodyBytes?: number;
  maxConcurrent?: number;
  requestTimeoutMs?: number;
}
function authorized(header: string | undefined, token: string) {
  const given = Buffer.from(header || '');
  const expected = Buffer.from('Bearer ' + token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
/** Standalone service for internal callers; never logs report contents or tokens. */
export function createInformePdfServer(options: ServiceOptions): Server {
  if (!options.token) throw new Error('PDF_SERVICE_TOKEN is required');
  const maxBody = options.maxBodyBytes ?? 5 * 1024 * 1024;
  const maxConcurrent = options.maxConcurrent ?? 2;
  const requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  if (!Number.isSafeInteger(maxBody) || maxBody < 1 || !Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error('Body limit and concurrency must be positive integers');
  }
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    throw new Error('Request timeout must be a positive integer');
  }
  let active = 0;
  const server = createServer(async (req, res) => {
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    const path = req.url?.split('?')[0];
    if (path === '/health' && req.method === 'GET') return json(200, { status: 'ok' });
    if (path !== '/render') return json(404, { error: 'Not found' });
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(405, { error: 'POST required' }); }
    if (!authorized(req.headers.authorization, options.token)) return json(401, { error: 'Unauthorized' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON required' });
    if (active >= maxConcurrent) {
      res.setHeader('Retry-After', '2');
      return json(503, { error: 'Renderer busy; retry later' });
    }
    active++;
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBody) {
          req.resume();
          json(413, { error: 'Request too large' });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let raw: unknown;
      try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json(400, { error: 'Invalid JSON' }); }
      const result = await generateInformePdf(raw, options);
      if ((raw as { previewImages?: boolean }).previewImages) return json(200, { pages: result.pages });
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${result.filename}.pdf"`,
        'Content-Length': result.pdf.length,
        'Cache-Control': 'no-store',
      });
      res.end(result.pdf);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        json(error instanceof TypeError ? 400 : 500, {
          error: error instanceof TypeError ? error.message : 'Could not generate PDF',
        });
      }
    } finally { active--; }
  });
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.min(60_000, requestTimeoutMs);
  return server;
}
if (isDirectRun()) {
  const server = createInformePdfServer({
    token: process.env.PDF_SERVICE_TOKEN || '',
    publicDir: process.env.PDF_PUBLIC_DIR,
    executablePath: process.env.CHROME_BIN,
    disableSandbox: process.env.PDF_DISABLE_SANDBOX === 'true',
    maxBodyBytes: Number(process.env.PDF_MAX_BODY_BYTES || 5242880),
    maxConcurrent: Number(process.env.PDF_MAX_CONCURRENT || 2),
    requestTimeoutMs: Number(process.env.PDF_REQUEST_TIMEOUT_MS || 120000),
  });
  const port = Number(process.env.PORT || 8090);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Informe PDF service listening on ${host}:${port}`));
  const shutdown = () => { server.close(); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
