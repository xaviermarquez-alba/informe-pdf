#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defaultRenderOptions, generateInformePdf } from './generate.js';

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'render') {
    process.stderr.write('Usage: informe-pdf render [--input file] [--output file] [--public-dir dir]\n');
    process.exitCode = 1;
    return;
  }
  const inputPath = arg('--input') ?? '-';
  const outputPath = arg('--output') ?? '-';
  const publicDir = arg('--public-dir');
  const source = inputPath === '-' ? await readStdin() : await readFile(inputPath, 'utf8');
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    process.stderr.write('Invalid JSON payload\n');
    process.exitCode = 1;
    return;
  }
  const result = await generateInformePdf(raw, {
    ...defaultRenderOptions(),
    ...(publicDir ? { publicDir } : {}),
  });
  if ((raw as { previewImages?: boolean }).previewImages === true) {
    const body = JSON.stringify({ pages: result.pages });
    if (outputPath === '-') process.stdout.write(body);
    else await writeFile(outputPath, body);
    return;
  }
  if (outputPath === '-') process.stdout.write(result.pdf);
  else await writeFile(outputPath, result.pdf);
}

if (isDirectRun()) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : 'Could not generate PDF') + '\n');
    process.exitCode = 1;
  });
}
