import { tmpdir } from 'os';
import { join, resolve, relative, isAbsolute } from 'path';
import { constants } from 'fs';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { chromium } from 'playwright-core';
import { buildBodyBackgroundDocument, buildBodyOverlayDocument, PAGE_COUNT_PLACEHOLDER } from './templates.js';
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
  footerText?: string;
  bodyBackgroundUrl?: string;
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
    page.setDefaultTimeout(60_000);

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

    const hasPageCountPlaceholder = body.html.includes(PAGE_COUNT_PLACEHOLDER);
    const html = await inlinePublicAssets(
      hasPageCountPlaceholder ? body.html.replaceAll(PAGE_COUNT_PLACEHOLDER, '1') : body.html,
      options.publicDir
    );
    let pdf = await renderPdf(html);
    const hasContinuationHeader =
      body.continuationHeader !== null &&
      typeof body.continuationHeader === 'object' &&
      body.continuationHeader !== undefined;
    const footerText = typeof body.footerText === 'string' && body.footerText.trim() ? body.footerText.trim() : undefined;
    const bodyBackgroundUrl =
      typeof body.bodyBackgroundUrl === 'string' && body.bodyBackgroundUrl.trim()
        ? body.bodyBackgroundUrl.trim()
        : undefined;
    const hasCover = typeof body.coverHtml === 'string' && Boolean(body.coverHtml.trim());
    const needsWorkspace =
      hasPageCountPlaceholder ||
      hasContinuationHeader ||
      Boolean(footerText) ||
      Boolean(bodyBackgroundUrl) ||
      hasCover ||
      body.previewImages === true;

    if (needsWorkspace) {
      tempDir = join(tmpdir(), `residence-pdf-${randomUUID()}`);
      await mkdir(tempDir, { recursive: true });
    }

    const bodyPath = tempDir ? join(tempDir, 'body.pdf') : '';
    const writeBody = async (content: Buffer) => {
      await writeFile(bodyPath, content);
    };
    const pageCountOf = async (content: Buffer) => {
      await writeBody(content);
      const pageCountResult = await execFileAsync('qpdf', ['--show-npages', bodyPath]);
      const pageCount = Number.parseInt(pageCountResult.stdout.trim(), 10);
      if (!Number.isFinite(pageCount) || pageCount < 1) throw new Error('Could not determine PDF page count');
      return pageCount;
    };

    if (tempDir && hasPageCountPlaceholder) {
      const pageCount = await pageCountOf(pdf);
      if (pageCount !== 1) {
        pdf = await renderPdf(
          await inlinePublicAssets(body.html.replaceAll(PAGE_COUNT_PLACEHOLDER, String(pageCount)), options.publicDir)
        );
      }
    }

    if (tempDir && (hasContinuationHeader || footerText || bodyBackgroundUrl)) {
      const pageCount = await pageCountOf(pdf);

      if (bodyBackgroundUrl) {
        const backgroundPath = join(tempDir, 'body-background.pdf');
        const underlaidPath = join(tempDir, 'body-with-background.pdf');
        await writeFile(
          backgroundPath,
          await renderPdf(await inlinePublicAssets(buildBodyBackgroundDocument(bodyBackgroundUrl, pageCount), options.publicDir))
        );
        await execFileAsync('qpdf', [bodyPath, '--underlay', backgroundPath, '--', underlaidPath]);
        pdf = await readFile(underlaidPath);
        await writeBody(pdf);
      }

      if (footerText || (hasContinuationHeader && pageCount > 1)) {
        const overlayPath = join(tempDir, 'body-overlay.pdf');
        const bodyWithOverlayPath = join(tempDir, 'body-with-overlay.pdf');
        await writeFile(
          overlayPath,
          await renderPdf(
            await inlinePublicAssets(
              buildBodyOverlayDocument({
                header: hasContinuationHeader ? (body.continuationHeader as ContinuationHeader) : undefined,
                pageCount,
                footerText,
              }),
              options.publicDir
            )
          )
        );
        await execFileAsync('qpdf', [bodyPath, '--overlay', overlayPath, '--', bodyWithOverlayPath]);
        pdf = await readFile(bodyWithOverlayPath);
      }
    }

    if (tempDir && hasCover) {
      const coverHtml = await inlinePublicAssets(body.coverHtml as string, options.publicDir);
      const coverPdf = await renderPdf(coverHtml);
      const coverPath = join(tempDir, 'cover.pdf');
      const mergedBodyPath = join(tempDir, 'body.pdf');
      const outputPath = join(tempDir, 'merged.pdf');

      await writeFile(coverPath, coverPdf);
      await writeFile(mergedBodyPath, pdf);
      await execFileAsync('pdfunite', [coverPath, mergedBodyPath, outputPath]);

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
