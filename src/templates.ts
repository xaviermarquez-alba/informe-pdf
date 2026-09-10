import type { RenderInput, ContinuationHeader } from './render.js';

/** Separate A4 overlay: first body page blank, subsequent pages numbered. */
export function buildContinuationHeaderDocument(header: ContinuationHeader, pageCount: number): string {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new TypeError('Invalid page count');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size:A4; margin:0 }
    html,body { margin:0; padding:0 }
    section { height:297mm; width:210mm; position:relative; break-after:page; }
    section:last-child { break-after:auto }
    span { position:absolute; font: bold 11pt Arial,Helvetica,sans-serif; white-space:nowrap; }
  </style></head><body>${Array.from({length:pageCount}, (_, i) => `<section>${i === 0 ? '' : `
    <span style="left:28pt;top:118pt">INFORME No: ${escapeHtml(header.informeNumber)}</span>
    <span style="left:28pt;top:135pt">Fecha del Estudio: ${escapeHtml(header.fechaEstudio)}</span>
    <span style="left:250pt;top:135pt">Hora: ${escapeHtml(header.horaEstudio)}</span>
    <span style="right:28pt;top:135pt;font-size:10pt">Pagina ${i+1} de ${pageCount}</span>
    <span style="left:28pt;top:152pt;max-width:400pt;overflow:hidden">Paciente: ${escapeHtml(header.paciente)}</span>
    <span style="left:450pt;top:152pt">${escapeHtml(header.documento)}</span>
  `}</section>`).join('')}</body></html>`;
}

/** Display-ready values: caller controls date format, timezone and finalized snapshots. */
export interface InformeData {
  id: string | number;
  paciente: string;
  servicio?: string;
  informeNumber?: string | number;
  fechaEstudio?: string;
  horaEstudio?: string;
  fechaImpresion?: string;
  fechaNacimiento?: string;
  identificacion_tipo?: string;
  identificacion_numero?: string;
  sexo?: string;
  medico_solicitante?: string;
  protocolo?: string;
  codigos?: string;
  modalidadAcceso?: string;
  establecimiento?: string;
  firma?: { nombre: string; matricula?: string; especialidad?: string; imageUrl?: string };
}
export interface TemplateOptions {
  mode?: 'preliminary' | 'final';
  includeSignature?: boolean;
  coverBackgroundUrl?: string;
}
export function escapeHtml(value: unknown): string {
  return String(value ?? '---').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function assetUrl(value: string): string {
  if (!/^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,|\/assets\/)/i.test(value)) {
    throw new TypeError('Images must use HTTP(S), raster data URLs or /assets/ paths');
  }
  return value;
}
export function buildInformeSignature(firma: NonNullable<InformeData['firma']>): string {
  return `<section class="signature">
    ${firma.imageUrl ? `<img alt="" src="${escapeHtml(assetUrl(firma.imageUrl))}" style="display:block;max-width:190px;max-height:90px;object-fit:contain;margin-bottom:2px" />` : ''}
    <div>${escapeHtml(firma.nombre)}${firma.matricula ? ` - MP ${escapeHtml(firma.matricula)}` : ''}</div>
    <div>${escapeHtml(firma.especialidad || 'Esp. Diagnostico por Imagenes')}</div>
  </section>`;
}
export function buildContinuationHeaderPayload(data: InformeData) {
  return {
    informeNumber: data.informeNumber || data.id,
    fechaEstudio: data.fechaEstudio,
    horaEstudio: data.horaEstudio,
    paciente: data.paciente,
    documento: `${data.identificacion_tipo || '---'}: ${data.identificacion_numero || '---'}`,
  };
}
export function buildInformeDocuments(data: InformeData, content: string, options: TemplateOptions = {}): RenderInput {
  if (!data || !['string', 'number'].includes(typeof data.id) || typeof data.paciente !== 'string'
      || typeof content !== 'string' || !content.trim()) {
    throw new TypeError('report.id, report.paciente and non-empty content are required');
  }
  if (options.mode !== undefined && !['preliminary', 'final'].includes(options.mode)) {
    throw new TypeError('mode must be preliminary or final');
  }
  return {
    coverHtml: buildInformeCoverPdfDocument(data, options),
    html: buildInformeBodyPdfDocument(data, content, options),
    continuationHeader: buildContinuationHeaderPayload(data),
  };
}
export function buildInformeCoverPdfDocument(turno: InformeData, options: TemplateOptions = {}) {
  const serviceLabel = turno.servicio || 'INFORME MEDICO';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Informe ${escapeHtml(turno.id)} - portada</title>
    <style>
      @page {
        size: A4;
        margin: 0;
      }

      html,
      body {
        margin: 0;
        min-height: 297mm;
        padding: 0;
      }

      .cover {
        background: white;
        background-position: center;
        background-repeat: no-repeat;
        background-size: 210mm 297mm;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
        height: 297mm;
        position: relative;
        width: 210mm;
      }

      .cover-data {
        left: 0;
        position: absolute;
        right: 0;
        text-align: center;
        top: 201mm;
      }

      .patient {
        font-size: 18px;
        margin-bottom: 10px;
      }

      .service {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 12px;
      }

      .date {
        font-size: 12px;
      }

      .watermark {
        border: 3px solid rgba(174, 35, 35, 0.22);
        color: rgba(174, 35, 35, 0.18);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 34px;
        font-weight: 700;
        left: 50%;
        letter-spacing: 2px;
        padding: 10px 22px;
        position: absolute;
        text-transform: uppercase;
        top: 50%;
        transform: translate(-50%, -50%) rotate(-28deg);
        white-space: nowrap;
      }

      .watermark--top {
        top: 34%;
      }

      .watermark--bottom {
        top: 66%;
      }
    </style>
  </head>
  <body>
    <section class="cover">\n      ${options.coverBackgroundUrl ? `<img alt="" style="position:absolute;width:210mm;height:297mm;inset:0" src="${escapeHtml(assetUrl(options.coverBackgroundUrl))}" />` : ''}
      ${options.mode !== 'final' ? '<div class="watermark watermark--top">Informe Preliminar</div>' : ''}
      ${options.mode !== 'final' ? '<div class="watermark watermark--bottom">Informe Preliminar</div>' : ''}
      <div class="cover-data">
        <div class="patient">${escapeHtml(turno.paciente)}</div>
        <div class="service">${escapeHtml(serviceLabel)}</div>
        <div class="date">${escapeHtml(turno.fechaEstudio)}</div>
      </div>
    </section>
  </body>
</html>`;
}

