import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

test('CLI runs when invoked through an npm-style symlink', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'informe-cli-'));
  const symlinkPath = join(directory, 'informe-pdf');
  try {
    await symlink(cliPath, symlinkPath);
    const result = spawnSync(symlinkPath, ['render'], { input: 'not-json', encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid JSON payload/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
