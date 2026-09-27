import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowedOrigins, createMediaServer, sweepStaleScratchDirectories } from './server.js';

describe('allowed browser origins', () => {
  it('answers the canonical workspace origin on its own', () => {
    expect([...allowedOrigins({ appOrigin: 'http://localhost:3003' })]).toEqual(['http://localhost:3003']);
  });

  it('adds the development origins a machine serves the same application from', () => {
    // A `next dev` beside the container is the case that produced a CORS failure in the browser:
    // the service answered 403 with no `Access-Control-Allow-Origin`, so the preflight never passed.
    const origins = allowedOrigins({ appOrigin: 'http://localhost:3003', additionalOrigins: 'http://localhost:3010,http://localhost:3000' });
    expect(origins.has('http://localhost:3010')).toBe(true);
    expect(origins.has('http://localhost:3000')).toBe(true);
    expect(origins.has('http://localhost:3003')).toBe(true);
  });

  it('separates entries on commas or whitespace and drops the empties', () => {
    const origins = allowedOrigins({ appOrigin: 'http://localhost:3003', additionalOrigins: ' http://localhost:3010 ,, \n http://localhost:3000 ' });
    expect([...origins]).toEqual(['http://localhost:3003', 'http://localhost:3010', 'http://localhost:3000']);
  });

  it('matches an origin whole rather than by prefix or suffix', () => {
    // The list is an allowlist, so anything it does not name is refused — including an origin that
    // merely starts or ends with one that is allowed.
    const origins = allowedOrigins({ appOrigin: 'http://localhost:3003' });
    expect(origins.has('http://localhost:30030')).toBe(false);
    expect(origins.has('https://localhost:3003')).toBe(false);
    expect(origins.has('http://evil.localhost:3003')).toBe(false);
    expect(origins.has('http://localhost:3003.evil.example')).toBe(false);
    expect(origins.has('https://untrusted.example')).toBe(false);
  });

  it('holds nothing when nothing is configured, so every origin is refused', () => {
    expect(allowedOrigins().size).toBe(0);
    expect(allowedOrigins({ additionalOrigins: '' }).size).toBe(0);
  });
});

