# informe-pdf

Node.js/TypeScript library extracted from RIS Residencia's `POST /preinforme/pdf`.
Renders HTML reports to PDF with optional covers, continuation headers and PNG previews.
It does not depend on Next.js, a database, patient models or application credentials.

## Requirements

Node.js 22+, Chrome/Chromium, qpdf and Poppler utilities (`pdfunite`, `pdftoppm`, `pdftotext` for tests).
On Debian/Ubuntu: `apt-get install chromium qpdf poppler-utils`.
Set `CHROME_BIN` or pass `executablePath` if Chrome is not in a standard Linux location.
The package does not download a browser.

## Development and installation

```sh
npm ci
npm test
npm pack
```

Install the generated `informe-pdf-0.1.0.tgz` from another Node.js project with `npm install /path/to/informe-pdf-0.1.0.tgz`.
For GitHub distribution, attach that tarball to a release and install its URL or the downloaded file.
No npm publication or open-source license has been configured yet.

Install directly from the private GitHub repository using an authenticated SSH connection:

```sh
npm install git+ssh://git@github.com/xaviermarquez-alba/informe-pdf.git
```

Pin a commit or tag for reproducible installations. The prepare script builds the package during Git installation.

## Direct usage

```ts
import { renderInformePdf } from 'informe-pdf';
import { writeFile } from 'node:fs/promises';

const { pdf, pages } = await renderInformePdf({
  html: '<html><body><h1>Informe</h1><p>Report content</p></body></html>',
  coverHtml: '<html><body>Cover</body></html>',
  continuationHeader: {
    informeNumber: '123', paciente: 'Example Patient',
    fechaEstudio: '10/09/2026', horaEstudio: '10:00', documento: 'Example',
  },
  previewImages: true,
}, { publicDir: '/absolute/path/to/public' });
await writeFile('informe.pdf', pdf);
// pages contains ordered PNG data URLs when previewImages=true.
```

The caller supplies complete HTML/CSS, including page margins, fonts, signatures and branding.
Existing RIS HTML builders can pass their current HTML unchanged.
This package does not include those application-specific templates or logos.

## Next.js route

```ts
import { createInformePdfHandler } from 'informe-pdf';
import { resolve } from 'node:path';

export const runtime = 'nodejs';
export const POST = createInformePdfHandler({ publicDir: resolve('public') });
```

The adapter accepts the existing JSON fields: `html`, `coverHtml`, `continuationHeader`,
`previewImages`, and `filename`. It returns PDF bytes or `{ pages: string[] }`.
Authenticate and authorize the request in your application before calling the handler.

Other Node frameworks can call `renderInformePdf` directly. Python/Django/FastAPI
projects can use a Node HTTP service wrapping the handler; this is not a Python package.

## Rendering contract

- A4, print backgrounds enabled, CSS page size respected.
- Cover rendered separately and prepended to body.
- Continuation header on body pages 2 onward; numbering excludes the cover.
- Header uses fixed A4 coordinates; reserve top space in your body CSS.
- Original Helvetica overlay preserved; non-ASCII text needs further font/encoding work.
- `/assets/...` references can be embedded from `publicDir`; paths outside that directory are rejected.
- PNG previews use 110 DPI and include the cover.
- Browser and temporary files are cleaned up after each request.

## Deployment

Render trusted HTML only. Scripts and network resources in HTML execute/load in Chromium:
run rendering in an isolated worker with appropriate network restrictions and resource limits.
Set request-size, concurrency and timeout limits in the host application.
Sandbox is enabled by default. `disableSandbox: true` is available for an isolated container
whose runtime cannot support the Chromium sandbox.
Prefer embedded assets for reproducible PDFs.

The library throws render errors. The HTTP adapter returns generic 500 responses.
