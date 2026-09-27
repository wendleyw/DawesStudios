import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from './supabase.js';
import { LIMITS, MediaError, sanitizeCover, sanitizeDelivery } from './sanitize.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function validId(value) { if (typeof value !== 'string' || !UUID.test(value)) throw new MediaError('A valid resource identifier is required.'); return value; }
async function readBody(request, maxBytes) {
  if (Number(request.headers['content-length']) > maxBytes) throw new MediaError('Request exceeds the file-size limit.', 413);
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new MediaError('Request exceeds the file-size limit.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function parseJson(bytes) { try { return JSON.parse(bytes.toString('utf8')); } catch { throw new MediaError('A valid JSON body is required.'); } }
function displayName(value, extension) {
  let label = value ? decodeURIComponent(value) : 'Creative delivery';
  label = label.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[/\\]/g, ' ').replace(/\.[A-Za-z0-9]{1,8}$/, '').trim().slice(0, 110);
  return `${label || 'Creative delivery'}.${extension}`;
}

/**
 * The browser origins this service answers, as an exact-match allowlist.
 *
 * `APP_ORIGIN` names the one canonical workspace origin, which the web application also uses to
 * build invitation links, so it stays a single value. `MEDIA_ALLOWED_ORIGINS` adds the others a
 * machine legitimately serves the same application from — a `next dev` on its own port beside the
 * container — which is what a developer hits when a cover is prepared from port 3010 against
 * a service configured for 3003. Entries are compared whole; no origin is ever reflected back
 * merely because it asked.
 */
export function allowedOrigins({ appOrigin, additionalOrigins } = {}) {
  return new Set([appOrigin, ...String(additionalOrigins ?? '').split(/[,\s]+/)].filter(Boolean));
}

export function createMediaServer(config) {
  const backend = createBackend(config);
  const permitted = config.allowedOrigins instanceof Set ? config.allowedOrigins : allowedOrigins(config);
  let active = 0;
  const server = createServer({ maxHeaderSize: 16 * 1024, requestTimeout: 120_000, headersTimeout: 10_000 }, async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = request.headers.origin;
    let responded = false;
    const send = (status, data) => { responded = true; if (!response.destroyed) { response.statusCode = status; response.end(JSON.stringify(data)); } };
    if (origin && !permitted.has(origin)) { request.resume(); return send(403, { error: 'Origin is not allowed.' }); }
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-File-Name');
      response.setHeader('Access-Control-Max-Age', '600');
      return send(200, { ok: true });
    }
    const url = new URL(request.url, 'http://media.local');
    if (request.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok', service: 'dawes-media' });
    if (request.method !== 'POST' || !['/deliveries/prepare', '/covers/prepare', '/covers/clear'].includes(url.pathname)) { request.resume(); return send(404, { error: 'Endpoint not found.' }); }
    let acquired = false;
    try {
      const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
      // Every remaining route (delivery, both cover routes) is agency-only.
      const userId = await backend.authenticate(token);
      if (active >= 2) throw new MediaError('Media processing is busy. Try again shortly.', 429);
      active++; acquired = true;
      // Both cover routes are agency-only (enforced above by `backend.authenticate`) and, like
      // `set_project_cover`/`clear_project_cover` themselves, take `projectId` as a query
      // parameter rather than a JSON body — there is no other field to carry for `/covers/clear`,
      // and `/covers/prepare` carries the image as a raw body, the same shape `/deliveries/prepare`
      // below already uses.
      if (url.pathname === '/covers/clear') {
        const projectId = validId(url.searchParams.get('projectId'));
        const projects = await backend.json(`/rest/v1/projects?id=eq.${projectId}&select=id`, { token });
        if (projects.length !== 1) throw new MediaError('Project not found.', 404);
        const removedPath = await backend.rpc('clear_project_cover', { p_project_id: projectId }, token);
        // A cleared row no longer references its object, so `discard_sanitized_asset` (called
        // inside `backend.discard`) no longer refuses it as a live cover — see
        // `202609270001_project_covers.sql`'s comment on cleanup order.
        if (removedPath) await backend.discard('project-covers', removedPath);
        return send(200, { cleared: Boolean(removedPath) });
      }
      if (url.pathname === '/covers/prepare') {
        const projectId = validId(url.searchParams.get('projectId'));
        const projects = await backend.json(`/rest/v1/projects?id=eq.${projectId}&select=id`, { token });
        if (projects.length !== 1) throw new MediaError('Project not found.', 404);
        const type = request.headers['content-type']?.split(';')[0];
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw new MediaError('Covers support PNG, JPEG and WebP images only.', 415);
        // `sanitizeCover`, not `sanitizeDelivery`/`sanitizeRaster`: a cover must always come back
        // as PNG, and `sanitizeRaster`'s JPEG fallback for a large opaque photo would otherwise
        // produce a mime type `register_sanitized_asset` refuses for the `project-covers` bucket.
        const sanitized = await sanitizeCover(await readBody(request, LIMITS.bytes));
        const path = await backend.saveSanitized(projectId, 'project-covers', sanitized, userId);
        // `set_project_cover` defaults `p_client_visible` to false, so the current visibility (on
        // a replace) or the chosen one (on a first upload) must be passed through explicitly.
        const visible = url.searchParams.get('visible') === 'true';
        let previousPath;
        try {
          previousPath = await backend.rpc('set_project_cover', { p_project_id: projectId, p_storage_path: path, p_client_visible: visible }, token);
        } catch (error) { await backend.discard('project-covers', path); throw error; }
        // The database now points at `path`, not `previousPath` — a transient failure discarding
        // the OLD object must never take the NEW, now-live cover down with it, so this runs outside
        // the try above and its own failure is logged, not thrown. The old object stays reachable
        // but unreferenced: no `project_covers` row still names it, so a later sweep or a repeated
        // discard can still remove it without affecting the replacement.
        if (previousPath) {
          try { await backend.discard('project-covers', previousPath); } catch {
            process.stderr.write(`Previous cover discard failed for ${previousPath}; a duplicate remains in project-covers.\n`);
          }
        }
        return send(201, { path, clientVisible: visible });
      }
      const projectId = validId(url.searchParams.get('projectId'));
      const projects = await backend.json(`/rest/v1/projects?id=eq.${projectId}&select=id,status`, { token });
      if (projects.length !== 1) throw new MediaError('Project not found.', 404);
      if (projects[0].status !== 'approved') throw new MediaError('Approve all deliverables before adding final files.', 409);
      const type = request.headers['content-type']?.split(';')[0];
      if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(type)) throw new MediaError('Delivery supports PNG, JPEG, WebP and PDF files only.', 415);
      const sanitized = await sanitizeDelivery(await readBody(request, LIMITS.bytes), type);
      const path = await backend.saveSanitized(projectId, 'delivery-files', sanitized, userId);
      try {
        const id = await backend.rpc('add_delivery_file', { p_project_id: projectId, p_name: displayName(request.headers['x-file-name'], sanitized.extension), p_storage_path: path, p_mime_type: sanitized.mimeType, p_file_size: sanitized.bytes.length }, token);
        return send(201, { id, storagePath: path, mimeType: sanitized.mimeType, fileSize: sanitized.bytes.length });
      } catch (error) { await backend.discard('delivery-files', path); throw error; }
    } catch (error) {
      request.resume();
      // An unexpected (non-`MediaError`) failure is deliberately never described to the caller —
      // its message could carry an upstream detail this service exists to keep private — but
      // swallowing it with no server-side trace at all made every such failure indistinguishable
      // from a deliberate refusal, to an operator as much as to the caller. Logged, not sent.
      if (!(error instanceof MediaError)) process.stderr.write(`Unexpected media processing failure: ${error?.stack ?? error}\n`);
      send(error instanceof MediaError ? error.status : 500, { error: error instanceof MediaError ? error.message : 'Media processing could not be completed.' });
    } finally { if (acquired) active--; }
  });
  const cleanupFailed = () => process.stderr.write('Prepared asset cleanup failed; the next scheduled pass will retry.\n');
  const cleanup = setInterval(() => { backend.cleanStaleAssets().catch(cleanupFailed); }, 60 * 60 * 1000);
  cleanup.unref();
  server.on('close', () => clearInterval(cleanup));
  backend.cleanStaleAssets().catch(cleanupFailed);
  return server;
}

