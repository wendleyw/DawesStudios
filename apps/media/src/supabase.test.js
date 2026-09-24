import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { LIMITS } from './sanitize.js';
import { createBackend } from './supabase.js';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) };
});

const config = { supabaseUrl: 'http://supabase.test', anonKey: 'test-anon', serviceKey: 'test-service' };
const bytes = Buffer.alloc(256 * 1024, 73);
const expected = { sha256: createHash('sha256').update(bytes).digest('hex'), fileSize: bytes.length };
let directory;
let filePath;

beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), 'dawes-upload-unit-'));
  filePath = join(directory, 'video.mp4');
  await writeFile(filePath, bytes);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

function expectClosedFiles() {
  expect(createReadStream).toHaveBeenCalledTimes(1);
  const source = vi.mocked(createReadStream).mock.results[0].value;
  expect(source.destroyed).toBe(true);
  expect(source.closed).toBe(true);
}

describe('trusted streamed upload', () => {
  it('attests the uploaded bytes for both registrators without reopening the local file', async () => {
    const calls = [];
    let uploadedBytes = 0;
    const uploadHash = createHash('sha256');
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push({ url, init });
      if (url.includes('/storage/v1/object/')) {
        for await (const chunk of init.body) {
          uploadedBytes += chunk.byteLength;
          uploadHash.update(chunk);
        }
      }
      return new Response('{}', { status: 200 });
    }));
    const backend = createBackend(config);

    const uploaded = await backend.uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4');
    await unlink(filePath);
    await backend.registerSanitizedVideo('project', 'project/asset.mp4', uploaded, 'video/mp4', 'designer');
    await backend.registerCopied('project', 'published-assets', 'project/copy.mp4', uploaded, 'video/mp4', 'agency', {
      designId: 'design', path: 'project/asset.mp4',
    });

    expect(uploaded).toEqual(expected);
    expect(Object.isFrozen(uploaded)).toBe(true);
    expect(uploadedBytes).toBe(expected.fileSize);
    expect(uploadHash.digest('hex')).toBe(expected.sha256);
    const attestations = calls.filter(call => call.url.includes('/rest/v1/rpc/')).map(call => JSON.parse(call.init.body));
    expect(attestations).toHaveLength(2);
    for (const attestation of attestations) expect(attestation).toMatchObject({ p_sha256: expected.sha256, p_file_size: expected.fileSize });
    expect(attestations[0]).toMatchObject({ p_prepared_by: 'designer', p_storage_path: 'project/asset.mp4' });
    expect(attestations[1]).toMatchObject({ p_prepared_by: 'agency', p_source_design_id: 'design', p_source_path: 'project/asset.mp4' });
    expectClosedFiles();
    expect(vi.mocked(createReadStream).mock.results[0].value.bytesRead).toBe(bytes.length);
  });

  it.each(['none', 'prefix'])('rejects early HTTP success after reading %s of the body', async consumption => {
    const fetch = vi.fn(async (_url, init) => {
      if (consumption === 'prefix') await init.body.getReader().read();
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const backend = createBackend(config);

    await expect(backend.uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4'))
      .rejects.toMatchObject({ status: 502, message: 'The storage upload did not finish.' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expectClosedFiles();
  });

  it('closes the file after an HTTP rejection before the body is consumed', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('denied', { status: 403 }));
    vi.stubGlobal('fetch', fetch);

    await expect(createBackend(config).uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4'))
      .rejects.toMatchObject({ status: 403 });

    expect(fetch).toHaveBeenCalledTimes(1);
    expectClosedFiles();
  });

  it('never returns attestation metadata when a completed upload loses its response', async () => {
    const fetch = vi.fn(async (_url, init) => {
      for await (const chunk of init.body) void chunk;
      throw new TypeError('Connection lost');
    });
    vi.stubGlobal('fetch', fetch);

    await expect(createBackend(config).uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4'))
      .rejects.toThrow('Connection lost');

    expect(fetch).toHaveBeenCalledTimes(1);
    expectClosedFiles();
  });

  it('closes the descriptor when the request body is cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const reader = init.body.getReader();
      await reader.read();
      await reader.cancel();
      throw new DOMException('Transfer aborted', 'AbortError');
    }));

    await expect(createBackend(config).uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4'))
      .rejects.toMatchObject({ name: 'AbortError' });

    expectClosedFiles();
  });

  it('rejects a cancelled body even when the upstream reports HTTP success', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const reader = init.body.getReader();
      await reader.read();
      await reader.cancel();
      return new Response('{}', { status: 200 });
    }));

    await expect(createBackend(config).uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4'))
      .rejects.toMatchObject({ status: 502 });

    expectClosedFiles();
  });

  it('propagates a file read failure and cannot produce upload metadata', async () => {
    await unlink(filePath);
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      for await (const chunk of init.body) void chunk;
      return new Response('{}', { status: 200 });
    }));

    await expect(createBackend(config).uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4'))
      .rejects.toMatchObject({ code: 'ENOENT' });

    expectClosedFiles();
  });

  it('bounds the outgoing stream before hashing or forwarding an oversized chunk', async () => {
    // A synthetic chunk tests the production limit without allocating or reading a gigabyte.
    vi.mocked(createReadStream).mockReturnValueOnce(Readable.from([{ byteLength: LIMITS.videoBytes + 1 }]));
    const forwarded = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      for await (const chunk of init.body) forwarded.push(chunk);
      return new Response('{}', { status: 200 });
    }));

    await expect(createBackend(config).uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4'))
      .rejects.toMatchObject({ status: 413 });

    expect(forwarded).toEqual([]);
    expectClosedFiles();
  });

  it('rejects an empty file even after successful HTTP completion', async () => {
    await writeFile(filePath, Buffer.alloc(0));
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      for await (const chunk of init.body) void chunk;
      return new Response('{}', { status: 200 });
    }));

    await expect(createBackend(config).uploadFile('internal-assets', 'project/asset.mp4', filePath, 'video/mp4'))
      .rejects.toMatchObject({ status: 502 });

    expectClosedFiles();
  });
});

