import { tmpdir } from 'os';
import { join, resolve, relative, isAbsolute } from 'path';
import { constants } from 'fs';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { chromium } from 'playwright-core';
import { buildContinuationHeaderDocument } from './templates.js';
import { rm, mkdir, access, realpath, readdir, readFile, writeFile } from 'fs/promises';

export interface RenderOptions {
  executablePath?: string;
  publicDir?: string;
  /** Only enable for trusted HTML in an isolated container. */
  disableSandbox?: boolean;
}
export interface RenderInput {
  html: string;
  coverHtml?: string;
  continuationHeader?: ContinuationHeader;
  previewImages?: boolean;
}
export type RenderResult = { pdf: Buffer; pages?: string[] };

const CHROME_EXECUTABLE_CANDIDATES = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter((path): path is string => Boolean(path));
const execFilePromise = promisify(execFile);
const execFileAsync = (file: string, args: string[]) => execFilePromise(file, args, { timeout: 60_000 });

export type ContinuationHeader = {
  informeNumber?: unknown;
  fechaEstudio?: unknown;
  horaEstudio?: unknown;
  paciente?: unknown;
  documento?: unknown;
};

async function resolveChromeExecutable(explicitPath?: string) {
  for (const executablePath of explicitPath ? [explicitPath] : CHROME_EXECUTABLE_CANDIDATES) {
    try {
      await access(executablePath, constants.X_OK);
      return executablePath;
    } catch {
      // Try the next known Chrome/Chromium path.
    }
  }

  throw new Error(
    `Chrome executable not found. Set CHROME_BIN or install one of: ${CHROME_EXECUTABLE_CANDIDATES.join(', ')}`
  );
}

function mimeTypeForAsset(assetPath: string) {
  const extension = assetPath.split('.').pop()?.toLowerCase();

  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'svg') return 'image/svg+xml';

  return 'application/octet-stream';
}

/**
 * Playwright setContent uses about:blank, so /assets/... would not resolve.
 * Inline public assets as data URLs so PDF generation works in containers
 * without depending on local file:// paths or networkidle on missing files.
 */
async function inlinePublicAssets(html: string, publicDir?: string) {
  if (!publicDir) return html;
  const root = await realpath(resolve(publicDir));
  const assetPaths = [...new Set(html.match(/\/assets\/[A-Za-z0-9._\-/]+/g) ?? [])];
  let result = html;

  for (const assetPath of assetPaths) {
    try {
      const filePath = await realpath(resolve(root, assetPath.replace(/^\//, '')));
      const relativePath = relative(root, filePath);
      if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('Asset outside publicDir');
      const data = await readFile(filePath);
      const dataUrl = `data:${mimeTypeForAsset(assetPath)};base64,${data.toString('base64')}`;

      result = result.split(assetPath).join(dataUrl);
    } catch {
      // Leave the original URL; renderPdf still uses waitUntil: 'load'.
    }
  }

  return result;
}

/**
 * Render trusted HTML into an A4 report, optionally with a cover and page previews.
 * Run server-side. Do not expose unrestricted rendering to untrusted users.
 */
export async function renderInformePdf(body: RenderInput, options: RenderOptions = {}): Promise<RenderResult> {
  if (!body || typeof body.html !== 'string' || !body.html.trim()) {
    throw new TypeError('html must be a non-empty string');
  }
  let browser;
  let tempDir: string | null = null;

  try {
    browser = await chromium.launch({
      executablePath: await resolveChromeExecutable(options.executablePath),
      headless: true,
      args: ['--disable-dev-shm-usage', ...(options.disableSandbox ? ['--no-sandbox'] : [])],
      chromiumSandbox: !options.disableSandbox,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);

    const renderPdf = async (html: string) => {
      // 'load' avoids hanging forever when an asset is missing; backgrounds are inlined above.
      await page.setContent(html, { waitUntil: 'load' });

      await page.evaluate(() => document.fonts.ready);
      return page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
    };

    const html = await inlinePublicAssets(body.html, options.publicDir);
    let pdf = await renderPdf(html);
    const hasContinuationHeader =
      body.continuationHeader !== null &&
      typeof body.continuationHeader === 'object' &&
      body.continuationHeader !== undefined;

    if (hasContinuationHeader || (typeof body.coverHtml === 'string' && body.coverHtml.trim())) {
      tempDir = join(tmpdir(), `residence-pdf-${randomUUID()}`);
      await mkdir(tempDir, { recursive: true });
    }

    if (tempDir && hasContinuationHeader) {
      const bodyPath = join(tempDir, 'body.pdf');
      const overlayPath = join(tempDir, 'continuation-header.pdf');
      const bodyWithHeaderPath = join(tempDir, 'body-with-continuation-header.pdf');

      await writeFile(bodyPath, pdf);

      try {
        const pageCountResult = await execFileAsync('qpdf', ['--show-npages', bodyPath]);
        const pageCount = Number.parseInt(pageCountResult.stdout.trim(), 10);

        if (Number.isFinite(pageCount) && pageCount > 1) {
          await writeFile(
            overlayPath,
            await renderPdf(buildContinuationHeaderDocument(body.continuationHeader as ContinuationHeader, pageCount))
          );
          await execFileAsync('qpdf', [
            bodyPath,
            '--overlay',
            overlayPath,
            '--',
            bodyWithHeaderPath,
          ]);
          pdf = await readFile(bodyWithHeaderPath);
        }
      } catch (error) {
        throw error;
      }
    }

    if (tempDir && typeof body.coverHtml === 'string' && body.coverHtml.trim()) {
      const coverHtml = await inlinePublicAssets(body.coverHtml as string, options.publicDir);
      const coverPdf = await renderPdf(coverHtml);
      const coverPath = join(tempDir, 'cover.pdf');
      const bodyPath = join(tempDir, 'body.pdf');
      const outputPath = join(tempDir, 'merged.pdf');

      await writeFile(coverPath, coverPdf);
      await writeFile(bodyPath, pdf);
      await execFileAsync('pdfunite', [coverPath, bodyPath, outputPath]);

      pdf = await readFile(outputPath);
    }

    if (body.previewImages === true) {
      if (!tempDir) {
        tempDir = join(tmpdir(), `residence-pdf-${randomUUID()}`);
        await mkdir(tempDir, { recursive: true });
      }

      const previewPdfPath = join(tempDir, 'preview.pdf');
      const imagePrefix = join(tempDir, 'preview-page');

      await writeFile(previewPdfPath, pdf);
      await execFileAsync('pdftoppm', ['-png', '-r', '110', previewPdfPath, imagePrefix]);

      const imageFiles = (await readdir(tempDir))
        .filter((file) => file.startsWith('preview-page') && file.endsWith('.png'))
        .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
      const pages = await Promise.all(
        imageFiles.map(async (file) => {
          const image = await readFile(join(tempDir as string, file));

          return `data:image/png;base64,${image.toString('base64')}`;
        })
      );

      return { pdf, pages };
    }

    return { pdf };
  } finally {
    try {
      await browser?.close();
    } finally {
      if (tempDir) await rm(tempDir, { recursive: true, force: true });
    }
  }
}
