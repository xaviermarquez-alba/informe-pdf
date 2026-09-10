import type { InformeData, TemplateOptions } from './templates.js';
import type { ContinuationHeader } from './render.js';

export interface PdfPayload {
  report?: InformeData;
  content?: string;
  template?: TemplateOptions;
  html?: string;
  coverHtml?: string;
  continuationHeader?: ContinuationHeader;
  footerText?: string;
  bodyBackgroundUrl?: string;
  previewImages?: boolean;
  filename: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parsePayload(value: unknown): PdfPayload {
  if (!object(value)) throw new TypeError('JSON object required');
  if (value.report !== undefined) {
    if (!object(value.report)) throw new TypeError('report must be an object');
    if (typeof value.content !== 'string' || !value.content.trim()) throw new TypeError('content is required');
    for (const [key, item] of Object.entries(value.report)) {
      if (key === 'firma' || key === 'firmaResidente') {
        if (!object(item) || typeof item.nombre !== 'string' || Object.values(item).some(v => typeof v !== 'string')) {
          throw new TypeError(`${key} must contain string fields including nombre`);
        }
      } else if (key === 'id' || key === 'informeNumber') {
        if (typeof item !== 'string' && typeof item !== 'number') throw new TypeError(key + ' must be text or number');
      } else if (typeof item !== 'string') throw new TypeError(key + ' must be text');
    }
  } else if (typeof value.html !== 'string' || !value.html.trim()) throw new TypeError('html is required');
  if (value.template !== undefined) {
    if (!object(value.template)) throw new TypeError('template must be an object');
    const t = value.template;
    if (t.mode !== undefined && t.mode !== 'preliminary' && t.mode !== 'final') throw new TypeError('Invalid template mode');
    if (t.includeSignature !== undefined && typeof t.includeSignature !== 'boolean') throw new TypeError('includeSignature must be boolean');
    if (t.includeFooter !== undefined && typeof t.includeFooter !== 'boolean') throw new TypeError('includeFooter must be boolean');
    if (t.footerText !== undefined && typeof t.footerText !== 'string') throw new TypeError('footerText must be text');
    if (t.coverBackgroundUrl !== undefined && typeof t.coverBackgroundUrl !== 'string') throw new TypeError('coverBackgroundUrl must be text');
    if (t.bodyBackgroundUrl !== undefined && typeof t.bodyBackgroundUrl !== 'string') throw new TypeError('bodyBackgroundUrl must be text');
  }
  if (value.previewImages !== undefined && typeof value.previewImages !== 'boolean') throw new TypeError('previewImages must be boolean');
  if (value.coverHtml !== undefined && typeof value.coverHtml !== 'string') throw new TypeError('coverHtml must be text');
  if (value.footerText !== undefined && typeof value.footerText !== 'string') throw new TypeError('footerText must be text');
  if (value.bodyBackgroundUrl !== undefined && typeof value.bodyBackgroundUrl !== 'string') throw new TypeError('bodyBackgroundUrl must be text');
  if (value.continuationHeader !== undefined && !object(value.continuationHeader)) throw new TypeError('continuationHeader must be an object');
  return {
    ...value,
    filename: typeof value.filename === 'string'
      ? value.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150) || 'informe' : 'informe',
  } as unknown as PdfPayload;
}
