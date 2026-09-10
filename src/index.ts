export { renderInformePdf } from './render.js';
export type { RenderInput, RenderOptions, RenderResult, ContinuationHeader } from './render.js';
export { createInformePdfHandler } from './http.js';
export {
  buildInformeDocuments,
  buildInformeCoverPdfDocument,
  buildInformeBodyPdfDocument,
  buildInformeSignature,
  buildContinuationHeaderPayload,
  buildContinuationHeaderDocument,
  buildBodyOverlayDocument,
  buildBodyBackgroundDocument,
  PAGE_COUNT_PLACEHOLDER,
  DEFAULT_FINAL_FOOTER,
} from './templates.js';
export type { InformeData, InformeSignature, TemplateOptions } from './templates.js';
export { generateInformePdf, renderInputFromPayload, defaultRenderOptions } from './generate.js';
export { parsePayload } from './payload.js';
export { createInformePdfServer } from './server.js';
export type { ServiceOptions } from './server.js';
