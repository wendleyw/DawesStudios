"""Local-only snapshots and guarded rollback for the temporary SABRE dataset."""
import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
CLIENT_ID = 'e4401a17-cbe2-1d70-400d-d40f9e6b8632'
STATE_DIR = ROOT / 'supabase/.local/sabre-demo'
STATE_PATH = STATE_DIR / 'state.json'
PROJECTS = f"select id from public.projects where client_id='{CLIENT_ID}'"
BRIEFINGS = f"select id from public.briefings where client_id='{CLIENT_ID}'"
PUBLICATIONS = f"select id from public.published_versions where project_id in ({PROJECTS})"
DESIGN_BOARDS = f"select id from public.design_boards where project_id in ({PROJECTS})"
ROUNDS = f"select id from public.design_versions where project_id in ({PROJECTS})"
COMMENTS = f"select id from public.client_comments where project_id in ({PROJECTS})"
BOARDS = f"select id from public.playground_boards where client_id='{CLIENT_ID}'"
# Parent-first ordering; rollback deletes additions in reverse before restoring changed rows.
# The Miro model (design boards, rounds, client versions, their links and covers) and the monthly
# credit tables are in scope. Cover bytes live under `project-covers/<project id>/`, which the
# Storage snapshot below already covers through its project-id prefix. `public.designs` and
# `public.published_designs` were dropped by 202609270007; a checkpoint that still lists them is
# read with `layer_tables`, which ignores tables that are no longer in scope.
SCOPES = {
    'public.clients': f"id='{CLIENT_ID}'",
    'public.campaigns': f"client_id='{CLIENT_ID}'",
    'public.briefings': f"client_id='{CLIENT_ID}'",
    'public.projects': f"client_id='{CLIENT_ID}'",
    'public.credit_accounts': f"client_id='{CLIENT_ID}'",
    'public.credit_plans': f"client_id='{CLIENT_ID}'",
    'public.credit_months': f"client_id='{CLIENT_ID}'",
    'public.credit_ledger': f"client_id='{CLIENT_ID}'",
    'public.credit_requests': f"client_id='{CLIENT_ID}'",
    'public.project_settlements': f'project_id in ({PROJECTS})',
    'public.deliverables': f'project_id in ({PROJECTS})',
    'public.project_assignments': f'project_id in ({PROJECTS})',
    'public.design_boards': f'project_id in ({PROJECTS})',
    'public.design_versions': f'project_id in ({PROJECTS})',
    'public.design_version_miro_links': f'project_id in ({PROJECTS})',
    'public.published_versions': f'project_id in ({PROJECTS})',
    'public.publication_miro_links': f'project_id in ({PROJECTS})',
    'public.publication_reviews': f'project_id in ({PROJECTS})',
    'public.internal_comments': f'project_id in ({PROJECTS})',
    'public.client_comments': f'project_id in ({PROJECTS})',
    'public.project_assets': f'project_id in ({PROJECTS})',
    'public.project_covers': f'project_id in ({PROJECTS})',
    'public.delivery_files': f'project_id in ({PROJECTS})',
    'public.briefing_attachments': f'briefing_id in ({BRIEFINGS})',
    'public.brand_sections': f"client_id='{CLIENT_ID}'",
    'public.brand_assets': f"client_id='{CLIENT_ID}'",
    'public.brand_templates': f"client_id='{CLIENT_ID}'",
    'public.template_drafts': f"client_id='{CLIENT_ID}'",
    'public.playground_boards': f"client_id='{CLIENT_ID}'",
    'public.playground_items': f'board_id in ({BOARDS})',
    'public.notifications': f"client_id='{CLIENT_ID}'",
    'private.publication_sources': f'publication_id in ({PUBLICATIONS})',
    'private.miro_share_requests': f'project_id in ({PROJECTS})',
    'private.client_comment_authors': f'comment_id in ({COMMENTS})',
    'private.sanitized_assets': f'project_id in ({PROJECTS})',
    'private.audit_events': f"entity_id in ({PROJECTS} union {BRIEFINGS} union {PUBLICATIONS} union {DESIGN_BOARDS} union {ROUNDS} union select '{CLIENT_ID}'::uuid)",
}


def assert_local(url):
    parsed = urlparse(url)
    if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.port != 55421 or parsed.path not in ('', '/'):
        raise RuntimeError('SABRE demo operations are restricted to the local Dawes backend on port 55421.')
    import tomllib
    if tomllib.loads((ROOT / 'supabase/config.toml').read_text())['project_id'] != 'dawes-studios':
        raise RuntimeError('Unexpected local Supabase project.')


