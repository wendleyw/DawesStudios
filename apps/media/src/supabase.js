import { createHash, randomUUID } from 'node:crypto';
import { LIMITS, MediaError } from './sanitize.js';

export function createBackend(config) {
  const root = config.supabaseUrl.replace(/\/$/, '');
  async function request(path, { token, method = 'GET', data, binary, mimeType } = {}) {
    const response = await fetch(root + path, {
      method, signal: AbortSignal.timeout(30_000), redirect: 'error',
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
  async function authenticate(token) {
    if (!token) throw new MediaError('Authentication required.', 401);
    const user = await json('/auth/v1/user', { token });
    const profiles = await json(`/rest/v1/profiles?id=eq.${user.id}&select=id,role`, { token });
    if (profiles.length !== 1 || profiles[0].role !== 'agency') throw new MediaError('Agency access required.', 403);
    return user.id;
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
  async function discardPrepared(paths, token) {
    const allowed = await rpc('discard_prepared_assets', { p_paths: paths }, token);
    for (const path of allowed) await discard('published-assets', path);
    return allowed;
  }
  async function cleanStaleAssets() {
    const stale = await rpc('list_stale_sanitized_assets', {}, config.serviceKey);
    return Promise.allSettled(stale.map(asset => discard(asset.bucket_id, asset.storage_path)));
  }
  return { json, rpc, authenticate, downloadInternal, saveSanitized, discard, discardPrepared, cleanStaleAssets };
}
