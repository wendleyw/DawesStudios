import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { createBackend } from './supabase.js';

const env = Object.fromEntries((await readFile(new URL('../../../supabase/.env.local', import.meta.url), 'utf8')).split('\n').filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const fixtures = JSON.parse(await readFile(new URL('../../../supabase/fixtures.json', import.meta.url), 'utf8'));
const root = process.env.MEDIA_TEST_URL ?? 'http://127.0.0.1:55430';
assert.ok(['http://127.0.0.1:55430', 'http://127.0.0.1:55431'].includes(root), 'Media integration permits only the local native or Docker test service');
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55421', 'Media integration requires the isolated local backend');
const backend = createBackend({ supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY });
async function upstream(path, { token = env.SUPABASE_SERVICE_ROLE_KEY, method = 'GET', body, type = 'application/json' } = {}) {
  return fetch(env.SUPABASE_URL + path, { method, headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': type }, body: Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined });
}
async function login(email) {
  const response = await upstream('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: env.DEMO_PASSWORD } });
  assert.equal(response.status, 200); return (await response.json()).access_token;
}
const agency = await login('studio@dawes.local'); const client = await login('sabre@client.dawes.local'); const designer = await login('designer@dawes.local');
const post = (path, body, token = agency, type = 'application/json', extraHeaders = {}) => fetch(root + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type, ...extraHeaders }, body: Buffer.isBuffer(body) ? body : JSON.stringify(body) });
let assertions = 0;
for (const token of [client, designer]) { const response = await post('/publications/prepare', { versionId: randomUUID() }, token); assert.equal(response.status, 403); assertions++; }
assert.equal((await post('/publications/prepare', {}, agency, 'application/json', { Origin: 'https://untrusted.example' })).status, 403); assertions++;
assert.equal((await fetch(root + '/publications/prepare', { method: 'POST', body: '{}' })).status, 401); assertions++;

const project = fixtures.projects[1];
const versions = await backend.json(`/rest/v1/design_versions?project_id=eq.${project.id}&order=version_number&limit=1`, { token: agency });
const designs = await backend.json(`/rest/v1/designs?version_id=eq.${versions[0].id}&order=sort_order&limit=1`, { token: agency });
const design = designs[0]; const sourcePath = `${project.id}/${randomUUID()}.jpg`;
const input = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#556644' } }).jpeg().withExif({ IFD0: { Artist: 'PRIVATE DESIGNER', Copyright: 'INTERNAL COPYRIGHT' } }).toBuffer();
let prepared = [];
try {
  assert.equal((await upstream(`/storage/v1/object/internal-assets/${sourcePath}`, { method: 'POST', body: input, token: agency, type: 'image/jpeg' })).status, 200);
  assert.equal((await upstream(`/rest/v1/designs?id=eq.${design.id}`, { method: 'PATCH', body: { internal_asset_path: sourcePath }, token: agency })).status, 204);
  const response = await post('/publications/prepare', { versionId: versions[0].id });
  assert.equal(response.status, 200, await response.clone().text());
  prepared = Object.values((await response.json()).assets);
  assert.equal(prepared.length, 1);
  const download = await upstream('/storage/v1/object/authenticated/published-assets/' + prepared[0], { token: agency });
  assert.equal(download.status, 200);
  const bytes = Buffer.from(await download.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'png'); assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined);
  assert.equal((await upstream('/storage/v1/object/authenticated/published-assets/' + prepared[0], { token: client })).ok, false);
  assertions += 4;
} finally {
  await upstream(`/rest/v1/designs?id=eq.${design.id}`, { method: 'PATCH', body: { internal_asset_path: design.internal_asset_path }, token: agency });
  for (const path of prepared) await backend.discard('published-assets', path);
  await upstream('/storage/v1/object/internal-assets', { method: 'DELETE', body: { prefixes: [sourcePath] } });
}

const deliveryProject = fixtures.projects[5];
const pdf = await PDFDocument.create(); pdf.setAuthor('PRIVATE DESIGNER'); pdf.setSubject('PRIVATE SOURCE NOTES'); pdf.addPage([420, 300]).drawText('Approved creative direction');
for (const [type, bytes] of [['image/jpeg', input], ['application/pdf', Buffer.from(await pdf.save())]]) {
  let delivery;
  try {
    const response = await post(`/deliveries/prepare?projectId=${deliveryProject.id}`, bytes, agency, type, { 'X-File-Name': encodeURIComponent('Approved direction') });
    assert.equal(response.status, 201, await response.clone().text()); delivery = await response.json();
    const file = await upstream('/storage/v1/object/authenticated/delivery-files/' + delivery.storagePath, { token: agency });
    assert.equal(file.status, 200); const output = Buffer.from(await file.arrayBuffer());
    if (type === 'application/pdf') { const clean = await PDFDocument.load(output); assert.equal(clean.getAuthor(), 'Studio'); assert.equal(clean.getSubject(), undefined); assert.deepEqual(clean.getPage(0).getSize(), { width: 420, height: 300 }); }
    else { assert.equal((await sharp(output).metadata()).exif, undefined); assert.equal(delivery.mimeType, 'image/png'); }
    assertions += 3;
  } finally {
    if (delivery) {
      assert.equal((await upstream(`/rest/v1/delivery_files?id=eq.${delivery.id}`, { method: 'DELETE' })).status, 204);
      await backend.discard('delivery-files', delivery.storagePath);
    }
  }
}
assert.equal((await post(`/deliveries/prepare?projectId=${deliveryProject.id}`, Buffer.from('ZIP'), agency, 'application/zip')).status, 415); assertions++;
process.stdout.write(`Media HTTP integration passed ${assertions} checks; temporary source, publication and delivery objects were removed.\n`);
