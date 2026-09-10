import { parsePayload, type PdfPayload } from './payload.js';
import { renderInformePdf, type RenderInput, type RenderOptions, type RenderResult } from './render.js';
import { buildInformeDocuments } from './templates.js';

export function renderInputFromPayload(payload: PdfPayload): RenderInput {
  if (payload.report) {
    return {
      ...buildInformeDocuments(payload.report, payload.content!, payload.template),
      previewImages: payload.previewImages,
    };
  }
  return {
    html: payload.html!,
    coverHtml: payload.coverHtml,
    continuationHeader: payload.continuationHeader,
    footerText: payload.footerText,
    bodyBackgroundUrl: payload.bodyBackgroundUrl,
    previewImages: payload.previewImages,
  };
}

export async function generateInformePdf(
  raw: unknown,
  options: RenderOptions = {}
): Promise<RenderResult & { filename: string }> {
  const payload = parsePayload(raw);
  const result = await renderInformePdf(renderInputFromPayload(payload), options);
  return { ...result, filename: payload.filename };
}

export function defaultRenderOptions(): RenderOptions {
  return {
    publicDir: process.env.PDF_PUBLIC_DIR,
    executablePath: process.env.CHROME_BIN,
    disableSandbox: process.env.PDF_DISABLE_SANDBOX === 'true',
  };
}
