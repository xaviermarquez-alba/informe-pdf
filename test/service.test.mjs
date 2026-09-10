import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createInformePdfServer, buildInformeDocuments, createInformePdfHandler } from '../dist/index.js';

const report = {
  id: 'DEMO-1', paciente: 'María Núñez', fechaEstudio: '10-09-2026', horaEstudio: '11:30',
  identificacion_tipo: 'DU', identificacion_numero: 'DEMO',
  firma: { nombre: 'Dra. Médica', matricula: '456' },
};
const content = '<p>PRIMERA PAGINA</p><div style="break-before:page">SEGUNDA PAGINA</div>';
async function withServer(options, run) {
  const server = createInformePdfServer({ token: 'test-token', disableSandbox: true, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run('http://127.0.0.1:' + server.address().port); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
function post(url, payload, token = 'test-token') {
  return fetch(url + '/render', { method:'POST', headers: {
    'content-type':'application/json', authorization:'Bearer ' + token,
  }, body:JSON.stringify(payload) });
}
async function pdfText(bytes) {
  const directory = await mkdtemp(join(tmpdir(), 'pdf-service-test-'));
  try {
    const file = join(directory, 'report.pdf');
    await writeFile(file, bytes);
    return execFileSync('pdftotext', ['-layout', file, '-'], {encoding:'utf8'});
  } finally { await rm(directory, {recursive:true, force:true}); }
}
test('templates escape metadata, distinguish final/preliminary, support signature images', () => {
  const unsafe = {...report, paciente:'<script>alert(1)</script>'};
  const preliminary = buildInformeDocuments(unsafe, content);
  assert.ok(preliminary.coverHtml.includes('&lt;script&gt;'));
  assert.ok(preliminary.html.includes('Informe Preliminar'));
  assert.ok(!preliminary.html.includes('Dra. Médica'));
  const final = buildInformeDocuments({...report, firma:{...report.firma, imageUrl:'data:image/png;base64,AAAA'}}, content, {mode:'final'});
  assert.ok(!final.html.includes('Informe Preliminar'));
  assert.ok(!final.coverHtml.includes('Informe Preliminar'));
  assert.ok(final.html.includes('MP 456'));
  assert.ok(final.html.includes('data:image/png;base64,AAAA'));
});
test('HTTP validates auth, payload and size before rendering', async () => {
  await withServer({maxBodyBytes:2048}, async url => {
    assert.equal((await fetch(url+'/health')).status,200);
    assert.equal((await post(url, {}, 'wrong')).status,401);
    assert.equal((await post(url, {})).status,400);
    assert.equal((await post(url, {report, content, template:{mode:'wrong'}})).status,400);
    assert.equal((await post(url, {report:{...report,firma:{nombre:2}},content})).status,400);
    assert.equal((await post(url, {html:'x'.repeat(3000)})).status,413);
    assert.equal((await fetch(url+'/render')).status,405);
  });
});
test('HTTP renders structured final PDF with Unicode continuation and signature', async () => {
  await withServer({}, async url => {
    const response = await post(url, {report,content,template:{mode:'final'}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/pdf');
    const text = await pdfText(Buffer.from(await response.arrayBuffer()));
    assert.match(text,/María Núñez/);
    assert.match(text,/Dra\. Médica/);
    assert.match(text,/MP 456/);
    assert.doesNotMatch(text,/Informe Preliminar/);
    const pages = text.split('\f');
    assert.ok(pages[0].includes('María Núñez'));
    assert.ok(pages.some(p => p.includes('Pagina 2 de') && p.includes('María Núñez')));
  });
});
test('HTTP keeps raw HTML compatibility and structured PNG preview mode', async () => {
  await withServer({}, async url => {
    const raw = await post(url, {html:'<p>RAW HTML</p>'});
    assert.equal(raw.status,200);
    assert.match(await pdfText(Buffer.from(await raw.arrayBuffer())),/RAW HTML/);
    const preview = await post(url, {report,content:'<p>Preview</p>',previewImages:true});
    assert.equal(preview.status,200);
    const {pages} = await preview.json();
    assert.equal(pages.length, 2, 'short report must not generate an empty continuation page');
    assert.ok(pages.every(page => page.startsWith('data:image/png;base64,')));
  });
});
test('Next adapter accepts structured reports', async () => {
  const response = await createInformePdfHandler({disableSandbox:true})(new Request('http://localhost/pdf', {
    method:'POST', body:JSON.stringify({report,content:'<p>Next report</p>',template:{mode:'final'}}),
  }));
  assert.equal(response.status,200);
});