// Final whole-branch review, follow-up to Critical 1: `media-scratch` is a persistent disk volume,
// not the tmpfs `/tmp` used to be, so a crashed request's scratch directory now survives a
// container restart instead of being wiped with it. This is the boot-time sweep that closes that
// leak, exercised against a throwaway directory rather than the process's real `tmpdir()` so the
// test cannot depend on, or pollute, whatever `TMPDIR` this run happens to have.
describe('sweepStaleScratchDirectories', () => {
  let root;

  beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'sweep-test-')); });
  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  it('removes every dawes-prefixed directory and leaves everything else alone', async () => {
    await mkdir(join(root, 'dawes-video-abc123'));
    await writeFile(join(root, 'dawes-video-abc123', 'in.mp4'), 'leftover');
    await mkdir(join(root, 'dawes-media-def456'));
    await mkdir(join(root, 'dawes-publish-ghi789'));
    await mkdir(join(root, 'not-dawes-unrelated'));
    await writeFile(join(root, 'dawes-not-a-directory'), 'a file, not a directory, sharing the prefix');

    const swept = await sweepStaleScratchDirectories(root);

    expect(swept).toBe(3);
    for (const name of ['dawes-video-abc123', 'dawes-media-def456', 'dawes-publish-ghi789'])
      await expect(stat(join(root, name))).rejects.toThrow();
    // Not swept: it does not match the prefix, or it is a file rather than a directory.
    await expect(stat(join(root, 'not-dawes-unrelated'))).resolves.toBeDefined();
    await expect(stat(join(root, 'dawes-not-a-directory'))).resolves.toBeDefined();
  });

  it('returns 0 for an empty or nonexistent directory rather than throwing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'sweep-empty-'));
    try {
      expect(await sweepStaleScratchDirectories(empty)).toBe(0);
      expect(await sweepStaleScratchDirectories(join(empty, 'does-not-exist'))).toBe(0);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

// `md5Uuid` mints a deterministic, UUID-shaped identifier from a label, so a test can refer to
// "project-1" and "project-2" without depending on a live database's generated ids.
function md5Uuid(label) {
  const hex = createHash('md5').update(label).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe('POST /covers/prepare and POST /covers/clear', () => {
  const config = { supabaseUrl: 'http://supabase.test', anonKey: 'anon-key', serviceKey: 'service-key', appOrigin: 'http://localhost:3003' };
  const agencyUserId = md5Uuid('dawes:agency');
  const projectId = md5Uuid('dawes:project-cover-1');
  let server;
  let baseUrl;
  let realFetch;
  let calls;

  beforeAll(async () => {
    realFetch = globalThis.fetch;
    server = createMediaServer(config);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await new Promise(resolve => server.close(resolve));
  });

  afterEach(() => { globalThis.fetch = realFetch; calls = undefined; });

  function stubSupabase(routes) {
    calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.startsWith(config.supabaseUrl)) return realFetch(input, init);
      const method = init.method ?? 'GET';
      const path = url.slice(config.supabaseUrl.length).split('?')[0];
      calls.push({ method, path, body: init.body });
      const key = `${method} ${path}`;
      const handler = routes[key] ?? routes[path];
      if (!handler) throw new Error(`Unstubbed Supabase call: ${key}`);
      if (init.body && typeof init.body.getReader === 'function') await new Response(init.body).arrayBuffer();
      return handler(url, init);
    };
  }

  function jsonResponse(status, body) {
    return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  function identityRoutes(userId, role) {
    return {
      'GET /auth/v1/user': () => jsonResponse(200, { id: userId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: userId, role }]),
    };
  }
  const authRoutes = identityRoutes(agencyUserId, 'agency');

  // A minimal valid 1x1 PNG, since `sanitizeCover` really decodes the bytes with `sharp`.
  const onePixelPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082', 'hex',
  );

  function postCover(query, body, contentType = 'image/png') {
    return fetch(`${baseUrl}/covers/prepare?${query}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': contentType },
      body,
    });
  }
  function clearCover(query) {
    return fetch(`${baseUrl}/covers/clear?${query}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
  }

  // Registers a handler for the randomly-generated upload path `saveSanitized` picks, scoped to
  // whichever bucket this test's route writes to.
  function withGeneratedUpload(routes, bucket, onUpload) {
    return new Proxy(routes, {
      get(target, key) {
        if (key in target) return target[key];
        if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/${bucket}/${projectId}/`))
          return (url, init) => onUpload(key.slice(`POST /storage/v1/object/${bucket}/`.length), init);
        return undefined;
      },
    });
  }

  it('sanitizes a PNG/JPEG/WebP body to PNG, saves it under project-covers/<projectId>/…, and attests it with p_bucket_id: project-covers', async () => {
    let uploadedPath;
    let uploadedMimeType;
    let registration;
    const routes = withGeneratedUpload({
      ...authRoutes,
      'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]),
      'POST /rest/v1/rpc/register_sanitized_asset': (url, init) => { registration = JSON.parse(init.body); return jsonResponse(200, null); },
      'POST /rest/v1/rpc/set_project_cover': () => jsonResponse(200, null),
    }, 'project-covers', (path, init) => { uploadedPath = path; uploadedMimeType = init.headers['Content-Type']; return jsonResponse(200, {}); });
    stubSupabase(routes);

    const response = await postCover(`projectId=${projectId}`, onePixelPng, 'image/png');
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.path).toMatch(new RegExp(`^${projectId}/.*\\.png$`));
    expect(uploadedPath).toBe(body.path);
    expect(uploadedMimeType).toBe('image/png');
    expect(registration).toMatchObject({ p_project_id: projectId, p_bucket_id: 'project-covers', p_storage_path: body.path, p_mime_type: 'image/png', p_source_design_id: null });
  });

  it('calls set_project_cover with the caller token and p_client_visible from the visible query parameter, defaulting to false', async () => {
    let setCoverInit;
    const routes = withGeneratedUpload({
      ...authRoutes,
      'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]),
      'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(200, null),
      'POST /rest/v1/rpc/set_project_cover': (url, init) => { setCoverInit = init; return jsonResponse(200, null); },
    }, 'project-covers', () => jsonResponse(200, {}));
    stubSupabase(routes);

    await postCover(`projectId=${projectId}`, onePixelPng, 'image/png');
    expect(setCoverInit.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(setCoverInit.body).p_client_visible).toBe(false);

    const visibleResponse = await postCover(`projectId=${projectId}&visible=true`, onePixelPng, 'image/png');
    const visibleBody = await visibleResponse.json();
    expect(JSON.parse(setCoverInit.body).p_client_visible).toBe(true);
    expect(visibleBody.clientVisible).toBe(true);
  });

  it('deletes the previous cover path that set_project_cover returns', async () => {
    const previousPath = `${projectId}/${md5Uuid('previous-cover')}.png`;
    const discardedPaths = [];
    const routes = withGeneratedUpload({
      ...authRoutes,
      'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]),
      'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(200, null),
      'POST /rest/v1/rpc/set_project_cover': () => jsonResponse(200, previousPath),
      'POST /rest/v1/rpc/discard_sanitized_asset': () => jsonResponse(200, null),
      'POST /rest/v1/rpc/finalize_asset_discard': () => jsonResponse(200, null),
      'DELETE /storage/v1/object/project-covers': (url, init) => { discardedPaths.push(...JSON.parse(init.body).prefixes); return jsonResponse(200, {}); },
    }, 'project-covers', () => jsonResponse(200, {}));
    stubSupabase(routes);

    const response = await postCover(`projectId=${projectId}`, onePixelPng, 'image/png');
    expect(response.status).toBe(201);
    expect(discardedPaths).toEqual([previousPath]);
  });

  // A transient failure discarding the OLD cover must never take the NEW, now-live cover down
  // with it: the database already points at `path`, so `path` is exactly what must survive here.
  it('keeps the new cover and does not discard it when discarding the previous cover fails', async () => {
    const previousPath = `${projectId}/${md5Uuid('previous-cover-discard-fails')}.png`;
    const discardedPaths = [];
    const stderr = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = chunk => { stderr.push(String(chunk)); return true; };
    try {
      const routes = withGeneratedUpload({
        ...authRoutes,
        'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]),
        'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(200, null),
        'POST /rest/v1/rpc/set_project_cover': () => jsonResponse(200, previousPath),
        // The previous cover's own discard lifecycle fails at its first step.
        'POST /rest/v1/rpc/discard_sanitized_asset': () => jsonResponse(500, { message: 'boom' }),
        'DELETE /storage/v1/object/project-covers': (url, init) => { discardedPaths.push(...JSON.parse(init.body).prefixes); return jsonResponse(200, {}); },
      }, 'project-covers', () => jsonResponse(200, {}));
      stubSupabase(routes);

      const response = await postCover(`projectId=${projectId}`, onePixelPng, 'image/png');
      const body = await response.json();
      expect(response.status).toBe(201);
      expect(body.path).toMatch(new RegExp(`^${projectId}/.*\\.png$`));
      // Nothing was deleted at all: the failed RPC step never reaches the storage DELETE, and the
      // new object this response names was never discarded.
      expect(discardedPaths).toEqual([]);
      expect(stderr.join('')).toMatch(/Previous cover discard failed/);
    } finally { process.stderr.write = originalWrite; }
  });

  it('discards the new object and returns 502 (the mapped status for a failed RPC) when set_project_cover fails', async () => {
    let uploadedPath;
    const discardedPaths = [];
    const routes = withGeneratedUpload({
      ...authRoutes,
      'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]),
      'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(200, null),
      'POST /rest/v1/rpc/set_project_cover': () => jsonResponse(500, { message: 'boom' }),
      'POST /rest/v1/rpc/discard_sanitized_asset': () => jsonResponse(200, null),
      'POST /rest/v1/rpc/finalize_asset_discard': () => jsonResponse(200, null),
      'DELETE /storage/v1/object/project-covers': (url, init) => { discardedPaths.push(...JSON.parse(init.body).prefixes); return jsonResponse(200, {}); },
    }, 'project-covers', path => { uploadedPath = path; return jsonResponse(200, {}); });
    stubSupabase(routes);

    const response = await postCover(`projectId=${projectId}`, onePixelPng, 'image/png');
    // `request()` collapses the failed RPC to 502; the point under test is that the new,
    // now-unreferenced object is cleaned up rather than left reachable but unattested to a cover.
    expect(response.status).toBe(502);
    expect(discardedPaths).toEqual([uploadedPath]);
  });

  it('rejects an unsupported content type with 415, and a missing or unknown project with 404', async () => {
    stubSupabase({ ...authRoutes, 'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]) });
    const unsupported = await postCover(`projectId=${projectId}`, Buffer.from('video bytes'), 'video/mp4');
    expect(unsupported.status).toBe(415);

    stubSupabase({ ...authRoutes, 'GET /rest/v1/projects': () => jsonResponse(200, []) });
    const missing = await postCover(`projectId=${projectId}`, onePixelPng, 'image/png');
    expect(missing.status).toBe(404);
  });

  it('clears the cover: calls clear_project_cover with the caller token and deletes the returned path', async () => {
    const removedPath = `${projectId}/${md5Uuid('cleared-cover')}.png`;
    let clearInit;
    const discardedPaths = [];
    stubSupabase({
      ...authRoutes,
      'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]),
      'POST /rest/v1/rpc/clear_project_cover': (url, init) => { clearInit = init; return jsonResponse(200, removedPath); },
      'POST /rest/v1/rpc/discard_sanitized_asset': () => jsonResponse(200, null),
      'POST /rest/v1/rpc/finalize_asset_discard': () => jsonResponse(200, null),
      'DELETE /storage/v1/object/project-covers': (url, init) => { discardedPaths.push(...JSON.parse(init.body).prefixes); return jsonResponse(200, {}); },
    });

    const response = await clearCover(`projectId=${projectId}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ cleared: true });
    expect(clearInit.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(clearInit.body)).toEqual({ p_project_id: projectId });
    expect(discardedPaths).toEqual([removedPath]);
  });

  it('returns { cleared: false } and deletes nothing when there was no cover to clear', async () => {
    stubSupabase({
      ...authRoutes,
      'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]),
      'POST /rest/v1/rpc/clear_project_cover': () => jsonResponse(200, null),
    });

    const response = await clearCover(`projectId=${projectId}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ cleared: false });
    expect(calls.some(call => call.method === 'DELETE')).toBe(false);
  });

  it('returns 404 for a missing or unknown project on clear', async () => {
    stubSupabase({ ...authRoutes, 'GET /rest/v1/projects': () => jsonResponse(200, []) });
    const response = await clearCover(`projectId=${projectId}`);
    expect(response.status).toBe(404);
  });
});

describe('the stale-asset sweep', () => {
  it('sweeps stale sanitized assets when the service starts', async () => {
    const realFetch = globalThis.fetch;
    const rpcs = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.startsWith('http://supabase.test')) return realFetch(input, init);
      rpcs.push(url.slice('http://supabase.test'.length));
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const server = createMediaServer({ supabaseUrl: 'http://supabase.test', anonKey: 'anon-key', serviceKey: 'service-key', appOrigin: 'http://localhost:3003' });
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(rpcs).toContain('/rest/v1/rpc/list_stale_sanitized_assets');
    } finally {
      globalThis.fetch = realFetch;
      server.close();
    }
  });
});
