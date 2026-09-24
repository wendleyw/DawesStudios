import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

describe('POST /designs/sanitize-video', () => {
  const config = { supabaseUrl: 'http://supabase.test', anonKey: 'anon-key', serviceKey: 'service-key', appOrigin: 'http://localhost:3003' };
  const agencyUserId = md5Uuid('dawes:agency');
  const projectId = md5Uuid('dawes:project-1');
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

  // Stubs the Supabase calls `createBackend` makes (auth, REST, storage) and lets a real request
  // through untouched, so `post()` below still reaches the real server started above. `routes` is
  // keyed by `METHOD path` (path without querystring); a request landing on no key is a test bug,
  // not a silent pass, so it throws.
  function stubSupabase(routes) {
    calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.startsWith(config.supabaseUrl)) return realFetch(input, init);
      const method = init.method ?? 'GET';
      const path = url.slice(config.supabaseUrl.length).split('?')[0];
      calls.push({ method, path });
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

  function post(path, body) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('refuses a raw path outside the named project', async () => {
    stubSupabase({ ...authRoutes });
    const response = await post('/designs/sanitize-video', {
      projectId,
      rawPath: `${md5Uuid('dawes:project-2')}/${md5Uuid('x')}.raw`,
      mimeType: 'video/mp4',
    });
    expect(response.status).toBe(400);
  });

  it('refuses a mime type outside the video allow-list', async () => {
    stubSupabase({ ...authRoutes });
    const response = await post('/designs/sanitize-video', {
      projectId,
      rawPath: `${projectId}/${md5Uuid('x')}.raw`,
      mimeType: 'video/quicktime',
    });
    expect(response.status).toBe(415);
  });

  // `RAW_VIDEO_PATH` (server.js) is deliberately narrower than `downloadToFile`'s own path check
  // in supabase.js, which also accepts `.mp4`/`.webm` because it is reused to fetch an
  // already-sanitized design asset during publication. If this route's own `.raw`-only check were
  // ever removed as apparently redundant with that one, a caller could name an already-extensioned
  // `rawPath` and have it copied into `internal-assets` without ever passing through
  // `sanitizeVideo` — bypassing the metadata-stripping guarantee this whole feature rests on.
  // These two cases are what would start passing (wrongly) if that happened, so they're what
  // stops the refactor: a valid, project-scoped path, a valid mime type, and only the extension
  // is wrong.
  it.each(['mp4', 'webm'])('refuses a rawPath already carrying a .%s extension instead of .raw', async extension => {
    stubSupabase({ ...authRoutes });
    const rawPath = `${projectId}/${md5Uuid('already-sanitized-looking')}.${extension}`;
    const response = await post('/designs/sanitize-video', {
      projectId,
      rawPath,
      mimeType: extension === 'mp4' ? 'video/mp4' : 'video/webm',
    });
    expect(response.status).toBe(400);
    // The property under test is not "this returns 400" but "an unsanitised, caller-supplied
    // video never reaches internal-assets" — a reimplementation that refused with the right
    // status after already downloading or uploading would still be a live bypass, and a status-
    // only assertion would not catch it. `calls` records every Supabase call attempted, whether
    // or not it was stubbed to succeed, so its absence here is proof nothing was fetched or
    // written, not just that the response looked right.
    expect(calls.some(call => call.method === 'GET' && call.path === `/storage/v1/object/authenticated/internal-assets/${rawPath}`)).toBe(false);
    expect(calls.some(call => call.method === 'POST' && call.path.startsWith('/storage/v1/object/internal-assets/'))).toBe(false);
  });

  describe('production access mirrors private.can_produce for a designer', () => {
    // Matches the real fixture pairing verified against the local database: `designer@dawes.local`
    // (Alex Morgan) is assigned to `e3347e2f-fd33-a8c0-800a-a4af0c224ff0` and NOT to
    // `19b68267-ec9c-7a9f-926c-828b7f882f22`, which belongs to the other seeded designer. `canProduce`
    // was exercised directly against the running local Supabase stack for both cases before writing
    // these stubbed equivalents; see the task report for that transcript.
    const designerUserId = md5Uuid('dawes:designer-1');
    const designerRoutes = identityRoutes(designerUserId, 'designer');
    const designerRawPath = `${projectId}/${md5Uuid('designer-raw')}.raw`;

    it('lets an assigned designer past the authorization check', async () => {
      stubSupabase({
        ...designerRoutes,
        'GET /rest/v1/project_assignments': () => jsonResponse(200, [{ project_id: projectId }]),
        // The project lookup itself is left unstubbed on purpose: reaching a 404 here (rather than
        // 403) is the proof that `canProduce` let the request through, without needing the full
        // download/sanitize/upload pipeline the happy-path test already covers.
        'GET /rest/v1/projects': () => jsonResponse(200, []),
      });
      const response = await post('/designs/sanitize-video', { projectId, rawPath: designerRawPath, mimeType: 'video/mp4' });
      expect(response.status).toBe(404);
      expect(calls.some(call => call.method === 'GET' && call.path === '/rest/v1/project_assignments')).toBe(true);
    });

    it('refuses a designer with no assignment on the project', async () => {
      stubSupabase({
        ...designerRoutes,
        'GET /rest/v1/project_assignments': () => jsonResponse(200, []),
      });
      const response = await post('/designs/sanitize-video', { projectId, rawPath: designerRawPath, mimeType: 'video/mp4' });
      expect(response.status).toBe(403);
      // Refused before ever asking whether the project exists.
      expect(calls.some(call => call.path === '/rest/v1/projects')).toBe(false);
    });
  });

  describe('once the project and the raw upload are accepted', () => {
    let rawBytes;
    let rawPath;

    beforeAll(async () => { rawBytes = await readFile(resolve(import.meta.dirname, 'fixtures/tagged.mp4')); });

    function baseRoutes() {
      rawPath = `${projectId}/${md5Uuid('raw-object')}.raw`;
      return {
        ...authRoutes,
        'GET /rest/v1/projects': () => jsonResponse(200, [{ id: projectId }]),
        [`GET /storage/v1/object/authenticated/internal-assets/${rawPath}`]: () =>
          new Response(rawBytes, { status: 200, headers: { 'content-length': String(rawBytes.length) } }),
      };
    }

    it('downloads the raw upload, sanitizes it, stores the clean copy and discards the raw object', async () => {
      const routes = baseRoutes();
      let uploadPath;
      let registration;
      // The upload path is a fresh random uuid, unknown ahead of time, so it is matched by prefix
      // rather than registered as an exact key.
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key in target) return target[key];
          if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/internal-assets/${projectId}/`)) {
            uploadPath = key.slice('POST /storage/v1/object/internal-assets/'.length);
            return () => jsonResponse(200, { Key: uploadPath });
          }
          // Captured separately from the generic RPC handler below so the attestation call's own
          // body -- not merely that some RPC fired -- can be asserted against.
          if (key === 'POST /rest/v1/rpc/register_sanitized_video')
            return (url, init) => { registration = JSON.parse(init.body); return jsonResponse(200, null); };
          if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
          if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) return () => jsonResponse(200, {});
          return undefined;
        },
      }));

      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.path.startsWith(`${projectId}/`)).toBe(true);
      expect(body.path.endsWith('.mp4')).toBe(true);
      expect(typeof body.durationSeconds).toBe('number');
      expect(body.width).toBeGreaterThan(0);
      expect(body.height).toBeGreaterThan(0);

      // The raw object's discard lifecycle (mark, delete, finalize) ran, and the clean object was
      // uploaded under a path distinct from the raw one.
      expect(calls.some(call => call.method === 'POST' && call.path === '/rest/v1/rpc/discard_sanitized_asset')).toBe(true);
      expect(calls.some(call => call.method === 'DELETE' && call.path === '/storage/v1/object/internal-assets')).toBe(true);
      expect(calls.some(call => call.method === 'POST' && call.path === '/rest/v1/rpc/finalize_asset_discard')).toBe(true);
      expect(calls.some(call => call.method === 'POST' && call.path === `/storage/v1/object/internal-assets/${body.path}`)).toBe(true);
      expect(body.path).not.toBe(rawPath);

      // Final whole-branch review, Critical 2: the clean object is attested before this response
      // is ever sent, under the exact identity and path the caller receives -- not a stand-in.
      expect(registration).toMatchObject({
        p_project_id: projectId, p_storage_path: body.path, p_mime_type: 'video/mp4',
        p_file_size: expect.any(Number), p_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_prepared_by: agencyUserId,
        // The raw path the output came from, so a retry of this upload can find it again.
        p_source_path: rawPath,
      });
      // The attestation call happens strictly after the clean object is durably uploaded, and
      // strictly before the raw object's discard: registering an object nobody has stored yet
      // would raise (the RPC checks `storage.objects` for a matching size), and discarding the
      // raw upload before attesting the clean copy would leave a window where a crash mid-request
      // loses both the raw bytes and any record that the clean ones were ever sanitised.
      const uploadIndex = calls.findIndex(call => call.method === 'POST' && call.path === `/storage/v1/object/internal-assets/${body.path}`);
      const registerIndex = calls.findIndex(call => call.method === 'POST' && call.path === '/rest/v1/rpc/register_sanitized_video');
      const rawDiscardIndex = calls.findIndex(call => call.method === 'POST' && call.path === '/rest/v1/rpc/discard_sanitized_asset');
      expect(uploadIndex).toBeGreaterThanOrEqual(0);
      expect(registerIndex).toBeGreaterThan(uploadIndex);
      expect(rawDiscardIndex).toBeGreaterThan(registerIndex);
    });

    it('discards the clean object and fails the request when attestation registration fails', async () => {
      const routes = baseRoutes();
      let uploadPath;
      let discardedPaths = [];
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key in target) return target[key];
          if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/internal-assets/${projectId}/`)) {
            uploadPath = key.slice('POST /storage/v1/object/internal-assets/'.length);
            return () => jsonResponse(200, { Key: uploadPath });
          }
          if (key === 'POST /rest/v1/rpc/register_sanitized_video') return () => jsonResponse(500, { message: 'boom' });
          if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
          if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) {
            return (url, init) => { discardedPaths.push(JSON.parse(init.body).prefixes); return jsonResponse(200, {}); };
          }
          return undefined;
        },
      }));

      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      // `request()` collapses the failed RPC to 502, and the route reports that storage-class
      // failure as a retryable 503: the raw upload is still there for the browser's retry.
      expect(response.status).toBe(503);
      // The clean object this response would otherwise have named is discarded rather than left
      // reachable-but-unattested -- exactly the gap this attestation exists to close.
      expect(discardedPaths.flat()).toContain(uploadPath);
      // The raw upload is untouched: this failure is the media service's own, not something the
      // caller should have to re-upload for.
      expect(discardedPaths.flat()).not.toContain(rawPath);
    });

    it('still returns the sanitized asset when discarding the raw object fails', async () => {
      const routes = baseRoutes();
      const stderr = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = chunk => { stderr.push(String(chunk)); return true; };
      try {
        stubSupabase(new Proxy(routes, {
          get(target, key) {
            if (key in target) return target[key];
            if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/internal-assets/${projectId}/`)) return () => jsonResponse(200, {});
            // The raw discard's first RPC step fails; the clean asset is already durably stored.
            if (key === 'POST /rest/v1/rpc/discard_sanitized_asset') return () => jsonResponse(500, { message: 'boom' });
            if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
            if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) return () => jsonResponse(200, {});
            return undefined;
          },
        }));

        const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body.path.startsWith(`${projectId}/`)).toBe(true);
        // The raw object was never actually removed from storage, so nothing calls DELETE.
        expect(calls.some(call => call.method === 'DELETE' && call.path === '/storage/v1/object/internal-assets')).toBe(false);
        expect(stderr.join('')).toMatch(/Raw video discard failed/);
      } finally { process.stderr.write = originalWrite; }
    });

    it('discards a possibly-partial clean object and preserves the raw upload when the upload fails', async () => {
      const routes = baseRoutes();
      let uploadPath;
      let discardedPaths = [];
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key in target) return target[key];
          if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/internal-assets/${projectId}/`)) {
            uploadPath = key.slice('POST /storage/v1/object/internal-assets/'.length);
            return () => jsonResponse(502, { message: 'upload interrupted' });
          }
          if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
          if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) {
            return (url, init) => { discardedPaths.push(JSON.parse(init.body).prefixes); return jsonResponse(200, {}); };
          }
          return undefined;
        },
      }));

      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      // A storage failure is transient, so it is 503 (retried by the browser), not a bare 502.
      expect(response.status).toBe(503);
      // The failed upload's own (possibly partial) path was cleaned up best-effort...
      expect(discardedPaths.flat()).toContain(uploadPath);
      // ...and the raw object — the user's original upload — was never touched.
      expect(discardedPaths.flat()).not.toContain(rawPath);
    });

    it('returns 422 and discards the raw upload for content ffprobe rejects', async () => {
      const routes = baseRoutes();
      let discardedPaths = [];
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key === `GET /storage/v1/object/authenticated/internal-assets/${rawPath}`) return () => new Response(Buffer.from('not a video'), { status: 200, headers: { 'content-length': '11' } });
          if (key in target) return target[key];
          if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
          if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) {
            return (url, init) => { discardedPaths.push(JSON.parse(init.body).prefixes); return jsonResponse(200, {}); };
          }
          return undefined;
        },
      }));
      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      expect(response.status).toBe(422);
      expect(discardedPaths.flat()).toContain(rawPath);
    });

    it('returns 410 for a raw upload that no longer exists in storage', async () => {
      const routes = baseRoutes();
      stubSupabase({
        ...routes,
        'POST /rest/v1/rpc/find_sanitized_video_by_source': () => jsonResponse(200, []),
        [`GET /storage/v1/object/authenticated/internal-assets/${rawPath}`]: () => new Response('not found', { status: 404 }),
      });
      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      expect(response.status).toBe(410);
    });

    it('returns 503 and keeps the raw upload when storage fails during the download', async () => {
      const routes = baseRoutes();
      stubSupabase({
        ...routes,
        'POST /rest/v1/rpc/find_sanitized_video_by_source': () => jsonResponse(200, []),
        [`GET /storage/v1/object/authenticated/internal-assets/${rawPath}`]: () => new Response('upstream down', { status: 500 }),
      });
      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      expect(response.status).toBe(503);
      expect(calls.some(call => call.method === 'DELETE')).toBe(false);
    });

    it('returns 504 and keeps the raw upload when the download times out', async () => {
      const routes = baseRoutes();
      stubSupabase({
        ...routes,
        'POST /rest/v1/rpc/find_sanitized_video_by_source': () => jsonResponse(200, []),
        [`GET /storage/v1/object/authenticated/internal-assets/${rawPath}`]: () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); },
      });
      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      expect(response.status).toBe(504);
      expect(calls.some(call => call.method === 'DELETE')).toBe(false);
    });

    // A disconnect is not a cancel: the browser's automatic retry reuses the raw upload, so a
    // dropped connection stops the work in flight but never discards the raw file.
    function disconnectable(body) {
      const controller = new AbortController();
      const request = fetch(`${baseUrl}/designs/sanitize-video`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return { request, disconnect: () => controller.abort() };
    }
    const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
    function rawLifecycleCalls() {
      return calls.filter(call => (call.method === 'POST' && ['/rest/v1/rpc/discard_sanitized_asset', '/rest/v1/rpc/register_sanitized_video'].includes(call.path))
        || call.method === 'DELETE'
        || (call.method === 'POST' && call.path.startsWith('/storage/v1/object/internal-assets/')));
    }

    it('aborts the download, keeps the raw file and registers nothing when the client disconnects mid-download', async () => {
      const routes = baseRoutes();
      let downloadStarted;
      const started = new Promise(resolve => { downloadStarted = resolve; });
      let serverAborted;
      const aborted = new Promise(resolve => { serverAborted = resolve; });
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key === `GET /storage/v1/object/authenticated/internal-assets/${rawPath}`) {
            return (url, init) => new Promise((resolve, reject) => {
              downloadStarted();
              init.signal.addEventListener('abort', () => { serverAborted(); reject(init.signal.reason); });
            });
          }
          if (key in target) return target[key];
          if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
          return undefined;
        },
      }));
      const { request, disconnect } = disconnectable({ projectId, rawPath, mimeType: 'video/mp4' });
      await started;
      disconnect();
      await expect(request).rejects.toThrow();
      // The server stops its own download rather than streaming a gigabyte for nobody.
      await expect(Promise.race([aborted.then(() => 'aborted'), settle(2_000).then(() => 'still downloading')])).resolves.toBe('aborted');
      await settle(100);
      expect(rawLifecycleCalls()).toEqual([]);
    });

    it('kills ffmpeg, keeps the raw file and registers nothing when the client disconnects mid-remux', async () => {
      // A stand-in ffmpeg that records its pid and blocks, so the disconnect lands mid-remux
      // deterministically. The real ffprobe still runs first, found further along PATH.
      const bin = await mkdtemp(join(tmpdir(), 'fake-ffmpeg-'));
      await writeFile(join(bin, 'ffmpeg'), '#!/bin/sh\necho $$ > "$(dirname "$0")/pid"\nexec sleep 30\n');
      await chmod(join(bin, 'ffmpeg'), 0o755);
      const realPath = process.env.PATH;
      process.env.PATH = `${bin}:${realPath}`;
      // A hang-up is routine, so it must not be logged as an unexpected processing failure.
      const logged = [];
      const realWrite = process.stderr.write;
      process.stderr.write = (chunk, ...rest) => { logged.push(String(chunk)); return realWrite.call(process.stderr, chunk, ...rest); };
      try {
        const routes = baseRoutes();
        stubSupabase(new Proxy(routes, {
          get(target, key) {
            if (key in target) return target[key];
            if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
            if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) return () => jsonResponse(200, {});
            return undefined;
          },
        }));
        const { request, disconnect } = disconnectable({ projectId, rawPath, mimeType: 'video/mp4' });
        let pid;
        for (let waited = 0; !pid && waited < 10_000; waited += 25) {
          await settle(25);
          pid = Number(await readFile(join(bin, 'pid'), 'utf8').catch(() => '')) || undefined;
        }
        expect(pid).toBeGreaterThan(0);
        disconnect();
        await expect(request).rejects.toThrow();
        let alive = true;
        for (let waited = 0; alive && waited < 2_000; waited += 25) {
          await settle(25);
          try { process.kill(pid, 0); } catch { alive = false; }
        }
        expect(alive).toBe(false);
        await settle(100);
        expect(rawLifecycleCalls()).toEqual([]);
        expect(logged.filter(line => line.includes('Unexpected media processing failure'))).toEqual([]);
      } finally {
        process.stderr.write = realWrite;
        process.env.PATH = realPath;
        await rm(bin, { recursive: true, force: true });
      }
    });

    it('returns the existing attested output without re-running ffmpeg when one is found for this source_path', async () => {
      const routes = baseRoutes();
      const cleanPath = `${projectId}/${md5Uuid('already-clean')}.mp4`;
      let ffmpegRequested = false;
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key in target) return target[key];
          if (key === 'POST /rest/v1/rpc/find_sanitized_video_by_source') return () => jsonResponse(200, [{ storage_path: cleanPath, mime_type: 'video/mp4' }]);
          if (key === `GET /storage/v1/object/authenticated/internal-assets/${cleanPath}`) return () => new Response(rawBytes, { status: 200, headers: { 'content-length': String(rawBytes.length) } });
          if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/internal-assets/${projectId}/`)) { ffmpegRequested = true; return () => jsonResponse(200, {}); }
          if (typeof key === 'string' && key.startsWith(`POST /rest/v1/rpc/`)) return () => jsonResponse(200, null);
          if (typeof key === 'string' && key.startsWith(`DELETE /storage/v1/object/internal-assets`)) return () => jsonResponse(200, {});
          return undefined;
        },
      }));
      const response = await post('/designs/sanitize-video', { projectId, rawPath, mimeType: 'video/mp4' });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.path).toBe(cleanPath);
      expect(typeof body.durationSeconds).toBe('number');
      // No fresh clean object was ever uploaded: the existing attestation's path was returned
      // as-is, proving ffmpeg did not run a second time.
      expect(ffmpegRequested).toBe(false);
      expect(calls.some(call => call.method === 'POST' && call.path === '/rest/v1/rpc/register_sanitized_video')).toBe(false);
    });
  });
});

describe('POST /designs/discard-raw', () => {
  const config = { supabaseUrl: 'http://supabase.test', anonKey: 'anon-key', serviceKey: 'service-key', appOrigin: 'http://localhost:3003' };
  const agencyUserId = md5Uuid('dawes:agency');
  const projectId = md5Uuid('dawes:project-1');
  let server, baseUrl, realFetch, calls;

  beforeAll(async () => {
    realFetch = globalThis.fetch;
    server = createMediaServer(config);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { globalThis.fetch = realFetch; await new Promise(resolve => server.close(resolve)); });
  afterEach(() => { globalThis.fetch = realFetch; calls = undefined; });

  function stubSupabase(routes) {
    calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.startsWith(config.supabaseUrl)) return realFetch(input, init);
      const method = init.method ?? 'GET';
      const path = url.slice(config.supabaseUrl.length).split('?')[0];
      calls.push({ method, path });
      const handler = routes[`${method} ${path}`] ?? routes[path];
      if (!handler) throw new Error(`Unstubbed Supabase call: ${method} ${path}`);
      return handler(url, init);
    };
  }
  function jsonResponse(status, body) { return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
  function post(body) {
    return fetch(`${baseUrl}/designs/discard-raw`, {
      method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  }

  it('deletes the named raw object once production access is confirmed', async () => {
    const rawPath = `${projectId}/${md5Uuid('raw-object')}.raw`;
    let deletedPrefixes;
    stubSupabase({
      'GET /auth/v1/user': () => jsonResponse(200, { id: agencyUserId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: agencyUserId, role: 'agency' }]),
      [`DELETE /storage/v1/object/internal-assets`]: (url, init) => { deletedPrefixes = JSON.parse(init.body).prefixes; return jsonResponse(200, {}); },
    });
    const response = await post({ projectId, rawPath });
    expect(response.status).toBe(200);
    expect((await response.json()).discarded).toBe(true);
    expect(deletedPrefixes).toEqual([rawPath]);
  });

  it('succeeds when the raw object is already gone, so a repeated cancel is safe', async () => {
    const rawPath = `${projectId}/${md5Uuid('already-gone')}.raw`;
    stubSupabase({
      'GET /auth/v1/user': () => jsonResponse(200, { id: agencyUserId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: agencyUserId, role: 'agency' }]),
      // Storage answers a delete of a missing object with an empty list, not an error.
      [`DELETE /storage/v1/object/internal-assets`]: () => jsonResponse(200, []),
    });
    const response = await post({ projectId, rawPath });
    expect(response.status).toBe(200);
  });

  it('refuses a rawPath outside the named project', async () => {
    stubSupabase({
      'GET /auth/v1/user': () => jsonResponse(200, { id: agencyUserId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: agencyUserId, role: 'agency' }]),
    });
    const response = await post({ projectId, rawPath: `${md5Uuid('dawes:project-2')}/${md5Uuid('x')}.raw` });
    expect(response.status).toBe(400);
    expect(calls.some(call => call.method === 'DELETE')).toBe(false);
  });

  it('refuses a designer with no assignment on the project', async () => {
    const designerUserId = md5Uuid('dawes:designer-1');
    stubSupabase({
      'GET /auth/v1/user': () => jsonResponse(200, { id: designerUserId }),
      'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: designerUserId, role: 'designer' }]),
      'GET /rest/v1/project_assignments': () => jsonResponse(200, []),
    });
    const response = await post({ projectId, rawPath: `${projectId}/${md5Uuid('x')}.raw` });
    expect(response.status).toBe(403);
    expect(calls.some(call => call.method === 'DELETE')).toBe(false);
  });
});

// There is no pre-existing suite for this route to extend — the brief describing this task
// claimed one and pointed at it, but this file had no `/publications/prepare` coverage at all
// before this task. This block is written fresh, following the stubbing style
// `describe('POST /designs/sanitize-video', ...)` above already established (`stubSupabase`,
// `jsonResponse`, `identityRoutes`, a proxy match for an upload path unknown ahead of time).
describe('POST /publications/prepare', () => {
  const config = { supabaseUrl: 'http://supabase.test', anonKey: 'anon-key', serviceKey: 'service-key', appOrigin: 'http://localhost:3003' };
  const agencyUserId = md5Uuid('dawes:agency');
  const projectId = md5Uuid('dawes:project-publish-1');
  const versionId = md5Uuid('dawes:version-publish-1');
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

  function post(path, body) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // Matches the shape `/publications/prepare` reads: a version's designs, each carrying the
  // `internal_asset_path` the route decides how to process.
  function versionRoutes(designs) {
    return {
      'GET /rest/v1/design_versions': () => jsonResponse(200, [{ id: versionId, project_id: projectId }]),
      'GET /rest/v1/designs': () => jsonResponse(200, designs),
    };
  }

  // Registers a handler for the randomly-generated upload path `uploadFile`/`saveSanitized`
  // picks, the same way the sanitize-video suite above matches an unknown upload key by prefix.
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

  it('copies a video design to the client bucket instead of re-processing it', async () => {
    const assetId = md5Uuid('dawes:video-asset-1');
    const designId = md5Uuid('dawes:video-design-1');
    const internalPath = `${projectId}/${assetId}.mp4`;
    const videoBytes = await readFile(resolve(import.meta.dirname, 'fixtures/tagged.mp4'));
    let uploadedMimeType;
    let uploadedPath;

    const routes = withGeneratedUpload(
      {
        ...authRoutes,
        ...versionRoutes([{ id: designId, internal_asset_path: internalPath }]),
        [`GET /storage/v1/object/authenticated/internal-assets/${internalPath}`]: () =>
          new Response(videoBytes, { status: 200, headers: { 'content-length': String(videoBytes.length) } }),
        'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(200, null),
      },
      'published-assets',
      (path, init) => { uploadedPath = path; uploadedMimeType = init.headers['Content-Type']; return jsonResponse(200, {}); },
    );
    stubSupabase(routes);

    const response = await post('/publications/prepare', { versionId });
    const body = await response.json();

    // A 200 here is itself proof `sanitizeRaster` (which is `sharp`) never touched these bytes:
    // an MP4 is not a decodable image, so running it through `sanitizeRaster` would have failed
    // the request rather than returned 200.
    expect(response.status).toBe(200);
    expect(body.assets[designId]).toMatch(/\.mp4$/);
    expect(uploadedPath).toMatch(/\.mp4$/);
    expect(uploadedMimeType).toBe('video/mp4');

    const registration = calls.find(call => call.method === 'POST' && call.path === '/rest/v1/rpc/register_sanitized_asset');
    expect(registration).toBeDefined();
    const payload = JSON.parse(registration.body);
    expect(payload.p_project_id).toBe(projectId);
    expect(payload.p_bucket_id).toBe('published-assets');
    expect(payload.p_mime_type).toBe('video/mp4');
    expect(payload.p_source_design_id).toBe(designId);
    expect(payload.p_source_path).toBe(internalPath);
    expect(payload.p_file_size).toBe(videoBytes.length);
    expect(payload.p_sha256).toBe(createHash('sha256').update(videoBytes).digest('hex'));
  });

  it('still sanitizes a raster design the existing way, unaffected by the video branch', async () => {
    const designId = md5Uuid('dawes:raster-design-1');
    const assetId = md5Uuid('dawes:raster-asset-1');
    const internalPath = `${projectId}/${assetId}.png`;
    // A minimal valid 1x1 PNG, since `sanitizeRaster` really decodes the bytes with `sharp`.
    const onePixelPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
      '0d0a2db40000000049454e44ae426082', 'hex',
    );
    let uploadedMimeType;

    const routes = withGeneratedUpload(
      {
        ...authRoutes,
        ...versionRoutes([{ id: designId, internal_asset_path: internalPath }]),
        [`GET /storage/v1/object/authenticated/internal-assets/${internalPath}`]: () =>
          new Response(onePixelPng, { status: 200, headers: { 'content-length': String(onePixelPng.length) } }),
        'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(200, null),
      },
      'published-assets',
      (path, init) => { uploadedMimeType = init.headers['Content-Type']; return jsonResponse(200, {}); },
    );
    stubSupabase(routes);

    const response = await post('/publications/prepare', { versionId });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets[designId]).toMatch(/\.png$/);
    expect(uploadedMimeType).toBe('image/png');
  });

  it('discards the copied object when registration fails after the copy succeeds', async () => {
    const assetId = md5Uuid('dawes:video-asset-2');
    const designId = md5Uuid('dawes:video-design-2');
    const internalPath = `${projectId}/${assetId}.mp4`;
    const videoBytes = await readFile(resolve(import.meta.dirname, 'fixtures/tagged.mp4'));
    let uploadedPath;
    let discardedPaths = [];

    const routes = withGeneratedUpload(
      {
        ...authRoutes,
        ...versionRoutes([{ id: designId, internal_asset_path: internalPath }]),
        [`GET /storage/v1/object/authenticated/internal-assets/${internalPath}`]: () =>
          new Response(videoBytes, { status: 200, headers: { 'content-length': String(videoBytes.length) } }),
        // The copy lands successfully, but the attestation itself is refused.
        'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(500, { message: 'boom' }),
        'POST /rest/v1/rpc/discard_sanitized_asset': () => jsonResponse(200, null),
        'POST /rest/v1/rpc/finalize_asset_discard': () => jsonResponse(200, null),
        'DELETE /storage/v1/object/published-assets': (url, init) => {
          discardedPaths.push(JSON.parse(init.body).prefixes);
          return jsonResponse(200, {});
        },
      },
      'published-assets',
      path => { uploadedPath = path; return jsonResponse(200, {}); },
    );
    stubSupabase(routes);

    const response = await post('/publications/prepare', { versionId });
    // Any non-401/403 upstream failure surfaces as 502 (`request()`'s own mapping) — the point
    // under test is not this status code but that the copy gets cleaned up rather than orphaned.
    expect(response.status).toBe(502);
    // The bytes `uploadFile` copied in are removed, rather than left unreferenced and unattested.
    expect(discardedPaths.flat()).toContain(uploadedPath);
  });

  it('discards an uncertain publication upload and prior prepared copies without deleting the source', async () => {
    const sourcePath = `${projectId}/${md5Uuid('publication-upload-failure')}.mp4`;
    const videoBytes = await readFile(resolve(import.meta.dirname, 'fixtures/tagged.mp4'));
    const uploadedPaths = [];
    const discardedPaths = [];
    const routes = withGeneratedUpload({
      ...authRoutes,
      ...versionRoutes([
        { id: md5Uuid('publication-success-first'), internal_asset_path: sourcePath },
        { id: md5Uuid('publication-failure-second'), internal_asset_path: sourcePath },
      ]),
      [`GET /storage/v1/object/authenticated/internal-assets/${sourcePath}`]: () =>
        new Response(videoBytes, { status: 200, headers: { 'content-length': String(videoBytes.length) } }),
      'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(200, null),
      'POST /rest/v1/rpc/discard_sanitized_asset': () => jsonResponse(200, null),
      'POST /rest/v1/rpc/finalize_asset_discard': () => jsonResponse(200, null),
      'DELETE /storage/v1/object/published-assets': (_url, init) => {
        discardedPaths.push(...JSON.parse(init.body).prefixes);
        return jsonResponse(200, {});
      },
    }, 'published-assets', path => {
      uploadedPaths.push(path);
      return jsonResponse(uploadedPaths.length === 1 ? 200 : 502, {});
    });
    stubSupabase(routes);

    const response = await post('/publications/prepare', { versionId });

    expect(response.status).toBe(502);
    expect(uploadedPaths).toHaveLength(2);
    expect(discardedPaths.sort()).toEqual([...uploadedPaths].sort());
    expect(discardedPaths).not.toContain(sourcePath);
    expect(calls.filter(call => call.path === '/rest/v1/rpc/register_sanitized_asset')).toHaveLength(1);
    expect(calls.some(call => call.method === 'DELETE' && call.path === '/storage/v1/object/internal-assets')).toBe(false);
  });

  // The realistic publication is not "all video" or "all raster" — it's a version whose designs
  // mix both, which is what actually exercises the per-design branch inside the loop rather than
  // just proving each branch works in isolation.
  it('publishes a version containing both an image design and a video design in one request', async () => {
    const videoDesignId = md5Uuid('dawes:mixed-video-design');
    const videoAssetId = md5Uuid('dawes:mixed-video-asset');
    const videoInternalPath = `${projectId}/${videoAssetId}.mp4`;
    const imageDesignId = md5Uuid('dawes:mixed-image-design');
    const imageAssetId = md5Uuid('dawes:mixed-image-asset');
    const imageInternalPath = `${projectId}/${imageAssetId}.png`;
    const videoBytes = await readFile(resolve(import.meta.dirname, 'fixtures/tagged.mp4'));
    const onePixelPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
      '0d0a2db40000000049454e44ae426082', 'hex',
    );
    const uploads = [];

    const baseRoutes = {
      ...authRoutes,
      ...versionRoutes([
        { id: videoDesignId, internal_asset_path: videoInternalPath },
        { id: imageDesignId, internal_asset_path: imageInternalPath },
      ]),
      [`GET /storage/v1/object/authenticated/internal-assets/${videoInternalPath}`]: () =>
        new Response(videoBytes, { status: 200, headers: { 'content-length': String(videoBytes.length) } }),
      [`GET /storage/v1/object/authenticated/internal-assets/${imageInternalPath}`]: () =>
        new Response(onePixelPng, { status: 200, headers: { 'content-length': String(onePixelPng.length) } }),
      'POST /rest/v1/rpc/register_sanitized_asset': () => jsonResponse(200, null),
    };
    const routes = new Proxy(baseRoutes, {
      get(target, key) {
        if (key in target) return target[key];
        if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/published-assets/${projectId}/`)) {
          const path = key.slice('POST /storage/v1/object/published-assets/'.length);
          return (url, init) => { uploads.push({ path, mimeType: init.headers['Content-Type'] }); return jsonResponse(200, {}); };
        }
        return undefined;
      },
    });
    stubSupabase(routes);

    const response = await post('/publications/prepare', { versionId });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets[videoDesignId]).toMatch(/\.mp4$/);
    expect(body.assets[imageDesignId]).toMatch(/\.png$/);
    expect(uploads).toHaveLength(2);
    expect(uploads.find(upload => upload.path.endsWith('.mp4'))?.mimeType).toBe('video/mp4');
    expect(uploads.find(upload => upload.path.endsWith('.png'))?.mimeType).toBe('image/png');

    const registrations = calls.filter(call => call.method === 'POST' && call.path === '/rest/v1/rpc/register_sanitized_asset');
    expect(registrations).toHaveLength(2);
  });
});
