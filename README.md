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

Install the generated `informe-pdf-0.3.0.tgz` from another Node.js project with `npm install /path/to/informe-pdf-0.3.0.tgz`.
That also installs the `informe-pdf` CLI. Python/Django/FastAPI hosts install Node 22, Chromium, qpdf and this package, then invoke the CLI; do not run a separate PDF process.
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

Raw HTML remains supported. For shared templates, use `buildInformeDocuments(report, content, template)`
and pass its result to `renderInformePdf`. The library now owns cover, CKEditor body,
first-page header, continuation headers and signature layout. Branding images are supplied by callers.

## Shared templates

```ts
import { buildInformeDocuments, renderInformePdf } from 'informe-pdf';

const documents = buildInformeDocuments({
  id: 'EXAMPLE-1',
  paciente: 'Paciente de ejemplo',
  servicio: 'TOMOGRAFIA COMPUTADA',
  fechaEstudio: '10-09-2026',
  horaEstudio: '10:30',
  firma: { nombre: 'Dra. Ejemplo', matricula: '123' },
  firmaResidente: { nombre: 'Dr. Residente', matricula: '456' },
}, '<p>Contenido del informe</p>', {
  mode: 'final',
  // coverBackgroundUrl: '/assets/informe/imageninforme1.png',
  // bodyBackgroundUrl: '/assets/informe/imageninforme2.png',
});
const { pdf } = await renderInformePdf(documents);
```

`InformeData` describes display-ready fields. Dates, timezone conversion, patient identity,
service labels and immutable finalized snapshots belong to the calling application.
Use the original medical snapshot when generating a historical report.
`preliminary` is the default: watermarks on cover/body and no signature or footer.
`final` removes watermarks and includes the supplied signature and legal footer by default.
`includeSignature` / `includeFooter` can override this; `firma.imageUrl` adds the reporting physician's image.
When the turno has an assigned resident, callers can provide `firmaResidente` with the same fields
(`nombre`, optional `matricula`, `especialidad` and `imageUrl`). Both signatures are kept together at
the end of the report, with the resident first and the reporting physician second.
`bodyBackgroundUrl` is an optional underlay for body pages; `coverBackgroundUrl` brands the cover.
This is visual signature rendering, not cryptographic PDF signing.

The Python ReportLab implementation used by TCSE is a separate package:
[informe-pdf-legacy](https://github.com/xaviermarquez-alba/informe-pdf-legacy).
Do not add ReportLab drawing to this repository.

The design follows the residence preview for drafts: cover background only, unbranded body,
first-page detailed header and simplified continuation headers. Final reports also fill
`Pagina 1 de N` after the body page count is known. Ghostscript optimization is not applied.
Applications are not automatically migrated and stored PDFs are not regenerated.

## CLI for Python, Django and FastAPI

Install the package on the same host as the application, then render one PDF per invocation:

```sh
npm install /path/to/informe-pdf-0.3.0.tgz
informe-pdf render --input examples/report.json --output informe.pdf
# or:
informe-pdf render < examples/report.json > informe.pdf
```

`CHROME_BIN`, `PDF_PUBLIC_DIR` and `PDF_DISABLE_SANDBOX=true` are read from the environment.
See [examples/client.py](examples/client.py). The JSON accepts `report`, `content` (trusted CKEditor HTML),
`template`, `filename` and `previewImages`. `template` may include `mode`, `includeSignature`,
`includeFooter`, `footerText`, `coverBackgroundUrl` and `bodyBackgroundUrl`. Raw `html` /
`coverHtml` / `continuationHeader` payloads remain valid. Application permissions, finalization,
file storage and database transactions stay in FastAPI/Django. Existing stored PDFs should still
be served without rendering again.

## Next.js route

```ts
import { createInformePdfHandler } from 'informe-pdf';
import { resolve } from 'node:path';

export const runtime = 'nodejs';
export const POST = createInformePdfHandler({ publicDir: resolve('public') });
```

The adapter runs in-process inside the existing Next.js app. Authenticate and authorize the
request in your application before calling the handler.

Other Node frameworks can call `renderInformePdf` or `generateInformePdf` directly.

## Rendering contract

- A4, print backgrounds enabled, CSS page size respected.
- Cover rendered separately and prepended to body.
- Continuation header on body pages 2 onward; numbering excludes the cover.
- First body page includes `Pagina 1 de N` after the page count is known.
- Final reports overlay the legal footer in the bottom margin unless `includeFooter` is false.
- Optional `bodyBackgroundUrl` is underlaid on body pages only.
- Header uses fixed A4 coordinates; reserve top space in your body CSS.
- Continuation headers render through Chromium, including Spanish accents and Unicode supported by installed fonts.
- `/assets/...` references can be embedded from `publicDir`; paths outside that directory are rejected.
- PNG previews use 110 DPI and include the cover.
- Browser and temporary files are cleaned up after each request.

## Deployment

Render trusted HTML only. Scripts and network resources in HTML execute/load in Chromium.
Install the library into the application image and invoke `informe-pdf render` (or
`generateInformePdf` in Node) per request. Do not deploy this package as its own always-on app.
The optional Docker image is a one-shot CLI (`docker run --rm -i informe-pdf render < payload.json > out.pdf`),
not a long-running service.
Sandbox is enabled by default. `PDF_DISABLE_SANDBOX=true` is available when the application
container cannot support the Chromium sandbox. Prefer embedded assets for reproducible PDFs.

The library throws render errors. The Next.js HTTP adapter returns generic 500 responses.
