import { defaultRenderOptions, generateInformePdf } from './generate.js';
import { parsePayload } from './payload.js';
import type { RenderOptions } from './render.js';

/** Web Request/Response adapter for an existing Node app; not a standalone service. */
export function createInformePdfHandler(options: RenderOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    let raw: unknown;
    try { raw = await request.json(); parsePayload(raw); }
    catch { return Response.json({ error: 'Invalid PDF request' }, { status: 400 }); }
    try {
      const result = await generateInformePdf(raw, { ...defaultRenderOptions(), ...options });
      if ((raw as { previewImages?: boolean }).previewImages === true) return Response.json({ pages: result.pages });
      return new Response(new Uint8Array(result.pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${result.filename}.pdf"`,
          'Content-Length': String(result.pdf.length),
        },
      });
    } catch (error) {
      return Response.json({ error: error instanceof TypeError ? error.message : 'Could not generate PDF' }, { status: error instanceof TypeError ? 400 : 500 });
    }
  };
}
