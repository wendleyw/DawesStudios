import { createHash, randomUUID } from 'node:crypto';
import { MediaError } from './sanitize.js';

export function createBackend(config) {
  const root = config.supabaseUrl.replace(/\/$/, '');
  // 30 seconds fits every call in this file: each one is a small JSON request (auth, REST, an
  // RPC) or a bounded sanitized-asset upload, and a longer default would let one of those hang
  // instead of failing fast.
  async function request(path, { token, method = 'GET', data, binary, mimeType, timeoutMs = 30_000 } = {}) {
    const response = await fetch(root + path, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': mimeType ?? 'application/json' },
      body: binary ?? (data === undefined ? undefined : JSON.stringify(data)),
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
  // Resolve the active caller profile; `authenticate` below enforces the agency-only gate
  // for cover and delivery preparation.
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

  async function discard(bucket, path) {
    // Refuse to remove bytes if a publication or delivery already references them.
    await rpc('discard_sanitized_asset', { p_bucket_id: bucket, p_storage_path: path }, config.serviceKey);
    await request(`/storage/v1/object/${bucket}`, { method: 'DELETE', token: config.serviceKey, data: { prefixes: [path] } });
    await rpc('finalize_asset_discard', { p_bucket_id: bucket, p_storage_path: path }, config.serviceKey);
  }
  async function cleanStaleAssets() {
    const stale = await rpc('list_stale_sanitized_assets', {}, config.serviceKey);
    return Promise.allSettled(stale.map(asset => discard(asset.bucket_id, asset.storage_path)));
  }
  return { json, rpc, authenticate, saveSanitized, discard, cleanStaleAssets };
}
