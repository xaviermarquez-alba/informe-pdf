import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createInformePdfServer,
  buildInformeDocuments,
  createInformePdfHandler,
  PAGE_COUNT_PLACEHOLDER,
  DEFAULT_FINAL_FOOTER,
  parsePayload,
} from '../dist/index.js';

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
  assert.ok(preliminary.html.includes(PAGE_COUNT_PLACEHOLDER));
  assert.ok(!preliminary.html.includes('Dra. Médica'));
  assert.equal(preliminary.footerText, undefined);
  const final = buildInformeDocuments({...report, firma:{...report.firma, imageUrl:'data:image/png;base64,AAAA'}}, content, {mode:'final'});
  assert.ok(!final.html.includes('Informe Preliminar'));
  assert.ok(!final.coverHtml.includes('Informe Preliminar'));
  assert.ok(final.html.includes('MP 456'));
  assert.ok(final.html.includes('data:image/png;base64,AAAA'));
  assert.equal(final.footerText, DEFAULT_FINAL_FOOTER);
});
test('final templates render resident and reporting physician signatures together', () => {
  const final = buildInformeDocuments({
    ...report,
    firmaResidente: {
      nombre: 'Dra. Residente',
      matricula: '789',
      imageUrl: 'data:image/png;base64,BBBB',
    },
  }, content, {mode:'final'});

  assert.match(final.html, /class="signatures"/);
  assert.match(final.html, /Dra\. Residente/);
  assert.match(final.html, /MP 789/);
  assert.match(final.html, />Medico<\/div>/);
  assert.match(final.html, /data:image\/png;base64,BBBB/);
  assert.ok(final.html.indexOf('Dra. Residente') < final.html.indexOf('Dra. Médica'));
});
test('payload rejects invalid structured fields before rendering', () => {
  assert.throws(() => parsePayload({}), /html is required/);
  assert.throws(() => parsePayload({ report, content, template: { mode: 'wrong' } }), /Invalid template mode/);
  assert.throws(() => parsePayload({ report: { ...report, firma: { nombre: 2 } }, content }), /firma/);
  assert.throws(() => parsePayload({ report: { ...report, firmaResidente: { nombre: 2 } }, content }), /firmaResidente/);
  assert.throws(() => parsePayload({ report, content, template: { bodyBackgroundUrl: 1 } }), /bodyBackgroundUrl/);
});
test('HTTP validates auth, payload and size before rendering', async () => {
  await withServer({maxBodyBytes:2048}, async url => {
    assert.equal((await fetch(url+'/health')).status,200);
    assert.equal((await fetch(url+'/health?ready=1')).status,200);
    assert.equal((await post(url, {}, 'wrong')).status,401);
    assert.equal((await post(url, {})).status,400);
    assert.equal((await post(url, {report, content, template:{mode:'wrong'}})).status,400);
    assert.equal((await post(url, {report:{...report,firma:{nombre:2}},content})).status,400);
    assert.equal((await post(url, {html:'x'.repeat(3000)})).status,413);
    assert.equal((await fetch(url+'/render')).status,405);
  });
});
test('HTTP renders structured final PDF with Unicode continuation, page numbers and signature', async () => {
  await withServer({}, async url => {
    const response = await post(url, {report,content,template:{mode:'final'}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/pdf');
    const text = await pdfText(Buffer.from(await response.arrayBuffer()));
    assert.match(text,/María Núñez/);
    assert.match(text,/Dra\. Médica/);
    assert.match(text,/MP 456/);
    assert.match(text,/Pagina 1 de 2/);
    assert.match(text,/firma electronica/);
    assert.doesNotMatch(text,/Informe Preliminar/);
    const pages = text.split('\f');
    assert.ok(pages[0].includes('María Núñez'));
    assert.ok(pages.some(p => p.includes('Pagina 2 de') && p.includes('María Núñez')));
  });
});
test('HTTP renders both resident and reporting physician at the end of a final report', async () => {
  await withServer({}, async url => {
    const response = await post(url, {
      report: {
        ...report,
        firmaResidente: { nombre: 'Dr. Residente', matricula: '789', especialidad: 'Medico Residente' },
      },
      content: '<p>Informe con dos profesionales</p>',
      template: {mode:'final'},
    });
    assert.equal(response.status, 200);
    const text = await pdfText(Buffer.from(await response.arrayBuffer()));
    assert.match(text, /Dr\. Residente/);
    assert.match(text, /MP 789/);
    assert.match(text, /Dra\. Médica/);
    assert.ok(text.indexOf('Dr. Residente') < text.indexOf('Dra. Médica'));
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
test('Next adapter merges environment defaults with explicit options', async () => {
  const previous = process.env.PDF_DISABLE_SANDBOX;
  process.env.PDF_DISABLE_SANDBOX = 'true';
  try {
    const response = await createInformePdfHandler({publicDir:process.cwd()})(new Request('http://localhost/pdf', {
      method:'POST', body:JSON.stringify({report,content:'<p>Next report</p>',template:{mode:'final'}}),
    }));
    assert.equal(response.status,200);
  } finally {
    if (previous === undefined) delete process.env.PDF_DISABLE_SANDBOX;
    else process.env.PDF_DISABLE_SANDBOX = previous;
  }
});
test('CLI renders JSON stdin to PDF stdout', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['dist/cli.js', 'render'], {
    env: { ...process.env, PDF_DISABLE_SANDBOX: 'true' },
  });
  const chunks = [];
  child.stdout.on('data', chunk => chunks.push(chunk));
  const stderr = [];
  child.stderr.on('data', chunk => stderr.push(chunk));
  child.stdin.end(JSON.stringify({ report, content: '<p>CLI report</p>', template: { mode: 'final' } }));
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.equal(code, 0, Buffer.concat(stderr).toString());
  const pdf = Buffer.concat(chunks);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(await pdfText(pdf), /CLI report/);
});
