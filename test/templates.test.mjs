import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReportHtml, buildBodyOverlayDocument } from '../dist/index.js';

test('keeps paragraphs, bold, lists, tables and images; drops every style and attribute', () => {
  const html =
    '<p class="MsoNormal" style="white-space:pre !important;font-size:0;color:white">Hallazgo <b>grave</b> <span style="display:none">oculto</span></p>' +
    '<ul style="margin-left:900px"><li><p>uno</p></li></ul>' +
    '<table width="900" style="position:absolute"><tbody><tr><td colspan="2" style="width:2000px" bgcolor="#ff0">celda</td></tr></tbody></table>' +
    '<figure class="image" style="width:50%"><img src="data:image/png;base64,AAAA" width="4000" style="height:9000px" onerror="x()"></figure>';
  assert.equal(
    sanitizeReportHtml(html),
    '<p>Hallazgo <strong>grave</strong> oculto</p>' +
      '<ul><li><p>uno</p></li></ul>' +
      '<table><tbody><tr><td colspan="2">celda</td></tr></tbody></table>' +
      '<figure style="width:50%"><img src="data:image/png;base64,AAAA" alt=""></figure>'
  );
});

test('keeps only a percentage image width from CKEditor resize', () => {
  const src = 'data:image/png;base64,AAAA';
  assert.equal(
    sanitizeReportHtml(`<img src="${src}" style="width:33.5%;height:900px"><figure style="width:500%"></figure><figure style="max-width:10%;color:red"></figure>`),
    `<img src="${src}" alt="" style="width:33.5%"><figure></figure><figure></figure>`
  );
});

test('unwraps unknown tags keeping their text, and keeps block breaks', () => {
  const html =
    '<!--[if gte mso 9]><xml>junk</xml><![endif]--><style>p{display:none}</style>' +
    '<h2 style="color:red">TÓRAX</h2><div>línea 1</div><div>línea 2</div>' +
    '<p><font face="Symbol">·</font><i>it</i><u>u</u><a href="http://x">link</a><o:p></o:p></p><pre>a   b</pre>' +
    '<img src="javascript:alert(1)"><script>alert(1)</script>';
  assert.equal(
    sanitizeReportHtml(html),
    '<p><strong>TÓRAX</strong></p><div>línea 1</div><div>línea 2</div><p>·itulink</p><div>a   b</div>'
  );
});

test('continuation header wraps long values instead of clipping them', () => {
  const paciente = 'MARIA DE LOS ANGELES GONZALEZ FERNANDEZ DE LA SANTISIMA TRINIDAD';
  const out = buildBodyOverlayDocument({ header: { paciente, documento: 'PASAPORTE: AB123456789012' }, pageCount: 2 });
  assert.ok(out.includes(paciente));
  assert.doesNotMatch(out, /overflow:hidden[^>]*>Paciente/, 'patient name must not be clipped');
});

test('signature cargo defaults to empty and escapes an explicit prefix', async () => {
  const { buildInformeSignature } = await import('../dist/templates.js');
  const signature = { nombre: 'Dr. Ejemplo' };
  assert.match(buildInformeSignature(signature), /<div>Diagnóstico por Imágenes<\/div>/);
  assert.match(buildInformeSignature({ ...signature, cargo: 'Esp.' }), /<div>Esp\. Diagnóstico por Imágenes<\/div>/);
  assert.match(buildInformeSignature({ ...signature, cargo: '<b>' }), /&lt;b&gt; Diagnóstico/);
  assert.match(buildInformeSignature({ ...signature, cargo: '' }), /<div>Diagnóstico por Imágenes<\/div>/);
});
