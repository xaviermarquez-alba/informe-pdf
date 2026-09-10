import { renderInformePdf, type RenderInput, type RenderOptions } from './render.js';

/** Web Request/Response adapter; authenticate callers in the hosting application. */
export function createInformePdfHandler(options: RenderOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const body = await request.json().catch(() => null) as (RenderInput & { filename?: unknown }) | null;
    if (!body || typeof body.html !== 'string' || !body.html.trim()) {
      return Response.json({ error: 'html must be a non-empty string' }, { status: 400 });
    }
    const filename = typeof body.filename === 'string'
      ? body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150) || 'preinforme'
      : 'preinforme';
    try {
      const result = await renderInformePdf(body, options);
      if (body.previewImages === true) return Response.json({ pages: result.pages });
      return new Response(new Uint8Array(result.pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}.pdf"`,
          'Content-Length': String(result.pdf.length),
        },
      });
    } catch {
      return Response.json({ error: 'Could not generate PDF' }, { status: 500 });
    }
  };
}
