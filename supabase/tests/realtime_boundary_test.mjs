import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '../../apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';

const env = Object.fromEntries((await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split('\n').filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55421', 'Realtime tests run only on the isolated local studio');
const fixtures = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8'));
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const clients = [];
const received = [];
const created = [];
const marker = 'Realtime boundary ' + randomUUID();
const projectId = fixtures.projects[15].id;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
function deleteComment(item) {
  assert.match(item.id, /^[0-9a-f-]{36}$/);
  assert.ok(['client', 'internal'].includes(item.channel));
  const authors = item.channel === 'client' ? `delete from private.client_comment_authors where comment_id='${item.id}';` : '';
  execFileSync('docker', ['exec', 'supabase_db_dawes-studios', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `begin; ${authors} delete from public.${item.channel}_comments where id='${item.id}'; commit;`], { stdio: 'pipe' });
}
try {
  for (const [name, email] of [['agency', 'studio@dawes.local'], ['client', 'sabre@client.dawes.local'], ['foreign', 'acme@client.dawes.local'], ['designer', 'designer@dawes.local']]) {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    checked(await client.auth.signInWithPassword({ email, password: env.DEMO_PASSWORD }));
    clients.push({ name, client });
    const channel = client.channel(marker + name);
    for (const table of ['internal_comments', 'client_comments']) channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => received.push({ name, table, type: payload.eventType, id: payload.new.id ?? payload.old.id }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Realtime subscription timed out for ' + name)), 12000);
      channel.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); reject(new Error('Realtime subscription failed for ' + name)); } });
    });
  }
  // The local replication worker initializes on its first connection after a fresh reset.
  await sleep(500);
  const agency = clients[0].client;
  for (const channel of ['internal', 'client']) {
    const id = checked(await agency.rpc('post_comment', { p_project_id: projectId, p_channel: channel, p_body: marker }));
    created.push({ channel, id });
  }
  const deadline = Date.now() + 10000;
  const expectedRecipients = item => item.channel === 'internal' ? ['agency', 'designer'] : ['agency', 'client'];
  while (!created.every(item => expectedRecipients(item).every(name => received.some(event => event.id === item.id && event.type === 'INSERT' && event.name === name))) && Date.now() < deadline) await sleep(100);
  for (const item of created) {
    const authorized = item.channel === 'internal' ? ['agency', 'designer'] : ['agency', 'client'];
    assert.deepEqual(received.filter(event => event.id === item.id && event.type === 'INSERT').map(event => event.name).sort(), authorized.sort(), 'Only authorized sessions receive ' + item.channel + ' events');
  }
  for (const item of created) deleteComment(item);
  await sleep(1500);
  assert.equal(received.filter(event => event.type === 'DELETE').length, 0, 'The dedicated publication must not broadcast deleted private row identifiers');
  assert.equal(received.filter(event => event.name === 'foreign').length, 0, 'A different client must receive no row or event-count signal');
  process.stdout.write('Realtime boundary PASS: four authenticated subscriptions; internal/client recipients match RLS; cross-client events absent; deleted-row events disabled.\n');
} finally {
  for (const item of created) deleteComment(item);
  await service.from('notifications').delete().eq('body', marker);
  await Promise.all(clients.map(async ({ client }) => { await client.removeAllChannels(); await client.auth.signOut({ scope: 'local' }); }));
}
