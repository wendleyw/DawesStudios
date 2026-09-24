import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { LIMITS, MediaError } from './sanitize.js';

// A raw video lands as `<projectId>/<uuid>.raw` while `/designs/sanitize-video` still holds it,
// and as `<projectId>/<uuid>.mp4` (or `.webm`) once that route has stripped it and it becomes a
// design's `internal_asset_path` — both are shapes `private.opaque_storage_path` accepts, but
// that check runs on every bucket's insert policy, not only internal-assets, and the insert
// policies on the client-served buckets were dropped long ago in favour of service_role writes.
// `downloadToFile` below is the only place either object's fate is decided at this layer, so it
// validates the full shape and the project prefix itself rather than leaning on that
// database-level check.
//
// This is deliberately WIDER than `server.js`'s `RAW_VIDEO_PATH`, which accepts `.raw` only. That
// is not redundant with this regex: `RAW_VIDEO_PATH` is what stops a caller-supplied `rawPath` in
// `/designs/sanitize-video`'s request body from naming an already-"sanitized"-looking `.mp4`/
// `.webm` and skipping `sanitizeVideo` entirely. Do not collapse the two into one.
const VIDEO_ASSET_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|raw)$/;

export function createBackend(config) {
  const root = config.supabaseUrl.replace(/\/$/, '');
  // 30 seconds fits every call in this file except the two video-streaming ones below, which set
  // their own `timeoutMs` — every other call here is a small JSON request (auth, REST, an RPC),
  // and a longer default would let one of those hang instead of failing fast.
  // `signal` lets a caller stop a transfer before its time budget runs out (a browser that hung
  // up). `passthroughStatuses` names upstream statuses the caller must tell apart, such as a 404
  // that means "the raw upload is gone"; every other failure still collapses to a safe 502.
  async function request(path, { token, method = 'GET', data, binary, mimeType, duplex, timeoutMs = 30_000, signal, passthroughStatuses = [] } = {}) {
    const response = await fetch(root + path, {
      method,
      signal: signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': mimeType ?? 'application/json' },
      body: binary ?? (data === undefined ? undefined : JSON.stringify(data)),
      ...(duplex ? { duplex } : {}),
    });
    if (!response.ok) {
      // Upstream error bodies may contain metadata or credentials; expose a stable safe message.
      await response.body?.cancel();
      if (passthroughStatuses.includes(response.status)) throw new MediaError('The storage object was not found.', response.status);
      throw new MediaError(response.status === 401 || response.status === 403 ? 'Access denied.' : 'The storage operation could not be completed.', response.status === 401 || response.status === 403 ? response.status : 502);
    }
    return response;
  }
  async function json(path, options) { const response = await request(path, options); const text = await response.text(); return text ? JSON.parse(text) : null; }
  async function rpc(name, data, token) { return json(`/rest/v1/rpc/${name}`, { method: 'POST', data, token }); }
  // Establishes who the caller is without deciding what they may do — `authenticate` below stays
  // the agency-only gate every route used until sanitising a video, which a designer must also be
  // able to reach, needed a caller identity it could authorize per-project instead.
  async function identify(token) {
    if (!token) throw new MediaError('Authentication required.', 401);
    const user = await json('/auth/v1/user', { token });
    const profiles = await json(`/rest/v1/profiles?id=eq.${user.id}&removed_at=is.null&select=id,role`, { token });
    if (profiles.length !== 1) throw new MediaError('Access denied.', 403);
    return { id: user.id, role: profiles[0].role };
  }
  async function authenticate(token) {
    const { id, role } = await identify(token);
    if (role !== 'agency') throw new MediaError('Agency access required.', 403);
    return id;
  }
  // Mirrors `private.can_produce` (`supabase/migrations/202609200001_foundation.sql:218-220`)
  // exactly: agency, or a designer with a standing assignment on this specific project. Reads the
  // assignment with the caller's own token — `assignments_read` already lets a designer see their
  // own rows — rather than the service key, so this can never see more than the caller could.
  async function canProduce(token, userId, role, projectId) {
    if (role === 'agency') return true;
    if (role !== 'designer') return false;
    const assignments = await json(`/rest/v1/project_assignments?project_id=eq.${projectId}&designer_id=eq.${userId}&select=project_id`, { token });
    return assignments.length === 1;
  }
  async function downloadInternal(path, projectId, token) {
    if (!path.startsWith(projectId + '/') || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$/.test(path)) throw new MediaError('Invalid internal asset path.');
    const response = await request('/storage/v1/object/authenticated/internal-assets/' + path, { token });
    if (Number(response.headers.get('content-length')) > LIMITS.bytes) { await response.body.cancel(); throw new MediaError('Source exceeds the file-size limit.', 413); }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > LIMITS.bytes) { await response.body.cancel().catch(() => {}); throw new MediaError('Source exceeds the file-size limit.', 413); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  // Video is handled as files on disk rather than buffers. `downloadInternal` returns bytes,
  // which is right for a 40-megapixel image and wrong for a gigabyte of video. Used both for the
  // raw upload `/designs/sanitize-video` streams in, and for the already-sanitized `.mp4`/`.webm`
  // `/publications/prepare` streams back out to copy into `published-assets`.
  async function downloadToFile(path, projectId, token, destination, signal) {
    if (!VIDEO_ASSET_PATH.test(path) || path.split('/')[0] !== projectId) throw new MediaError('Asset path must belong to the project.');
    // `request()`'s AbortSignal covers the whole fetch lifecycle, including streaming the body —
    // not just getting a response header — so the default 30 seconds would abort a realistic
    // transfer mid-stream. Reusing `LIMITS.videoProcessMs` (five minutes) rather than inventing a
    // second number: it is already the budget Task 4 gave a gigabyte of video precisely because
    // it is bounded by disk/network cost rather than CPU, and a network leg moving the same bytes
    // deserves the same order of magnitude, not an independently-chosen constant that could drift
    // out of sync with it.
    const response = await request(`/storage/v1/object/authenticated/internal-assets/${path}`, { token, timeoutMs: LIMITS.videoProcessMs, signal, passthroughStatuses: [404] });
    const contentLength = Number(response.headers.get('content-length'));
    if (!contentLength || contentLength > LIMITS.videoBytes) { await response.body?.cancel().catch(() => {}); throw new MediaError('Source exceeds the file-size limit.', 413); }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  }

  // The clean copy is written with the service key, exactly like `saveSanitized` below: this
  // service has already authenticated the caller and checked project access, so the write itself
  // bypasses `internal_storage_insert`'s RLS checks (including `opaque_storage_path`) rather than
  // depending on them.
  async function uploadFile(bucket, path, filePath, mimeType, signal) {
    const source = createReadStream(filePath);
    const chunks = source[Symbol.asyncIterator]();
    const hash = createHash('sha256');
    let fileSize = 0;
    let reachedEnd = false;
    let cancelled = false;
    let streamError;
    // Read only when fetch requests another chunk. Hash those exact outgoing bytes while
    // preserving backpressure; no second file pass or complete-file buffer is needed.
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const next = await chunks.next();
          if (next.done) {
            reachedEnd = true;
            controller.close();
            return;
          }
          fileSize += next.value.byteLength;
          if (fileSize > LIMITS.videoBytes) throw new MediaError('Source exceeds the file-size limit.', 413);
          hash.update(next.value);
          controller.enqueue(next.value);
        } catch (error) {
          streamError = error;
          source.destroy();
          controller.error(error);
        }
      },
      cancel() { cancelled = true; source.destroy(); },
    }, { highWaterMark: 0 });
    try {
      // Same transfer budget as downloadToFile. A successful early response must never attest
      // a prefix: require the outgoing stream's EOF in addition to the HTTP success status.
      const response = await request(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', token: config.serviceKey, binary: body, mimeType, duplex: 'half', timeoutMs: LIMITS.videoProcessMs, signal });
      await response.body?.cancel();
      if (!reachedEnd || cancelled || fileSize === 0) throw new MediaError('The storage upload did not finish.', 502);
      return Object.freeze({ sha256: hash.digest('hex'), fileSize });
    } catch (error) {
      throw streamError ?? error;
    } finally {
      // Rejection/abort can arrive before fetch consumes the body. Close the file in every
      // outcome, including that early path, and wait for descriptor cleanup before returning.
      source.destroy();
      await finished(source, { cleanup: true }).catch(() => {});
    }
  }

  async function saveSanitized(projectId, bucket, sanitized, userId, source = {}) {
    const path = `${projectId}/${randomUUID()}.${sanitized.extension}`;
    await request(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', token: config.serviceKey, binary: sanitized.bytes, mimeType: sanitized.mimeType });
    try {
      await rpc('register_sanitized_asset', {
        p_project_id: projectId, p_bucket_id: bucket, p_storage_path: path,
        p_sha256: createHash('sha256').update(sanitized.bytes).digest('hex'),
        p_mime_type: sanitized.mimeType, p_file_size: sanitized.bytes.length, p_prepared_by: userId,
        p_source_design_id: source.designId ?? null, p_source_path: source.path ?? null,
      }, config.serviceKey);
      return path;
    } catch (error) { await discard(bucket, path); throw error; }
  }

  // Only server-owned uploadFile results reach these registrators. Attest the exact uploaded
  // bytes and preserve provenance; a failed attestation discards the unreferenced copy.
  async function registerCopied(projectId, bucket, path, uploaded, mimeType, userId, source = {}) {
    try {
      await rpc('register_sanitized_asset', {
        p_project_id: projectId, p_bucket_id: bucket, p_storage_path: path,
        p_sha256: uploaded.sha256,
        p_mime_type: mimeType, p_file_size: uploaded.fileSize, p_prepared_by: userId,
        p_source_design_id: source.designId ?? null, p_source_path: source.path ?? null,
      }, config.serviceKey);
      return path;
    } catch (error) { await discard(bucket, path); throw error; }
  }

  // Internal video provenance has its own RPC because assigned designers may sanitize a video,
  // while preparing publication remains agency-only. The database still verifies both gates.
  // `sourcePath` is the raw upload the clean copy came from, so a retry of that same upload can
  // find this output instead of processing it again.
  async function registerSanitizedVideo(projectId, path, uploaded, mimeType, userId, sourcePath) {
    try {
      await rpc('register_sanitized_video', {
        p_project_id: projectId, p_storage_path: path, p_sha256: uploaded.sha256,
        p_mime_type: mimeType, p_file_size: uploaded.fileSize, p_prepared_by: userId,
        p_source_path: sourcePath ?? null,
      }, config.serviceKey);
      return path;
    } catch (error) { await discard('internal-assets', path); throw error; }
  }
  // The attested output an earlier run already produced from this raw upload, if it is younger than
  // 24 hours. The RPC is service_role only; the route has already checked the caller may produce
  // for this project, and the lookup is scoped to it.
  async function findSanitizedVideoBySource(projectId, sourcePath) {
    const rows = await rpc('find_sanitized_video_by_source', { p_project_id: projectId, p_source_path: sourcePath }, config.serviceKey);
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  }
  async function discard(bucket, path) {
    // Refuse to remove bytes if a publication or delivery already references them.
    await rpc('discard_sanitized_asset', { p_bucket_id: bucket, p_storage_path: path }, config.serviceKey);
    await request(`/storage/v1/object/${bucket}`, { method: 'DELETE', token: config.serviceKey, data: { prefixes: [path] } });
    await rpc('finalize_asset_discard', { p_bucket_id: bucket, p_storage_path: path }, config.serviceKey);
  }
  async function discardPrepared(paths, token) {
    const allowed = await rpc('discard_prepared_assets', { p_paths: paths }, token);
    for (const path of allowed) await discard('published-assets', path);
    return allowed;
  }
  async function cleanStaleAssets() {
    const stale = await rpc('list_stale_sanitized_assets', {}, config.serviceKey);
    return Promise.allSettled(stale.map(asset => discard(asset.bucket_id, asset.storage_path)));
  }
  return { json, rpc, identify, authenticate, canProduce, downloadInternal, downloadToFile, uploadFile, saveSanitized, registerCopied, registerSanitizedVideo, findSanitizedVideoBySource, discard, discardPrepared, cleanStaleAssets };
}
