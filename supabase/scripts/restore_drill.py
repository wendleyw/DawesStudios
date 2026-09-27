"""Restore a local backup into a unique, owned Supabase stack; verify Auth, RLS and Storage."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from backup_local import COUNTS_SQL, FILES, PROJECT, ROOT, archive_inventory, audit_foreign_keys, digest_file

RUNS = ROOT / 'supabase/.restore-drill/runs'
EXCLUDED = 'studio,postgres-meta,realtime,edge-runtime,imgproxy,logflare,vector'


def command(args, *, work, stdin=None):
    result = subprocess.run(args, stdin=stdin, capture_output=True)
    if result.returncode:
        log = work / 'operation.log'
        log.write_bytes(result.stdout + result.stderr)
        log.chmod(0o600)
        raise RuntimeError(f'Isolated restore command failed; inspect {log} locally.')
    return result.stdout


def validate_backup(backup):
    manifest = json.loads((backup / 'manifest.json').read_text())
    if manifest.get('format_version') != 2 or manifest.get('project_id') != PROJECT:
        raise RuntimeError('Create a current format-2 local backup before this drill.')
    if set(manifest.get('files', {})) != FILES:
        raise RuntimeError('Backup must contain exactly the expected dump and archive hashes.')
    for name in FILES:
        path = backup / name
        if path.is_symlink() or digest_file(path) != manifest['files'][name]:
            raise RuntimeError('Backup checksum mismatch or symbolic link.')
    inventory = archive_inventory(backup / 'storage.tar.gz')
    if inventory != manifest['storage_inventory']:
        raise RuntimeError('Storage inventory differs from the manifest.')
    probe = manifest['delivery_probe']
    expected = inventory.get(f'stub/stub/{probe["bucket_id"]}/{probe["name"]}/{probe["version"]}')
    if expected != {key: probe[key] for key in ['size', 'sha256']}:
        raise RuntimeError('Delivery probe differs from the archived source bytes.')
    return manifest


def resources(project, work):
    """Capture immutable identities, scoped by the unique CLI project label."""
    result = {}
    for kind, identity in [('container', 'Id'), ('volume', 'CreatedAt'), ('network', 'Id')]:
        ids = command(['docker', kind, 'ls', '-q', '--filter',
                       f'label=com.supabase.cli.project={project}'], work=work).decode().split()
        if kind == 'container':
            ids = command(['docker', 'container', 'ls', '-aq', '--filter',
                           f'label=com.supabase.cli.project={project}'], work=work).decode().split()
        entries = json.loads(command(['docker', kind, 'inspect', *ids], work=work)) if ids else []
        result[kind] = {item['Name'].lstrip('/'): item[identity] for item in entries}
    return result


def assert_owned(target, work):
    if not re.fullmatch(r'dawes-restore-[a-f0-9]{12}', target['project_id']):
        raise RuntimeError('Unrecognized restore target; refusing to operate.')
    if work.resolve() != RUNS / target['project_id']:
        raise RuntimeError('Restore target is outside its owned work directory.')
    if resources(target['project_id'], work) != target['resources']:
        raise RuntimeError('Restore resources changed; refusing mutation or cleanup.')
    required = {f'supabase_{service}_{target["project_id"]}' for service in ['db', 'storage']}
    if not required <= target['resources']['container'].keys():
        raise RuntimeError('Restore database/Storage ownership is incomplete; refusing mutation.')


def available_ports():
    # Check the complete range, including disabled CLI services, before starting anything.
    for base in range(56520, 58520, 20):
        sockets = []
        try:
            for port in range(base, base + 10):
                connection = socket.socket()
                sockets.append(connection)
                connection.bind(('0.0.0.0', port))
            return base
        except OSError:
            continue
        finally:
            for connection in sockets:
                connection.close()
    raise RuntimeError('No free port range for an isolated restore.')


def database(target, work, statement):
    return command(['docker', 'exec', f'supabase_db_{target["project_id"]}', 'sh', '-c',
                    'PGPASSWORD="$POSTGRES_PASSWORD" exec psql "$@"', 'psql',
                    '-U', 'supabase_admin', '-d', 'postgres', '-XAt', '-v',
                    'ON_ERROR_STOP=1', '-c', statement], work=work).decode().strip()


def api(status, path, *, token=None, data=None):
    request = urllib.request.Request(status['API_URL'] + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'apikey': status['ANON_KEY'], 'Authorization': 'Bearer ' +
                 (token or status['ANON_KEY']), 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=15) as response:
        content = response.read()
        return json.loads(content) if 'json' in response.headers.get('Content-Type', '') else content


def rows(status, table, token, columns='*'):
    result = []
    for offset in range(0, 100000, 500):
        page = api(status, f'/rest/v1/{table}?select={columns}&order=id&offset={offset}&limit=500', token=token)
        result.extend(page)
        if len(page) < 500:
            return result
    raise RuntimeError('Restore verification exceeded its row bound.')


def verify_restore(backup, work):
    manifest = validate_backup(backup)
    target = json.loads((work / 'target.json').read_text())
    if target['manifest_sha256'] != digest_file(backup / 'manifest.json'):
        raise RuntimeError('The retained target belongs to a different backup.')
    assert_owned(target, work)
    status = json.loads(command(['supabase', 'status', '--workdir', str(work), '-o', 'json'], work=work))
    if status['API_URL'] != f'http://127.0.0.1:{target["api_port"]}':
        raise RuntimeError('Restore API endpoint differs from the recorded isolated target.')
    counts = json.loads(database(target, work, COUNTS_SQL))
    if counts != manifest['counts']:
        raise RuntimeError('Restored database counts or credit totals differ.')
    foreign_keys = audit_foreign_keys(lambda statement: json.loads(database(target, work, statement)))
    fixture_env = dict(line.split('=', 1) for line in (ROOT / 'supabase/.env.local').read_text().splitlines()
                       if '=' in line and not line.startswith('#'))
    def login(email):
        return api(status, '/auth/v1/token?grant_type=password',
                   data={'email': email, 'password': fixture_env['DEMO_PASSWORD']})
    for attempt in range(30):
        try:
            agency = login('studio@dawes.local')
            break
        except (urllib.error.URLError, TimeoutError):
            if attempt == 29:
                raise RuntimeError('Restored Auth did not become ready.') from None
            time.sleep(1)
    agency_token = agency['access_token']
    for table in ['clients', 'projects']:
        if len(rows(status, table, agency_token)) != counts[table]:
            raise RuntimeError(f'Restored agency cannot read all {table}.')
    boards = rows(status, 'design_boards', agency_token)
    if len(boards) != counts['boards'] or not boards:
        raise RuntimeError('Restored agency board scope differs.')
    client = login('sabre@client.dawes.local')
    client_token = client['access_token']
    clients = rows(status, 'clients', client_token)
    projects = rows(status, 'projects', client_token)
    if len(clients) != 1 or not projects or any(p['client_id'] != clients[0]['id'] for p in projects):
        raise RuntimeError('Restored client tenant isolation differs.')
    for table in ['design_boards', 'design_versions', 'internal_comments']:
        # Round author columns have separate ACLs; use readable IDs to exercise row isolation.
        if rows(status, table, client_token, columns='id'):
            raise RuntimeError(f'Restored RLS exposed internal {table}.')
    for email in ['designer@dawes.local', 'designer2@dawes.local']:
        designer = login(email)
        expected = {b['id'] for b in boards if b['designer_id'] == designer['user']['id']}
        actual = {b['id'] for b in rows(status, 'design_boards', designer['access_token'])}
        if not expected or len(expected) == len(boards) or actual != expected:
            raise RuntimeError('Restored designer board isolation differs.')
    probe = manifest['delivery_probe']
    delivery = api(status, '/storage/v1/object/authenticated/' + probe['bucket_id'] + '/' +
                   urllib.parse.quote(probe['name'], safe='/'), token=agency_token)
    if len(delivery) != probe['size'] or hashlib.sha256(delivery).hexdigest() != probe['sha256']:
        raise RuntimeError('Restored delivery bytes differ from the archived source.')
    archive = work / 'restored-storage.tar.gz'
    with archive.open('wb') as output:
        result = subprocess.run(['docker', 'run', '--rm', '--user', '0:0', '--entrypoint', 'tar',
            '-v', f'supabase_storage_{target["project_id"]}:/verify:ro', 'node:24-bookworm-slim',
            '-czf', '-', '-C', '/verify', '.'], stdout=output, stderr=subprocess.PIPE)
    if result.returncode or archive_inventory(archive) != manifest['storage_inventory']:
        raise RuntimeError('Restored physical Storage inventory differs.')
    archive.unlink()
    evidence = {'backup_created_at': manifest['created_at'], 'restored_project_id': target['project_id'],
                'counts': counts, 'auth_logins': 4, 'client_and_designer_rls': 'passed',
                'delivery_sha256': probe['sha256'], 'authenticated_delivery_download': 'passed',
                'physical_storage_files': len(manifest['storage_inventory']),
                'foreign_keys_checked': foreign_keys,
                'storage_byte_hashes': 'passed', 'backup_checksums': 'passed'}
    (work / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))
    return evidence


def drill(backup, keep=False):
    manifest = validate_backup(backup)
    project = 'dawes-restore-' + uuid.uuid4().hex[:12]
    work = RUNS / project
    work.mkdir(parents=True, exist_ok=False, mode=0o700)
    print(f'Isolated restore work directory: {work}', flush=True)
    if any(resources(project, work).values()):
        raise RuntimeError('Restore project already has Docker resources.')
    base = available_ports()
    config = (ROOT / 'supabase/config.toml').read_text().replace(
        f'project_id = "{PROJECT}"', f'project_id = "{project}"')
    config = re.sub(r'\b5542([0-9])\b', lambda match: str(base + int(match[1])), config)
    config = config.replace('sql_paths = ["./seed.sql"]', 'sql_paths = []')
    (work / 'supabase').mkdir()
    (work / 'supabase/config.toml').write_text(config)
    # A failed startup has uncertain ownership: leave it for inspection, never stop another stack.
    command(['supabase', 'start', '--workdir', str(work), '-x', EXCLUDED], work=work)
    target = {'project_id': project, 'api_port': base + 1,
              'manifest_sha256': digest_file(backup / 'manifest.json'),
              'resources': resources(project, work)}
    (work / 'target.json').write_text(json.dumps(target, indent=2) + '\n')
    try:
        assert_owned(target, work)
        for service, expected in [('db', manifest['database_image']), ('storage', manifest['storage_image'])]:
            image = command(['docker', 'inspect', '--format', '{{.Config.Image}}',
                             f'supabase_{service}_{project}'], work=work).decode().strip()
            if image != expected:
                raise RuntimeError('Restore container image differs from the backup source.')
        services = [f'supabase_{name}_{project}' for name in ['auth', 'rest', 'storage']]
        command(['docker', 'stop', *services], work=work)
        database(target, work, 'drop schema public cascade;')
        with (backup / 'database.dump').open('rb') as source:
            command(['docker', 'exec', '-i', f'supabase_db_{project}', 'sh', '-c',
                     'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_restore "$@"', 'pg_restore',
                     '-U', 'supabase_admin', '-d', 'postgres', '--clean', '--if-exists',
                     '--exit-on-error'], work=work, stdin=source)
        if manifest['database_image'].endswith('/supabase/postgres:17.6.1.106'):
            database(target, work, "alter system set supautils.hint_roles = ''")
            database(target, work, 'select pg_reload_conf()')
        with (backup / 'storage.tar.gz').open('rb') as source:
            command(['docker', 'run', '--rm', '-i', '--user', '0:0', '--entrypoint', 'tar',
                     '-v', f'supabase_storage_{project}:/restore', 'node:24-bookworm-slim',
                     '--xattrs', '--xattrs-include=*', '--acls', '--numeric-owner',
                     '-xzf', '-', '-C', '/restore'], work=work, stdin=source)
        command(['docker', 'start', *services], work=work)
        return verify_restore(backup, work)
    finally:
        if not keep:
            assert_owned(target, work)
            command(['supabase', 'stop', '--workdir', str(work), '--no-backup'], work=work)
            if any(resources(project, work).values()):
                raise RuntimeError('Restore resources remain after cleanup.')
            print('Owned restore containers and volumes removed; evidence retained.', flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('backup', type=Path)
    parser.add_argument('--keep', action='store_true')
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--workdir', type=Path, help='Required with --verify-only; printed by the retained run.')
    args = parser.parse_args()
    if args.verify_only:
        if args.workdir is None:
            parser.error('--verify-only requires the retained --workdir')
        verify_restore(args.backup.resolve(), args.workdir.resolve())
    else:
        if args.workdir is not None:
            parser.error('--workdir is only accepted with --verify-only')
        drill(args.backup.resolve(), args.keep)
