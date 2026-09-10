import { renderInformePdf, type RenderInput, type RenderOptions } from './render.js';
import { parsePayload } from './payload.js';
import { buildInformeDocuments } from './templates.js';

/** Web Request/Response adapter; authenticate callers in the hosting application. */
export function createInformePdfHandler(options: RenderOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    let body;
    try { body = parsePayload(await request.json()); }
    catch { return Response.json({ error: 'Invalid PDF request' }, { status: 400 }); }
    const filename = typeof body.filename === 'string'
      ? body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150) || 'preinforme'
      : 'preinforme';
    try {
      const input: RenderInput = body.report
        ? { ...buildInformeDocuments(body.report, body.content!, body.template), previewImages: body.previewImages }
        : { html: body.html!, coverHtml: body.coverHtml, continuationHeader: body.continuationHeader, previewImages: body.previewImages };
      const result = await renderInformePdf(input, options);
      if (body.previewImages === true) return Response.json({ pages: result.pages });
      return new Response(new Uint8Array(result.pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}.pdf"`,
          'Content-Length': String(result.pdf.length),
        },
      });
    } catch (error) {
      return Response.json({ error: error instanceof TypeError ? error.message : 'Could not generate PDF' }, { status: error instanceof TypeError ? 400 : 500 });
    }
  };
}