/**
 * Removes every leftover `dawes-*` scratch directory under `tmpdir()` at boot.
 *
 * Follow-up to Critical 1: `/tmp` used to be a tmpfs, wiped by the container runtime on every
 * restart, so a scratch directory a crashed request never got to its own `finally { rm(...) }`
 * (`sanitize.js`'s `sanitizePdf`) simply vanished with the container. `media-scratch` is a
 * persistent disk volume precisely so a gigabyte temp file is never charged to container memory —
 * but persistence cuts both ways: a SIGKILL or an OOM mid-render now leaves that directory behind
 * indefinitely. No request-time code path ever revisits a directory once its own request has
 * moved on, and `cleanStaleAssets`/`list_stale_sanitized_assets` sweep database attestations, not
 * filesystem paths, so nothing else was ever going to notice.
 *
 * Every `mkdtemp` call in this codebase is scoped under `tmpdir()` with a `dawes-` prefix
 * (`dawes-media-`), so that prefix is exactly the set this process could have left behind —
 * nothing else legitimately creates a same-named directory there. Startup is the right, and only
 * necessary, moment to sweep: a fresh process has no in-flight request of its own, so every
 * matching directory that already exists is, by construction, an orphan from a previous run. One
 * pass is enough; this is not a reaper.
 */
export async function sweepStaleScratchDirectories(root = tmpdir()) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return 0; }
  const stale = entries.filter(entry => entry.isDirectory() && entry.name.startsWith('dawes-'));
  for (const entry of stale) await rm(join(root, entry.name), { recursive: true, force: true }).catch(() => {});
  return stale.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = { supabaseUrl: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3003', additionalOrigins: process.env.MEDIA_ALLOWED_ORIGINS ?? '' };
  if (['supabaseUrl', 'anonKey', 'serviceKey', 'appOrigin'].some(key => !config[key])) throw new Error('Supabase and app-origin configuration is required.');
  // Fail fast at boot rather than on the first request. Before this, an image built without
  // Poppler (for example, a base image bump that dropped the `apt-get install` line in
  // `apps/media/Dockerfile`) would still pass this check, start, answer `/health` as ready, and
  // only fail every PDF delivery with a `MediaError` that names the uploaded file rather than the
  // actual cause — a missing binary in the deployment.
  for (const tool of ['pdfinfo', 'pdftoppm']) execFileSync(tool, ['-v'], { stdio: 'ignore', timeout: 5000 });
  const swept = await sweepStaleScratchDirectories();
  if (swept) process.stderr.write(`Swept ${swept} stale scratch director${swept === 1 ? 'y' : 'ies'} left by an earlier crash.\n`);
  const port = Number(process.env.MEDIA_PORT ?? 55430);
  createMediaServer(config).listen(port, process.env.MEDIA_HOST ?? '127.0.0.1', () => process.stdout.write(`Media service listening on port ${port}.\n`));
}
