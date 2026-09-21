import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { allowedOrigins, createMediaServer } from './server.js';

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

  const authRoutes = {
    'GET /auth/v1/user': () => jsonResponse(200, { id: agencyUserId }),
    'GET /rest/v1/profiles': () => jsonResponse(200, [{ id: agencyUserId, role: 'agency' }]),
  };

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
      // The upload path is a fresh random uuid, unknown ahead of time, so it is matched by prefix
      // rather than registered as an exact key.
      stubSupabase(new Proxy(routes, {
        get(target, key) {
          if (key in target) return target[key];
          if (typeof key === 'string' && key.startsWith(`POST /storage/v1/object/internal-assets/${projectId}/`)) {
            uploadPath = key.slice('POST /storage/v1/object/internal-assets/'.length);
            return () => jsonResponse(200, { Key: uploadPath });
          }
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
      expect(response.status).toBe(502);
      // The failed upload's own (possibly partial) path was cleaned up best-effort...
      expect(discardedPaths.flat()).toContain(uploadPath);
      // ...and the raw object — the user's original upload — was never touched.
      expect(discardedPaths.flat()).not.toContain(rawPath);
    });
  });
});
