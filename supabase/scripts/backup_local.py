"""Back up local Supabase data and filesystem Storage, retaining owners and ACLs."""
from pathlib import Path, PurePosixPath
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import tarfile
import tomllib

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'dawes-studios'
FILES = {'database.dump', 'storage.tar.gz'}
SCHEMAS = ['public', 'private', 'auth', 'storage', 'supabase_migrations']
COUNTS_SQL = """select jsonb_build_object(
    'clients',(select count(*) from public.clients),
    'projects',(select count(*) from public.projects),
    'boards',(select count(*) from public.design_boards),
    'auth_users',(select count(*) from auth.users),
    'storage_objects',(select count(*) from storage.objects),
    'credit_balance',(select sum(balance) from public.credit_accounts),
    'credit_ledger_entries',(select count(*) from public.credit_ledger));"""


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def digest_file(path):
    with path.open('rb') as stream:
        return digest_stream(stream)


def digest_stream(stream):
    digest = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(block)
    return digest.hexdigest()


def archive_inventory(path):
    """Reject unsafe archive members before extraction and hash every regular file."""
    files = {}
    with tarfile.open(path, 'r:gz') as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or not (member.isfile() or member.isdir()):
                raise RuntimeError('Storage archive contains an unsafe entry.')
            if member.isfile():
                key = str(name)
                if key in files:
                    raise RuntimeError('Storage archive contains duplicate files.')
                with archive.extractfile(member) as stream:
                    files[key] = {'size': member.size, 'sha256': digest_stream(stream)}
    return files


def sql(statement):
    return json.loads(run(['docker', 'exec', f'supabase_db_{PROJECT}', 'psql',
                           '-U', 'postgres', '-d', 'postgres', '-XAt', '-v',
                           'ON_ERROR_STOP=1', '-c', statement], text=True).stdout)


def audit_foreign_keys(query):
    """Detect historical trigger-bypassing cleanup before accepting a recoverable backup."""
    constraints = query("""select coalesce(jsonb_agg(jsonb_build_object(
        'name',c.conname,'child',c.conrelid::regclass::text,'parent',c.confrelid::regclass::text,
        'columns',(select jsonb_agg(a.attname order by k.ord) from unnest(c.conkey)
            with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num),
        'references',(select jsonb_agg(a.attname order by k.ord) from unnest(c.confkey)
            with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num))),
        '[]') from pg_constraint c join pg_namespace n on n.oid=c.connamespace
        where c.contype='f' and n.nspname in ('public','private','auth','storage');""")
    def identifier(value):
        return '"' + value.replace('"', '""') + '"'
    checks = []
    for constraint in constraints:
        pairs = zip(constraint['columns'], constraint['references'])
        match = ' and '.join(f'p.{identifier(parent)}=c.{identifier(child)}' for child, parent in pairs)
        present = ' and '.join(f'c.{identifier(column)} is not null' for column in constraint['columns'])
        name = constraint['name'].replace("'", "''")
        checks.append(f"select '{name}' as constraint_name,count(*) as orphans "
                      f"from {constraint['child']} c where {present} and not exists "
                      f"(select 1 from {constraint['parent']} p where {match})")
    if not checks:
        raise RuntimeError('Expected foreign keys are missing from the source database.')
    violations = query("select coalesce(jsonb_agg(t),'[]') from (" +
                       ' union all '.join(checks) + ') t where orphans>0;')
    if violations:
        raise RuntimeError('Foreign-key violations require repair before backup/verification: ' +
                           json.dumps(violations))
    return len(constraints)


def backup(destination):
    if tomllib.loads((ROOT / 'supabase/config.toml').read_text())['project_id'] != PROJECT:
        raise RuntimeError('Unexpected project configuration.')
    for service in ['db', 'storage']:
        if run(['docker', 'inspect', '--format', '{{.State.Running}}',
                f'supabase_{service}_{PROJECT}'], text=True).stdout.strip() != 'true':
            raise RuntimeError('The local stack must be running.')
    audit_foreign_keys(sql)
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=False, mode=0o700)
    before = sql(COUNTS_SQL)
    probe = sql("""select row_to_json(t) from (
        select o.bucket_id, o.name, o.version from public.delivery_files d
        join storage.objects o on o.bucket_id='delivery-files' and o.name=d.storage_path
        order by d.storage_path limit 1) t;""")
    if not probe:
        raise RuntimeError('A persisted delivery file is required for the recovery probe.')
    with (destination / 'database.dump').open('wb') as output:
        subprocess.run(['docker', 'exec', f'supabase_db_{PROJECT}', 'pg_dump', '-U',
                        'postgres', '-d', 'postgres', '--format=custom',
                        *[f'--schema={schema}' for schema in SCHEMAS]],
                       stdout=output, stderr=subprocess.PIPE, check=True)
    with (destination / 'storage.tar.gz').open('wb') as output:
        subprocess.run(['docker', 'run', '--rm', '--user', '0:0', '--entrypoint', 'tar',
                        '-v', f'supabase_storage_{PROJECT}:/backup:ro', 'node:24-bookworm-slim',
                        '--xattrs', '--xattrs-include=*', '--acls', '--numeric-owner',
                        '-czf', '-', '-C', '/backup', '.'],
                       stdout=output, stderr=subprocess.PIPE, check=True)
    inventory = archive_inventory(destination / 'storage.tar.gz')
    physical = f'stub/stub/{probe["bucket_id"]}/{probe["name"]}/{probe["version"]}'
    if physical not in inventory:
        raise RuntimeError('Delivery metadata has no matching file in the Storage archive.')
    after = sql(COUNTS_SQL)
    if before != after:
        raise RuntimeError('Source counts changed during backup; retry during a quiet window.')
    metadata = {
        'format_version': 2, 'project_id': PROJECT,
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'database_image': run(['docker', 'inspect', '--format', '{{.Config.Image}}',
                               f'supabase_db_{PROJECT}'], text=True).stdout.strip(),
        'storage_image': run(['docker', 'inspect', '--format', '{{.Config.Image}}',
                              f'supabase_storage_{PROJECT}'], text=True).stdout.strip(),
        'cli_version': run(['supabase', '--version'], text=True).stdout.strip(),
        'counts': after, 'files': {name: digest_file(destination / name) for name in sorted(FILES)},
        'storage_inventory': inventory,
        'delivery_probe': {**probe, **inventory[physical]},
        'database_scope': SCHEMAS,
        'storage_archive_format': 'GNU tar with extended attributes and ACLs',
        'consistency': 'Matching before/after counts are diagnostic, not snapshot isolation. '
                       'Pause application writes or coordinate snapshots for production backups.',
    }
    (destination / 'manifest.json').write_text(json.dumps(metadata, indent=2) + '\n')
    for path in destination.iterdir():
        os.chmod(path, 0o600)
    print(f'Local backup saved to {destination}; {after["clients"]} clients, '
          f'{after["projects"]} projects, {len(inventory)} physical Storage files.')
    return destination


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-only', action='store_true', help='Read-only foreign-key audit; no backup files.')
    parser.add_argument('--output', type=Path, default=ROOT / 'supabase/.backups' /
                        datetime.datetime.now().strftime('%Y%m%dT%H%M%S'))
    args = parser.parse_args()
    if args.check_only:
        print(f'Foreign-key audit passed: {audit_foreign_keys(sql)} relationships checked.')
    else:
        backup(args.output)