def sql(statement):
    result = subprocess.run(['docker', 'exec', '-i', 'supabase_db_dawes-studios', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True, capture_output=True, timeout=90)
    if result.returncode:
        raise RuntimeError('Local demo SQL failed: ' + result.stderr[:1500])
    return result.stdout.strip()


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def snapshot():
    fields = ','.join(f"{quote(table)},(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from {table} t where {scope})" for table, scope in SCOPES.items())
    rows = json.loads(sql(f'select jsonb_build_object({fields});'))
    pks = json.loads(sql("select json_object_agg(tab,cols) from (select n.nspname||'.'||c.relname tab,array_agg(a.attname order by x.ord) cols from pg_constraint p join pg_class c on c.oid=p.conrelid join pg_namespace n on n.oid=c.relnamespace cross join lateral unnest(p.conkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.oid and a.attnum=x.attnum where p.contype='p' group by n.nspname,c.relname) t;"))
    roots = [CLIENT_ID] + [r['id'] for t in ['public.projects', 'public.briefings', 'public.playground_boards'] for r in rows[t]]
    storage = json.loads(sql("select coalesce(json_agg(json_build_object('bucket',bucket_id,'path',name,'size',metadata->>'size') order by bucket_id,name),'[]') from storage.objects where split_part(name,'/',1) in (" + ','.join(quote(r) for r in roots) + ');'))
    columns = json.loads(sql("select json_object_agg(tab,cols) from (select table_schema||'.'||table_name tab,array_agg(column_name::text order by ordinal_position) cols from information_schema.columns group by 1) t;"))
    return {'rows': rows, 'keys': {table: pks[table] for table in SCOPES}, 'storage': storage,
            'columns': {table: columns[table] for table in SCOPES}}


def save(state):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    temp = STATE_PATH.with_suffix('.next.json')
    temp.write_text(json.dumps(state, indent=2) + '\n')
    temp.chmod(0o600)
    temp.replace(STATE_PATH)


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def layer_tables(before, after):
    """Tables a before/after pair can compare: in scope today and captured by both snapshots.

    A checkpoint written before a scope change (an older overlay) still loads: tables it lacks are
    covered by a later layer (see `Demo.backfill`), and tables since dropped are ignored.
    """
    return [table for table in SCOPES if table in before['rows'] and table in after['rows']]


def restrict(value, tables):
    """The snapshot rows of `tables`, the part of a snapshot that a layer's guards compare."""
    return {table: value['rows'].get(table) for table in tables}


def rows_match(saved, current, tables):
    """Whether `current` still holds exactly the rows `saved` recorded, across schema changes.

    Rows compare on the columns both snapshots have. A column a later migration added (absent from
    every saved row) matches only while it is null in the current row; a dropped column is ignored.
    A table with no saved rows cannot say which columns it had, so it matches only an empty table.
    """
    for table in tables:
        old, new = saved['rows'].get(table) or [], current['rows'].get(table) or []
        if len(old) != len(new):
            return False
        if not old:
            continue
        old_columns = set().union(*old)
        new_columns = set().union(*new)
        if any(row.get(column) is not None for row in new for column in new_columns - old_columns):
            return False
        shared = old_columns & new_columns
        def project(rows): return sorted(json.dumps({k: row.get(k) for k in shared}, sort_keys=True) for row in rows)
        if project(old) != project(new):
            return False
    return True


def snapshot_match(saved, current, tables):
    """`rows_match` plus the Storage objects, which carry no schema."""
    return rows_match(saved, current, tables) and fingerprint(saved['storage']) == fingerprint(current['storage'])


def difference(before, after):
    changes = {}
    for table in layer_tables(before, after):
        keys = before['keys'][table]
        def key(row): return tuple(row[k] for k in keys)
        old = {key(row): row for row in before['rows'][table]}
        new = {key(row): row for row in after['rows'][table]}
        if set(old) - set(new):
            raise RuntimeError(f'Original records were removed from {table}; automatic rollback is unavailable.')
        changes[table] = {'added': [new[k] for k in new.keys() - old.keys()], 'changed': [old[k] for k in old if old[k] != new[k]]}
    return changes


def rollback_sql(before, after, columns=None):
    """One transaction that deletes the rows a layer added and restores the rows it changed.

    `columns` (a current snapshot's column lists) limits restored columns to those that still exist,
    so a column dropped since the checkpoint does not break the restore."""
    changes = difference(before, after)
    statements = ['begin;', 'set local session_replication_role=replica;']
    for table in reversed(list(changes)):
        keys = before['keys'][table]
        for row in changes[table]['added']:
            where = ' and '.join(f'"{k}"={quote(row[k])}' for k in keys)
            statements.append(f'delete from {table} where {where};')
    for table in changes:
        keys = before['keys'][table]
        for row in changes[table]['changed']:
            present = (columns or {}).get(table)
            restored = [c for c in row if c not in keys and (present is None or c in present)]
            names = ','.join('"' + c + '"' for c in restored)
            values = ','.join('original."' + c + '"' for c in restored)
            where = ' and '.join(f't."{k}"=original."{k}"' for k in keys)
            statements.append(f'update {table} t set ({names})=({values}) from json_populate_record(null::{table},{quote(json.dumps(row))}) original where {where};')
    statements.append('commit;')
    return '\n'.join(statements)
