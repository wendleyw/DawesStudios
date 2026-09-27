"""One-time cleanup of the Storage bytes left behind by the retired legacy Versions schema.

Migration `202609270007_retire_versions_schema.sql` deleted the legacy per-deliverable `designs` /
`published_designs` rows and recorded every Storage path they referenced in
`private.retired_version_objects`, because a migration cannot delete Storage bytes -- only Postgres
rows. It could not drop the `published-assets` bucket either, because objects still lived in it.
This script is the follow-up: it deletes those bytes through the Storage API (a migration cannot do
that) and reports the counts so the next migration can drop the now-empty bucket, its storage
policies, and `private.retired_version_objects` itself.

Three categories, always computed against what actually still exists in `storage.objects` (not
just what a table row claims), so a second run after `--apply` finds nothing left and the whole
script is idempotent:

  (a) every path in `private.retired_version_objects` that still has a matching Storage object.
  (b) every object remaining in the `published-assets` bucket, regardless of (a): nothing in this
      codebase publishes to that bucket any more, so a blanket sweep is safe even if some object
      was missed when `retired_version_objects` was populated.
  (c) `internal-assets` objects at least 24 hours old (the same staleness floor
      `list_stale_sanitized_assets` uses elsewhere) that no `project_assets` row references and
      that are not already covered by (a). `project_assets` is the only table that still points
      into `internal-assets` today; a live upload always gets a `project_assets` row synchronously
      right after the object is written, or is cleaned up client-side on an interrupted upload
      (`removeUnusedUpload` in `apps/web/features/assets/asset-data.ts`), so anything left after 24
      hours with no such row is a leftover from the retired design/round upload pipeline (a
      `.raw` pre-sanitisation source, an attested video that was never attached to a design, or
      similar) rather than an in-flight upload. `project_assets` objects, `project-covers` objects
      and `delivery-files` objects are never touched by any category here.

Default is a dry run: it prints the counts (and, for (c), the exact paths, since that category is
derived rather than read from a fixed table) without deleting anything. `--apply` deletes through
the Storage API as the service role, in batches of 100 paths per bucket, mirroring
`sabre_demo.py`'s own guarded removal.

    python3 supabase/scripts/cleanup_versions_storage.py            # dry run
    python3 supabase/scripts/cleanup_versions_storage.py --apply     # delete
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sabre_demo_state import ROOT, assert_local, sql

BATCH = 100


def env():
    return dict(
        line.split('=', 1)
        for line in (ROOT / 'supabase/.env.local').read_text().splitlines()
        if '=' in line and not line.startswith('#')
    )


def has_retired_table():
    return sql("select (to_regclass('private.retired_version_objects') is not null)::text;") == 'true'


def existing_paths(bucket, where=''):
    rows = sql(
        f"select coalesce(json_agg(name order by name),'[]') from storage.objects "
        f"where bucket_id='{bucket}'{(' and ' + where) if where else ''};"
    )
    return json.loads(rows)


def category_a():
    """Retired paths (from the migration's inventory) that still have a Storage object."""
    if not has_retired_table():
        return {'internal-assets': [], 'published-assets': []}
    result = {}
    for bucket in ('internal-assets', 'published-assets'):
        rows = sql(
            "select coalesce(json_agg(o.name order by o.name),'[]') from storage.objects o "
            f"join private.retired_version_objects r on r.bucket_id=o.bucket_id and r.storage_path=o.name "
            f"where o.bucket_id='{bucket}';"
        )
        result[bucket] = json.loads(rows)
    return result


def category_b():
    """Every object still in `published-assets`, regardless of (a)."""
    return existing_paths('published-assets')


def category_c(already):
    """Stale, unreferenced `internal-assets` objects not already covered by (a)."""
    excluded = ' and '.join(f"o.name <> '{path}'" for path in already) if already else 'true'
    rows = sql(
        "select coalesce(json_agg(o.name order by o.name),'[]') from storage.objects o "
        "where o.bucket_id='internal-assets' "
        "and o.created_at < now() - interval '24 hours' "
        "and not exists(select 1 from public.project_assets pa where pa.storage_path = o.name) "
        f"and {excluded};"
    )
    return json.loads(rows)


def request(base_url, anon_key, service_key, bucket, paths):
    body = json.dumps({'prefixes': paths}).encode()
    req = urllib.request.Request(
        base_url + '/storage/v1/object/' + bucket,
        data=body,
        method='DELETE',
        headers={
            'apikey': anon_key,
            'Authorization': 'Bearer ' + service_key,
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def delete_all(base_url, anon_key, service_key, bucket, paths):
    for i in range(0, len(paths), BATCH):
        request(base_url, anon_key, service_key, bucket, paths[i : i + BATCH])


def report():
    a = category_a()
    b = category_b()
    c = category_c(a['internal-assets'])
    internal_delete = sorted(set(a['internal-assets']) | set(c))
    published_delete = sorted(set(a['published-assets']) | set(b))
    return {
        'retired_version_objects_present': has_retired_table(),
        'category_a_retired_internal': len(a['internal-assets']),
        'category_a_retired_published': len(a['published-assets']),
        'category_b_published_all': len(b),
        'category_c_orphaned_internal': len(c),
        'category_c_paths': c,
        'to_delete_internal_assets': len(internal_delete),
        'to_delete_published_assets': len(published_delete),
        'internal_paths': internal_delete,
        'published_paths': published_delete,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Delete through the Storage API instead of only counting.')
    args = parser.parse_args()

    variables = env()
    base_url = variables['SUPABASE_URL']
    assert_local(base_url)
    anon_key = variables['SUPABASE_ANON_KEY']
    service_key = variables['SUPABASE_SERVICE_ROLE_KEY']

    data = report()
    summary = {k: v for k, v in data.items() if k not in ('internal_paths', 'published_paths')}
    print(json.dumps(summary, indent=2))

    if not args.apply:
        print(f"Dry run: would delete {data['to_delete_internal_assets']} internal-assets object(s) "
              f"and {data['to_delete_published_assets']} published-assets object(s). Re-run with --apply.")
        return

    if data['internal_paths']:
        delete_all(base_url, anon_key, service_key, 'internal-assets', data['internal_paths'])
    if data['published_paths']:
        delete_all(base_url, anon_key, service_key, 'published-assets', data['published_paths'])

    after = report()
    print(json.dumps(
        {k: v for k, v in after.items() if k not in ('internal_paths', 'published_paths')},
        indent=2,
    ))
    if after['to_delete_internal_assets'] or after['to_delete_published_assets']:
        raise RuntimeError('Objects remain after deletion; investigate before dropping the bucket.')
    print('Cleanup complete: no retired-Versions bytes remain in internal-assets or published-assets.')


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        print(f'Storage API error {error.code}: {error.read()[:500]}', file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print(f'Cleanup stopped: {error}', file=sys.stderr)
        sys.exit(1)
