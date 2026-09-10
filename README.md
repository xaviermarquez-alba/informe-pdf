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

Install the generated `informe-pdf-0.2.0.tgz` from another Node.js project with `npm install /path/to/informe-pdf-0.2.0.tgz`.
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
}, '<p>Contenido del informe</p>', {
  mode: 'final',
  // coverBackgroundUrl: '/assets/informe/imageninforme1.png',
});
const { pdf } = await renderInformePdf(documents);
```

`InformeData` describes display-ready fields. Dates, timezone conversion, patient identity,
service labels and immutable finalized snapshots belong to the calling application.
Use the original medical snapshot when generating a historical report.
`preliminary` is the default: watermarks on cover/body and no signature.
`final` removes watermarks and includes the supplied signature by default.
`includeSignature` can override this; `firma.imageUrl` adds the image.
This is visual signature rendering, not cryptographic PDF signing.

The design follows the residence preview: cover background only, unbranded body,
first-page detailed header and simplified continuation headers. It intentionally does not
reproduce Python's separate body background/footer layers or Ghostscript optimization.
Applications are not automatically migrated and stored PDFs are not regenerated.

## HTTP service for FastAPI and Django

```sh
npm ci
export PDF_SERVICE_TOKEN='replace-with-a-private-random-token'
npm start
```

By default it listens on `127.0.0.1:8090`. `GET /health` is a process liveness check.
`POST /render` requires `Authorization: Bearer <token>` and `Content-Type: application/json`.

```sh
curl --fail-with-body http://127.0.0.1:8090/render \
  -H "Authorization: Bearer $PDF_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @examples/report.json --output informe.pdf
```

The JSON accepts `report`, `content` (trusted CKEditor HTML), `template`, `filename`
and `previewImages`. It also accepts the old `html`/`coverHtml`/`continuationHeader`
payload. Responses are PDF bytes or JSON `{ pages: [...] }` for previews.
See [examples/report.json](examples/report.json) and [examples/client.py](examples/client.py)
for synchronous Django and asynchronous FastAPI clients.

For Docker:

```sh
export PDF_SERVICE_TOKEN='replace-with-a-private-random-token'
docker compose up --build -d
```

The image runs as a non-root user and includes Chromium, qpdf and Poppler.
Compose binds the port to loopback. On a shared Docker network, clients can use
`http://pdf:8090`; do not use `localhost` from a different container.
Mount branding assets read-only and configure `PDF_PUBLIC_DIR` if using `/assets/...`.

Configuration: `HOST`, `PORT`, `CHROME_BIN`, `PDF_SERVICE_TOKEN`, `PDF_PUBLIC_DIR`,
`PDF_DISABLE_SANDBOX`, `PDF_MAX_BODY_BYTES` (default 5 MiB), `PDF_MAX_CONCURRENT` (default 2).
The service returns 400 for invalid payloads, 401 for missing/invalid credentials,
413 for oversized requests, 415 for non-JSON content, 503 when busy and 500 for render failures.
Application permissions, finalization, file storage and database transactions remain in FastAPI/Django.
Existing stored PDFs should still be served without rendering again.

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
projects can call the included HTTP service; this is not a Python package.

## Rendering contract

- A4, print backgrounds enabled, CSS page size respected.
- Cover rendered separately and prepended to body.
- Continuation header on body pages 2 onward; numbering excludes the cover.
- Header uses fixed A4 coordinates; reserve top space in your body CSS.
- Continuation headers render through Chromium, including Spanish accents and Unicode supported by installed fonts.
- `/assets/...` references can be embedded from `publicDir`; paths outside that directory are rejected.
- PNG previews use 110 DPI and include the cover.
- Browser and temporary files are cleaned up after each request.

## Deployment

Render trusted HTML only. Scripts and network resources in HTML execute/load in Chromium:
run rendering in an isolated worker with appropriate network restrictions and resource limits.
The service bounds request size and concurrency; configure deployment-level render deadlines and network restrictions.
Incoming requests and browser content loads time out after 30 seconds; external PDF utilities after 60 seconds.
Sandbox is enabled by default. `disableSandbox: true` is available for an isolated container
whose runtime cannot support the Chromium sandbox.
Prefer embedded assets for reproducible PDFs.

The library throws render errors. The HTTP adapter returns generic 500 responses.
