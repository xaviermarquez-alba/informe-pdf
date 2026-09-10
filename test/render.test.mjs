import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderInformePdf, createInformePdfHandler } from '../dist/index.js';

test('rejects empty HTML before launching a browser', async () => {
  await assert.rejects(renderInformePdf({ html: '' }), /non-empty/);
  const response = await createInformePdfHandler()(new Request('http://localhost/pdf', {
    method: 'POST', body: '{}',
  }));
  assert.equal(response.status, 400);
});

test('renders cover, multipage body, continuation header and PNG previews', async () => {
  const result = await renderInformePdf({
    html: '<html><style>@page { size:A4; margin: 70mm 10mm 10mm; }</style><body>FIRST BODY PAGE<div style="break-before:page">SECOND BODY PAGE</div></body></html>',
    coverHtml: '<html><body>REPORT COVER</body></html>',
    continuationHeader: { informeNumber: 'TEST-123', paciente: 'Test Patient' },
    previewImages: true,
  }, { disableSandbox: true });
  assert.equal(result.pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(result.pages.length, 3);
  assert.ok(result.pages.every(page => page.startsWith('data:image/png;base64,')));
  const directory = await mkdtemp(join(tmpdir(), 'informe-test-'));
  try {
    const file = join(directory, 'report.pdf');
    await writeFile(file, result.pdf);
    const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    const pages = text.split('\f');
    assert.match(pages[0], /REPORT COVER/);
    assert.match(pages[1], /FIRST BODY PAGE/);
    assert.doesNotMatch(pages[1], /TEST-123/);
    assert.match(pages[2], /SECOND BODY PAGE/);
    assert.match(pages[2], /TEST-123/);
    assert.match(pages[2], /Pagina 2 de 2/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