describe('video transfer statuses and the source lookup', () => {
  const projectId = '0f8f5a8e-3c55-4d9c-9d9e-4f0f6a2b1c3d';

  it('preserves a passthrough status instead of collapsing it to 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const backend = createBackend(config);
    await expect(backend.downloadToFile(
      `${projectId}/1b4e28ba-2fa1-11d2-883f-0016d3cca427.raw`, projectId, 'token', join(directory, 'missing.raw'),
    )).rejects.toMatchObject({ status: 404 });
  });

  it('passes source_path through to register_sanitized_video', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ url, body: init.body });
      return new Response('null', { status: 200 });
    }));
    const backend = createBackend(config);
    await backend.registerSanitizedVideo(projectId, `${projectId}/clean.mp4`, { sha256: 'a'.repeat(64), fileSize: 10 }, 'video/mp4', 'user-1', `${projectId}/raw.raw`);
    const rpcCall = calls.find(call => call.url.endsWith('/rest/v1/rpc/register_sanitized_video'));
    expect(JSON.parse(rpcCall.body).p_source_path).toBe(`${projectId}/raw.raw`);
  });

  it('finds an attested video by its source_path', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ url, body: init.body, authorization: init.headers.Authorization });
      return new Response(JSON.stringify([{ storage_path: `${projectId}/clean.mp4`, mime_type: 'video/mp4' }]), { status: 200 });
    }));
    const backend = createBackend(config);
    const found = await backend.findSanitizedVideoBySource(projectId, `${projectId}/raw.raw`);
    expect(found).toEqual({ storage_path: `${projectId}/clean.mp4`, mime_type: 'video/mp4' });
    expect(calls[0].url).toBe('http://supabase.test/rest/v1/rpc/find_sanitized_video_by_source');
    expect(JSON.parse(calls[0].body)).toEqual({ p_project_id: projectId, p_source_path: `${projectId}/raw.raw` });
    // The RPC is service_role only; the caller's own token would be refused on every upload.
    expect(calls[0].authorization).toBe('Bearer test-service');
  });

  it('returns null when no attested video matches the source_path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    const backend = createBackend(config);
    expect(await backend.findSanitizedVideoBySource(projectId, `${projectId}/raw.raw`)).toBeNull();
  });

  it('deletes a raw object from storage without touching the attestation RPCs', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body });
      return new Response('[]', { status: 200 });
    }));
    const backend = createBackend(config);
    await backend.discardRaw('internal-assets', `${projectId}/raw.raw`);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe('http://supabase.test/storage/v1/object/internal-assets');
    expect(JSON.parse(calls[0].body)).toEqual({ prefixes: [`${projectId}/raw.raw`] });
  });

  it('discards an attested stale output through the full attestation-aware path, and a raw upload through a plain storage delete', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body });
      if (url.endsWith('/rest/v1/rpc/list_stale_video_uploads')) {
        return new Response(JSON.stringify([
          { bucket_id: 'internal-assets', storage_path: `${projectId}/attested.mp4`, attested: true },
          { bucket_id: 'internal-assets', storage_path: `${projectId}/raw.raw`, attested: false },
        ]), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));
    const backend = createBackend(config);
    const results = await backend.cleanStaleVideoUploads();
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
    const attestationCalls = calls.filter(call => /rpc\/(discard_sanitized_asset|finalize_asset_discard)$/.test(call.url));
    expect(attestationCalls.map(call => JSON.parse(call.body).p_storage_path)).toEqual([`${projectId}/attested.mp4`, `${projectId}/attested.mp4`]);
    const deletes = calls.filter(call => call.method === 'DELETE' && call.url.endsWith('/storage/v1/object/internal-assets'));
    expect(deletes.map(call => JSON.parse(call.body).prefixes).flat().sort()).toEqual([`${projectId}/attested.mp4`, `${projectId}/raw.raw`]);
  });

  it('returns null rather than throwing when the RPC response body is a bare null', async () => {
    // The generic `POST /rest/v1/rpc/` stub every other test in server.test.js's sanitize-video
    // suite already relies on responds `jsonResponse(200, null)` for RPCs that return void. This
    // function calls a `returns table(...)` RPC through that same generic path whenever a test does
    // not stub it specifically, so it must tolerate a null body rather than crash on `rows[0]`.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })));
    const backend = createBackend(config);
    expect(await backend.findSanitizedVideoBySource(projectId, `${projectId}/raw.raw`)).toBeNull();
  });
});