export function buildInformeBodyPdfDocument(
  turno: InformeData,
  content?: string,
  options: TemplateOptions = {}
) {
  const html = content || '<p></p>';
  const informeNumber = turno.informeNumber || turno.id;
  const fechaEstudio = turno.fechaEstudio;
  const horaEstudio = turno.horaEstudio;
  const fechaImpresion = turno.fechaImpresion || '---';
  const medicoSolicitante = turno.medico_solicitante || '---';
  const medicoInformante = turno.firma?.nombre;
  const includeSignature = options.includeSignature ?? options.mode === 'final';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Informe ${escapeHtml(turno.id)}</title>
    <style>
      @page {
        size: A4;
        margin: 68mm 18mm 58mm;
      }

      @page:first {
        margin-top: 41mm;
        margin-right: 10mm;
        margin-bottom: 44mm;
        margin-left: 10mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
      }

      body {
        color: #111;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        line-height: 1.35;
        padding: 0;
      }

      .report-header {
        color: #000;
        font-size: 11px;
        line-height: 1.25;
        margin-bottom: 8mm;
      }

      .header-grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr 0.95fr;
        gap: 4px 12px;
      }

      .header-row-full {
        grid-column: 1 / -1;
      }

      .label {
        font-weight: 700;
      }

      .page-number {
        font-weight: 700;
        text-align: right;
      }

      .divider {
        border-top: 1px solid #111;
        margin-top: 16mm;
      }

      .ck-content {
        font-size: 11px;
        margin: 0 auto;
        max-width: 178mm;
      }

      .ck-content h1 {
        font-size: 15px;
      }

      .ck-content h2 {
        font-size: 13px;
      }

      .ck-content h3 {
        font-size: 12px;
      }

      .ck-content h1,
      .ck-content h2,
      .ck-content h3 {
        line-height: 1.2;
        margin: 10px 0 8px;
      }

      .ck-content p {
        margin: 0 0 8px;
      }

      .ck-content table {
        border-collapse: collapse;
        break-inside: avoid;
        margin: 10px 0;
        page-break-inside: avoid;
        width: 100%;
      }

      .ck-content td,
      .ck-content th {
        border: 1px solid #777;
        padding: 4px 6px;
        vertical-align: top;
      }

      .ck-content img {
        break-inside: avoid;
        height: auto;
        max-width: 100%;
        page-break-inside: avoid;
      }

      .ck-content figure {
        break-inside: avoid;
        margin: 10px 0;
        page-break-inside: avoid;
      }

      .signature {
        break-inside: avoid;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.25;
        margin-left: auto;
        margin-top: 24px;
        page-break-inside: avoid;
        width: 245px;
      }

      .watermark {
        border: 3px solid rgba(174, 35, 35, 0.2);
        color: rgba(174, 35, 35, 0.16);
        font-size: 34px;
        font-weight: 700;
        left: 50%;
        letter-spacing: 2px;
        padding: 10px 22px;
        position: fixed;
        text-transform: uppercase;
        top: 50%;
        transform: translate(-50%, -50%) rotate(-28deg);
        white-space: nowrap;
        z-index: 0;
      }

      .watermark--top {
        top: 34%;
      }

      .watermark--bottom {
        top: 66%;
      }
    </style>
  </head>
  <body>
    ${options.mode !== 'final' ? '<div class="watermark watermark--top">Informe Preliminar</div>' : ''}
    ${options.mode !== 'final' ? '<div class="watermark watermark--bottom">Informe Preliminar</div>' : ''}
    <header class="report-header">
      <div class="header-grid">
        <div class="header-row-full"><span class="label">PACIENTE:</span> ${escapeHtml(turno.paciente)}</div>
        <div><span class="label">INFORME No:</span> ${escapeHtml(informeNumber)}</div>
        <div></div>
        <div class="page-number"></div>
        <div><span class="label">${escapeHtml(turno.identificacion_tipo)}:</span> ${escapeHtml(
          turno.identificacion_numero
        )}</div>
        <div><span class="label">Fecha Nac:</span> ${escapeHtml(turno.fechaNacimiento)}</div>
        <div><span class="label">Sexo:</span> ${escapeHtml(turno.sexo || '---')}</div>
        <div><span class="label">Fecha del Estudio:</span> ${escapeHtml(fechaEstudio)}</div>
        <div><span class="label">Hora:</span> ${escapeHtml(horaEstudio)}</div>
        <div><span class="label">No Orden:</span> ${escapeHtml(turno.id)}-R</div>
        <div><span class="label">Protocolo No:</span> ${escapeHtml(
          turno.protocolo || '---'
        )}</div>
        <div><span class="label">Mod. Acceso:</span> ${escapeHtml(turno.modalidadAcceso || 'Ambulatorio')}</div>
        <div><span class="label">Fecha Impresion:</span> ${escapeHtml(fechaImpresion)}</div>
        <div class="header-row-full"><span class="label">MEDICO SOLICITANTE:</span> ${escapeHtml(
          medicoSolicitante
        )}</div>
        <div class="header-row-full"><span class="label">Establecimiento:</span> ${escapeHtml(turno.establecimiento || 'AMBULATORIO')}</div>
        <div class="header-row-full"><span class="label">CODIGOS:</span> ${escapeHtml(turno.codigos)}</div>
      </div>
      <div class="divider"></div>
    </header>
    <main class="ck-content">
      ${html}
      ${includeSignature && medicoInformante ? buildInformeSignature(turno.firma!) : ''}
    </main>
  </body>
</html>`;

}
