import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBackend } from './supabase.js';
import { LIMITS, MediaError, probeVideo, sanitizeCover, sanitizeDelivery, sanitizeRaster, sanitizeVideo } from './sanitize.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// `.raw` only, deliberately narrower than `supabase.js`'s `VIDEO_ASSET_PATH`. This is the shape a
// browser's own raw upload must have before it has been through `sanitizeVideo` at all, and it is
// the only thing standing between an attacker-supplied `rawPath` and `downloadToFile` — that
// helper's own regex also accepts `.mp4`/`.webm`, because it is reused below (in the video branch
// of `/publications/prepare`) to fetch a design's *already-sanitized* internal asset. Do not treat
// this check as redundant with `downloadToFile`'s: removing it would let a caller name an `.mp4`
// or `.webm` `rawPath` and have it copied into `internal-assets` without ever passing through
// `sanitizeVideo` — silently bypassing this feature's entire metadata-stripping guarantee. See the
// `.mp4`/`.webm` refusal tests in `server.test.js` for `/designs/sanitize-video`.
const RAW_VIDEO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.raw$/;
// The browser retries a transient failure once and discards the raw upload on a permanent one, so
// the status class is the contract: a transfer that timed out is 504 and storage that could not
// be reached is 503, never the 502 `request()` collapses both into.
function remapTransportFailure(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return new MediaError('The media service timed out. Try again.', 504);
  if (error instanceof MediaError && error.status === 502) return new MediaError('The media service could not reach storage. Try again.', 503);
  return error;
}
// A raw upload that is gone (expired, or already discarded) can never be processed, so its 404 is
// the 410 the browser shows as "choose the file again".
async function downloadRawOrDie(backend, rawPath, projectId, token, destination, signal) {
  try {
    await backend.downloadToFile(rawPath, projectId, token, destination, signal);
  } catch (error) {
    if (error instanceof MediaError && error.status === 404) throw new MediaError('The raw upload has expired. Choose the file again.', 410);
    throw remapTransportFailure(error);
  }
}
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
 * container — which is what a developer hits when a publication is prepared from port 3010 against
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
    if (request.method !== 'POST' || !['/publications/prepare', '/deliveries/prepare', '/assets/discard', '/designs/sanitize-video', '/designs/discard-raw', '/covers/prepare', '/covers/clear'].includes(url.pathname)) { request.resume(); return send(404, { error: 'Endpoint not found.' }); }
    let acquired = false;
    try {
      const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
      // Publishing and delivery stay agency-only: those are not a designer's action, so
      // `authenticate` keeps enforcing that on its own. Sanitising a video is one step in
      // producing a design, so it identifies the caller here and defers the actual authorization
      // decision to the route below, once the target project is known from the body.
      let userId, callerRole;
      if (url.pathname === '/designs/sanitize-video' || url.pathname === '/designs/discard-raw') ({ id: userId, role: callerRole } = await backend.identify(token));
      else userId = await backend.authenticate(token);
      if (active >= 2) throw new MediaError('Media processing is busy. Try again shortly.', 429);
      active++; acquired = true;
      if (url.pathname === '/assets/discard') {
        const { paths } = parseJson(await readBody(request, 16 * 1024));
        if (!Array.isArray(paths) || paths.length > 20 || paths.some(path => typeof path !== 'string' || path.length > 100)) throw new MediaError('Provide up to 20 prepared asset paths.');
        const discarded = await backend.discardPrepared(paths, token);
        return send(200, { discarded, retained: paths.filter(path => !discarded.includes(path)) });
      }
      if (url.pathname === '/publications/prepare') {
        const { versionId } = parseJson(await readBody(request, 16 * 1024));
        validId(versionId);
        const versions = await backend.json(`/rest/v1/design_versions?id=eq.${versionId}&select=id,project_id`, { token });
        if (versions.length !== 1) throw new MediaError('Version not found.', 404);
        const projectId = versions[0].project_id;
        const designs = await backend.json(`/rest/v1/designs?version_id=eq.${versionId}&select=id,internal_asset_path&order=sort_order`, { token });
        if (!designs.length) throw new MediaError('Add a design before preparing publication.');
        if (designs.length > 20) throw new MediaError('A publication can prepare up to 20 designs at once.', 413);
        const assets = {};
        try {
          for (const design of designs) {
            if (!design.internal_asset_path) continue;
            const extension = design.internal_asset_path.split('.').pop().toLowerCase();
            if (['mp4', 'webm'].includes(extension)) {
              // Video was stripped of its metadata on the way in, by `/designs/sanitize-video`.
              // There is nothing left to remove, and re-running a remux here would put every
              // video in the version through one synchronous request — up to twenty gigabytes
              // on a single publish click. So this copies the already-clean object rather than
              // reprocessing it.
              const mimeType = extension === 'mp4' ? 'video/mp4' : 'video/webm';
              const directory = await mkdtemp(join(tmpdir(), 'dawes-publish-'));
              try {
                const local = join(directory, `asset.${extension}`);
                await backend.downloadToFile(design.internal_asset_path, projectId, token, local);
                const target = `${projectId}/${randomUUID()}.${extension}`;
                let uploaded;
                try {
                  uploaded = await backend.uploadFile('published-assets', target, local, mimeType);
                } catch (error) {
                  // The upload may have committed bytes before its response was lost. This
                  // target is not attested or returned yet, so discard it without touching the
                  // internal source or any completed immutable publication.
                  await backend.discard('published-assets', target).catch(() => {});
                  throw error;
                }
                assets[design.id] = await backend.registerCopied(
                  projectId, 'published-assets', target, uploaded, mimeType, userId,
                  { designId: design.id, path: design.internal_asset_path },
                );
              } finally {
                await rm(directory, { recursive: true, force: true });
              }
              continue;
            }
            const input = await backend.downloadInternal(design.internal_asset_path, projectId, token);
            assets[design.id] = await backend.saveSanitized(projectId, 'published-assets', await sanitizeRaster(input), userId, { designId: design.id, path: design.internal_asset_path });
          }
        } catch (error) {
          await Promise.allSettled(Object.values(assets).map(path => backend.discard('published-assets', path)));
          throw error;
        }
        return send(200, { assets });
      }
      // Cancel during processing: the browser has aborted its sanitize-video request (which keeps
      // the raw file, since a disconnect is not a cancel) and now removes the raw upload itself.
      // Same path rules and production access as sanitize-video.
      if (url.pathname === '/designs/discard-raw') {
        const { projectId, rawPath } = parseJson(await readBody(request, 16 * 1024));
        validId(projectId);
        if (!RAW_VIDEO_PATH.test(rawPath) || rawPath.split('/')[0] !== projectId)
          throw new MediaError('Asset path must belong to the project.');
        if (!(await backend.canProduce(token, userId, callerRole, projectId)))
          throw new MediaError('Production access required.', 403);
        await backend.discardRaw('internal-assets', rawPath);
        return send(200, { discarded: true });
      }
      if (url.pathname === '/designs/sanitize-video') {
        const { projectId, rawPath, mimeType } = parseJson(await readBody(request, 16 * 1024));
        validId(projectId);
        if (!['video/mp4', 'video/webm'].includes(mimeType))
          throw new MediaError('Upload an MP4 or WebM video.', 415);
        // `opaque_storage_path` accepts this `.raw` shape in every bucket's insert policy, not
        // only internal-assets, and only service_role writes to the client-served buckets in
        // practice. The bucket below is a literal, never taken from the request; the path shape
        // and project ownership are validated here rather than relying on that database check.
        if (!RAW_VIDEO_PATH.test(rawPath) || rawPath.split('/')[0] !== projectId)
          throw new MediaError('Asset path must belong to the project.');

        // Production access is the same gate `add_design` applies (`private.can_produce`:
        // agency, or a designer assigned to this project) — checked here, against this project,
        // so the service never processes a file for someone who could not attach it to a design
        // anyway. Publishing and delivery stay agency-only above; this is the one route a
        // designer is expected to reach.
        if (!(await backend.canProduce(token, userId, callerRole, projectId)))
          throw new MediaError('Production access required.', 403);
        const projects = await backend.json(`/rest/v1/projects?id=eq.${projectId}&select=id`, { token });
        if (projects.length !== 1) throw new MediaError('Project not found.', 404);

        // A disconnect is not a cancel: the raw upload stays, so the automatic retry (web layer)
        // can reuse it. This controller only aborts the in-flight download/probe/remux/upload; it
        // never triggers the raw object's discard. It listens on the response, not the request:
        // the request stream has already closed once its small JSON body was read, so a later
        // disconnect only shows as the response closing before anything was sent.
        const controller = new AbortController();
        response.on('close', () => { if (!responded) controller.abort(); });

        const extension = mimeType === 'video/mp4' ? 'mp4' : 'webm';
        const directory = await mkdtemp(join(tmpdir(), 'dawes-video-'));
        try {
          // Idempotent retry: a browser that lost the response to a successful run asks again with
          // the same raw path, which by then is deleted. The output that run attested (younger
          // than 24 hours) is returned instead of failing with 410 or running ffmpeg again.
          const existing = await backend.findSanitizedVideoBySource(projectId, rawPath);
          if (existing) {
            const probeInput = join(directory, `probe.${extension}`);
            await downloadRawOrDie(backend, existing.storage_path, projectId, token, probeInput, controller.signal);
            const probe = await probeVideo(probeInput, existing.mime_type, controller.signal);
            try { await backend.discard('internal-assets', rawPath); } catch {
              process.stderr.write(`Raw video discard failed for ${rawPath}; a duplicate remains in internal-assets.\n`);
            }
            return send(200, { path: existing.storage_path, ...probe });
          }

          const input = join(directory, `in.${extension}`);
          const output = join(directory, `out.${extension}`);
          await downloadRawOrDie(backend, rawPath, projectId, token, input, controller.signal);
          let probe;
          try {
            probe = await sanitizeVideo(input, output, mimeType, undefined, controller.signal);
          } catch (error) {
            // Content ffprobe or ffmpeg rejected can never succeed, so its raw upload is removed
            // now rather than left for the 24-hour sweep.
            if (error instanceof MediaError && error.status === 422) {
              await backend.discard('internal-assets', rawPath).catch(() => {});
            }
            throw error;
          }
          const path = `${projectId}/${randomUUID()}.${extension}`;
          let uploaded;
          try {
            uploaded = await backend.uploadFile('internal-assets', path, output, mimeType, controller.signal);
          } catch (error) {
            // The upload may have left a partial object under `path` before failing. Nothing
            // references that path yet — it was never linked to a design — so a best-effort
            // removal is safe whether or not anything actually landed. The raw object is
            // untouched, so the caller's original upload is not lost to this failure.
            await backend.discard('internal-assets', path).catch(() => {});
            throw error;
          }
          // Final whole-branch review, Critical 2: attest the clean object before this route
          // ever hands its path back to a caller. Without this row, `register_sanitized_asset`
          // refuses to copy it into `published-assets` at publish time — see
          // `202609210007_video_provenance_attestation.sql`. `registerSanitizedVideo` discards
          // the object it failed to attest, the same way the `uploadFile` failure above does, so
          // an unattested object is never left reachable under a path this response returns.
          await backend.registerSanitizedVideo(projectId, path, uploaded, mimeType, userId, rawPath);
          try {
            // The raw object has served its purpose now that the clean one is durably stored.
            await backend.discard('internal-assets', rawPath);
          } catch {
            // The clean object already exists and is what the caller is about to receive;
            // failing the whole request over this cleanup step would make the caller re-upload
            // and re-run ffmpeg for nothing. internal-assets is never client-served, so a
            // duplicate raw object left behind costs storage, not correctness or security, and
            // is recoverable by a later pass rather than by losing the sanitized result.
            process.stderr.write(`Raw video discard failed for ${rawPath}; a duplicate remains in internal-assets.\n`);
          }
          return send(200, { path, ...probe });
        } catch (error) {
          // Storage and RPC failures, timeouts and a hang-up (an abort) all leave the raw upload
          // in place, so each reaches the browser as a retryable 503/504 rather than a 502 or an
          // "unexpected" failure.
          throw remapTransportFailure(error);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
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
        // discard can still remove it (same "duplicate remains" recovery as the raw-video discard
        // failure a few lines above).
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
  const cleanup = setInterval(() => {
    backend.cleanStaleAssets().catch(cleanupFailed);
    backend.cleanStaleVideoUploads().catch(cleanupFailed);
  }, 60 * 60 * 1000);
  cleanup.unref();
  server.on('close', () => clearInterval(cleanup));
  backend.cleanStaleAssets().catch(cleanupFailed);
  backend.cleanStaleVideoUploads().catch(cleanupFailed);
  return server;
}

/**
 * Removes every leftover `dawes-*` scratch directory under `tmpdir()` at boot.
 *
 * Follow-up to Critical 1: `/tmp` used to be a tmpfs, wiped by the container runtime on every
 * restart, so a scratch directory a crashed request never got to its own `finally { rm(...) }`
 * (`server.js`'s `/designs/sanitize-video` and `/publications/prepare` video branch, and
 * `sanitize.js`'s `sanitizePdf`) simply vanished with the container. `media-scratch` is a
 * persistent disk volume precisely so a gigabyte temp file is never charged to container memory —
 * but persistence cuts both ways: a SIGKILL or an OOM mid-remux now leaves that directory behind
 * indefinitely. No request-time code path ever revisits a directory once its own request has
 * moved on, and `cleanStaleAssets`/`list_stale_sanitized_assets` sweep database attestations, not
 * filesystem paths, so nothing else was ever going to notice.
 *
 * Every `mkdtemp` call in this codebase is scoped under `tmpdir()` with a `dawes-` prefix
 * (`dawes-media-`, `dawes-video-`, `dawes-publish-`), so that prefix is exactly the set this
 * process could have left behind — nothing else legitimately creates a same-named directory
 * there. Startup is the right, and only necessary, moment to sweep: a fresh process has no
 * in-flight request of its own, so every matching directory that already exists is, by
 * construction, an orphan from a previous run. One pass is enough; this is not a reaper.
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
  // `ffmpeg`/`ffprobe` (for example, a base image bump that dropped the `apt-get install` line in
  // `apps/media/Dockerfile`) would still pass this check, start, answer `/health` as ready, and
  // only fail every video with a `MediaError` that names the uploaded file rather than the actual
  // cause — a missing binary in the deployment. `-version` is the flag both tools use to print
  // their version and exit 0 with no input required; it is deliberately not `-v`, which for
  // `ffmpeg`/`ffprobe` sets a log-level and expects a value, not "print version".
  for (const tool of ['pdfinfo', 'pdftoppm']) execFileSync(tool, ['-v'], { stdio: 'ignore', timeout: 5000 });
  for (const tool of ['ffmpeg', 'ffprobe']) execFileSync(tool, ['-version'], { stdio: 'ignore', timeout: 5000 });
  const swept = await sweepStaleScratchDirectories();
  if (swept) process.stderr.write(`Swept ${swept} stale scratch director${swept === 1 ? 'y' : 'ies'} left by an earlier crash.\n`);
  const port = Number(process.env.MEDIA_PORT ?? 55430);
  createMediaServer(config).listen(port, process.env.MEDIA_HOST ?? '127.0.0.1', () => process.stdout.write(`Media service listening on port ${port}.\n`));
}
