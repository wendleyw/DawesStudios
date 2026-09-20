import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createBackend } from './supabase.js';
import { LIMITS, MediaError, sanitizeDelivery, sanitizeRaster } from './sanitize.js';

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

export function createMediaServer(config) {
  const backend = createBackend(config);
  let active = 0;
  const server = createServer({ maxHeaderSize: 16 * 1024, requestTimeout: 120_000, headersTimeout: 10_000 }, async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = request.headers.origin;
    const send = (status, data) => { if (!response.destroyed) { response.statusCode = status; response.end(JSON.stringify(data)); } };
    if (origin && origin !== config.appOrigin) { request.resume(); return send(403, { error: 'Origin is not allowed.' }); }
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-File-Name');
      response.setHeader('Access-Control-Max-Age', '600');
      return send(200, { ok: true });
    }
    const url = new URL(request.url, 'http://media.local');
    if (request.method === 'GET' && url.pathname === '/health') return send(200, { status: 'ok', service: 'dawes-media' });
    if (request.method !== 'POST' || !['/publications/prepare', '/deliveries/prepare', '/assets/discard'].includes(url.pathname)) { request.resume(); return send(404, { error: 'Endpoint not found.' }); }
    let acquired = false;
    try {
      const token = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
      const userId = await backend.authenticate(token);
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
            const input = await backend.downloadInternal(design.internal_asset_path, projectId, token);
            assets[design.id] = await backend.saveSanitized(projectId, 'published-assets', await sanitizeRaster(input), userId, { designId: design.id, path: design.internal_asset_path });
          }
        } catch (error) {
          await Promise.allSettled(Object.values(assets).map(path => backend.discard('published-assets', path)));
          throw error;
        }
        return send(200, { assets });
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = { supabaseUrl: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3003' };
  if (Object.values(config).some(value => !value)) throw new Error('Supabase and app-origin configuration is required.');
  for (const tool of ['pdfinfo', 'pdftoppm']) execFileSync(tool, ['-v'], { stdio: 'ignore', timeout: 5000 });
  const port = Number(process.env.MEDIA_PORT ?? 55430);
  createMediaServer(config).listen(port, process.env.MEDIA_HOST ?? '127.0.0.1', () => process.stdout.write(`Media service listening on port ${port}.\n`));
}
