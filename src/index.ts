export { renderInformePdf } from './render.js';
export type { RenderInput, RenderOptions, RenderResult, ContinuationHeader } from './render.js';
export { createInformePdfHandler } from './http.js';
export { buildInformeDocuments, buildInformeCoverPdfDocument, buildInformeBodyPdfDocument, buildInformeSignature, buildContinuationHeaderPayload, buildContinuationHeaderDocument } from './templates.js';
export type { InformeData, TemplateOptions } from './templates.js';
export { createInformePdfServer } from './server.js';
export type { ServiceOptions } from './server.js';
