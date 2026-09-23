/** Reproduce application read-byte counts for the historical and current upload/attestation flow. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baselineRef = 'c2eaac7';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'dawes-upload-benchmark-'));
const filePath = join(directory, 'probe.mp4');
const bytes = Buffer.alloc(4 * 1024 * 1024, 73);
const expectedHash = createHash('sha256').update(bytes).digest('hex');
const originalRead = fs.createReadStream;
const originalFetch = globalThis.fetch;
let readStreams = [];
let uploadedBytes = 0;
let attestation;

try {
  await writeFile(filePath, bytes);
  // Read the anchored baseline without modifying the worktree. The sanitizer's unchanged
  // limits/error type resolve locally; the measured methods are the exact historical source.
  const baselineSource = execFileSync('git', ['show', `${baselineRef}:apps/media/src/supabase.js`], {
    cwd: repository, encoding: 'utf8',
  }).replace("'./sanitize.js'", JSON.stringify(new URL('./sanitize.js', import.meta.url).href));
  fs.createReadStream = (...args) => {
    const stream = originalRead(...args);
    readStreams.push(stream);
    return stream;
  };
  syncBuiltinESMExports();
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('http://in-process.invalid/'), 'No live network is permitted');
    if (url.includes('/storage/v1/object/')) {
      for await (const chunk of options.body) uploadedBytes += chunk.byteLength;
    } else if (url.includes('/rest/v1/rpc/')) {
      attestation = JSON.parse(options.body);
    } else throw new Error('Unexpected benchmark operation');
    return new Response('{}', { status: 200 });
  };
  const baseline = await import('data:text/javascript;base64,' + Buffer.from(baselineSource).toString('base64'));
  const current = await import('./supabase.js');
  const results = [];
  for (const [version, module] of [['baseline', baseline], ['optimized', current]]) {
    const backend = module.createBackend({ supabaseUrl: 'http://in-process.invalid', anonKey: 'test', serviceKey: 'test' });
    for (const mode of ['sanitize', 'publish']) {
      readStreams = [];
      uploadedBytes = 0;
      attestation = undefined;
      const bucket = mode === 'sanitize' ? 'internal-assets' : 'published-assets';
      const uploaded = await backend.uploadFile(bucket, 'project/object.mp4', filePath, 'video/mp4');
      const registrationInput = version === 'baseline' ? filePath : uploaded;
      if (mode === 'sanitize') {
        await backend.registerSanitizedVideo('project', 'project/object.mp4', registrationInput, 'video/mp4', 'user');
      } else {
        await backend.registerCopied('project', bucket, 'project/object.mp4', registrationInput, 'video/mp4', 'user', {
          designId: 'design', path: 'project/source.mp4',
        });
      }
      const applicationReadBytes = readStreams.reduce((sum, stream) => sum + stream.bytesRead, 0);
      assert.equal(attestation.p_sha256, expectedHash);
      assert.equal(attestation.p_file_size, bytes.byteLength);
      assert.equal(uploadedBytes, bytes.byteLength);
      assert.equal(applicationReadBytes, bytes.byteLength * (version === 'baseline' ? 2 : 1));
      results.push({ version, mode, fileBytes: bytes.byteLength, fileReadStreams: readStreams.length,
        applicationReadBytes, uploadBytes: uploadedBytes, sha256: attestation.p_sha256, attestedFileSize: attestation.p_file_size });
    }
  }
  process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), baselineRef,
    command: 'node apps/media/src/upload-io.benchmark.js',
    transport: 'In-process fetch mock; no live network or user data',
    metric: 'Application file bytes read by upload plus attestation only; not physical disk I/O, latency, or the whole sanitization pipeline',
    fixture: '4 MiB of byte 73; temporary file removed after measurement',
    results, applicationReadReductionPercent: 50,
  }, null, 2) + '\n');
} finally {
  fs.createReadStream = originalRead;
  syncBuiltinESMExports();
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
