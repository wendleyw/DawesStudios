import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
  async function request(path, { token, method = 'GET', data, binary, mimeType, duplex, timeoutMs = 30_000 } = {}) {
    const response = await fetch(root + path, {
      method, signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': mimeType ?? 'application/json' },
      body: binary ?? (data === undefined ? undefined : JSON.stringify(data)),
      ...(duplex ? { duplex } : {}),
    });
    if (!response.ok) {
      // Upstream error bodies may contain metadata or credentials; expose a stable safe message.
      await response.body?.cancel();
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
    const profiles = await json(`/rest/v1/profiles?id=eq.${user.id}&select=id,role`, { token });
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
  async function downloadToFile(path, projectId, token, destination) {
    if (!VIDEO_ASSET_PATH.test(path) || path.split('/')[0] !== projectId) throw new MediaError('Asset path must belong to the project.');
    // `request()`'s AbortSignal covers the whole fetch lifecycle, including streaming the body —
    // not just getting a response header — so the default 30 seconds would abort a realistic
    // transfer mid-stream. Reusing `LIMITS.videoProcessMs` (five minutes) rather than inventing a
    // second number: it is already the budget Task 4 gave a gigabyte of video precisely because
    // it is bounded by disk/network cost rather than CPU, and a network leg moving the same bytes
    // deserves the same order of magnitude, not an independently-chosen constant that could drift
    // out of sync with it.
    const response = await request(`/storage/v1/object/authenticated/internal-assets/${path}`, { token, timeoutMs: LIMITS.videoProcessMs });
    const contentLength = Number(response.headers.get('content-length'));
    if (!contentLength || contentLength > LIMITS.videoBytes) { await response.body?.cancel().catch(() => {}); throw new MediaError('Source exceeds the file-size limit.', 413); }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  }

  // The clean copy is written with the service key, exactly like `saveSanitized` below: this
  // service has already authenticated the caller and checked project access, so the write itself
  // bypasses `internal_storage_insert`'s RLS checks (including `opaque_storage_path`) rather than
  // depending on them.
  async function uploadFile(bucket, path, filePath, mimeType) {
    const body = Readable.toWeb(createReadStream(filePath));
    // Same reasoning as `downloadToFile`'s `timeoutMs`: this streams up to a gigabyte too.
    await request(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', token: config.serviceKey, binary: body, mimeType, duplex: 'half', timeoutMs: LIMITS.videoProcessMs });
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

  // Video's registration half, on its own: `uploadFile` above already copied the already-clean
  // bytes into the target bucket, so this only attests to them, mirroring `saveSanitized`'s own
  // `register_sanitized_asset` call exactly (same RPC, same argument names and order). The one
  // difference is the checksum and size, which come from streaming `filePath` off disk through
  // `createHash('sha256')` rather than hashing a buffer — the file may be a gigabyte, and holding
  // it in memory twice (once for `uploadFile`'s read stream, once for a hashed buffer) is exactly
  // the cost this task exists to avoid.
  //
  // If the copy already landed in the bucket and this registration then fails — a bad checksum,
  // a stale byte count, a dropped connection to the RPC — the bytes are unreferenced but still
  // present and billable, and worse, `/publish_version` would otherwise be unable to tell them
  // apart from a legitimately attested object at that same path. So, exactly like `saveSanitized`,
  // any failure here discards what `uploadFile` wrote before re-throwing.
  async function registerCopied(projectId, bucket, path, filePath, mimeType, userId, source = {}) {
    try {
      const { size } = await stat(filePath);
      const hash = createHash('sha256');
      await pipeline(createReadStream(filePath), hash);
      await rpc('register_sanitized_asset', {
        p_project_id: projectId, p_bucket_id: bucket, p_storage_path: path,
        p_sha256: hash.digest('hex'),
        p_mime_type: mimeType, p_file_size: size, p_prepared_by: userId,
        p_source_design_id: source.designId ?? null, p_source_path: source.path ?? null,
      }, config.serviceKey);
      return path;
    } catch (error) { await discard(bucket, path); throw error; }
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
  return { json, rpc, identify, authenticate, canProduce, downloadInternal, downloadToFile, uploadFile, saveSanitized, registerCopied, discard, discardPrepared, cleanStaleAssets };
}
