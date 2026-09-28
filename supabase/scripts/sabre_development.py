"""Preview or apply the guarded local SABRE-only development dataset.

This is intentionally separate from the canonical seed and the SABRE demo rollback.
Run without flags for a read-only plan. Application requires --apply, a verified full
backup, the exact expected local dataset, and a stopped web/media writer window.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.request

from backup_local import audit_foreign_keys, digest_file
from sabre_demo_state import CLIENT_ID, ROOT, assert_local, sql

BACKUP = ROOT / 'supabase/.backups/20260928-before-sabre-only'
STATE = ROOT / 'supabase/.local/sabre-development/plan.json'
EXPECTED = {
    '65ea09bf-830a-ebd8-c3e2-f1fe7f48ffb2': ('Brand Guidelines', 'in_progress'),
    'c4737460-ac76-a16f-c89c-e192eb80ca4d': ('Social Launch', 'in_progress'),
    '15e2d399-e215-9707-9499-96b455c83adf': ('Campaign Landing Page', 'client_review'),
    '9e5d7758-1103-4e40-9436-9bdffc52b4dc': ('Trail Weekend Social Series', 'changes_requested'),
    'fc3cef34-ea15-9c0c-27e7-6723f0ff3f2b': ('Email Banner', 'approved'),
    'e8654248-aafa-4b3a-a682-3f4474a52324': ('Everyday Essentials Launch', 'delivered'),
}
BACKLOG = 'c4737460-ac76-a16f-c89c-e192eb80ca4d'
KEEP_SQL = ','.join("'" + value + "'::uuid" for value in EXPECTED)
SABRE_SQL = "'" + CLIENT_ID + "'::uuid"


def query(statement):
    return json.loads(sql(statement))


def environment():
    values = dict(line.split('=', 1) for line in (ROOT / 'supabase/.env.local').read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    assert_local(values['SUPABASE_URL'])
    return values


def verify_backup():
    manifest = json.loads((BACKUP / 'manifest.json').read_text())
    if manifest['project_id'] != 'dawes-studios' or manifest['format_version'] != 2:
        raise RuntimeError('The required local backup has the wrong project or format.')
    if manifest['counts']['clients'] != 10 or manifest['counts']['projects'] != 68:
        raise RuntimeError('The required backup does not contain the expected pre-pruning dataset.')
    for name in ('database.dump', 'storage.tar.gz'):
        if digest_file(BACKUP / name) != manifest['files'][name]:
            raise RuntimeError('The required backup failed its SHA-256 check: ' + name)
    if not manifest.get('delivery_probe') or not manifest.get('storage_inventory'):
        raise RuntimeError('The backup lacks a verified delivery-file/Storage inventory.')
    return manifest


def current():
    return query(f"""select jsonb_build_object(
        'clients',(select count(*) from public.clients),
        'projects',(select count(*) from public.projects),
        'sabre_projects',(select count(*) from public.projects where client_id={SABRE_SQL}),
        'selected',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,
            'status',p.status,'activity',p.activity,'boards',
            (select count(*) from public.design_boards b where b.project_id=p.id),
            'designers',(select count(*) from public.project_assignments a where a.project_id=p.id),
            'versions',(select count(*) from public.published_versions v where v.project_id=p.id),
            'files',(select count(*) from public.delivery_files f where f.project_id=p.id),
            'requests',(select count(*) from public.board_work_requests r where r.project_id=p.id))
            order by p.id),'[]'::jsonb) from public.projects p where p.id in ({KEEP_SQL})),
        'sabre_balance',(select balance from public.credit_accounts where client_id={SABRE_SQL}),
        'sabre_ledger',(select coalesce(sum(amount),0) from public.credit_ledger where client_id={SABRE_SQL}),
        'workflow_attempts',(select count(*) from private.workflow_attempts)
    );""")


def validate_source(data):
    if (data['clients'], data['projects'], data['sabre_projects']) != (10, 68, 50):
        raise RuntimeError('The live client/project counts changed; inspect the dataset before pruning.')
    selected = {row['id']: row for row in data['selected']}
    if set(selected) != set(EXPECTED):
        raise RuntimeError('One or more selected SABRE projects are missing.')
    for project_id, (title, status) in EXPECTED.items():
        row = selected[project_id]
        if row['title'] != title or row['status'] != status or row['activity'] != 'active':
            raise RuntimeError('A selected project changed: ' + project_id)
    if selected['65ea09bf-830a-ebd8-c3e2-f1fe7f48ffb2']['designers'] != 2:
        raise RuntimeError('The two-designer in-progress example changed.')
    if data['sabre_balance'] != data['sabre_ledger']:
        raise RuntimeError('SABRE account and ledger disagree before pruning.')


def plan():
    data = current()
    validate_source(data)
    details = query(f"""with dropped_projects as (
        select id,briefing_id from public.projects where id not in ({KEEP_SQL})
    ), dropped_clients as (
        select id from public.clients where id <> {SABRE_SQL}
    ), dropped_briefings as (
        select b.id from public.briefings b where b.client_id in (select id from dropped_clients)
        or b.id in (select briefing_id from dropped_projects)
    ), dropped_boards as (
        select id from public.playground_boards where client_id in (select id from dropped_clients)
        or project_id in (select id from dropped_projects)
    ), dropped_design_boards as (
        select id from public.design_boards where project_id in (select id from dropped_projects)
    ), scoped_refs as (
        select 'brand-assets'::text bucket,storage_path path from public.brand_assets
            where client_id in (select id from dropped_clients) and storage_path is not null
        union all select 'briefing-files',storage_path from public.briefing_attachments
            where briefing_id in (select id from dropped_briefings)
        union all select 'delivery-files',storage_path from public.delivery_files
            where project_id in (select id from dropped_projects)
        union all select 'internal-assets',storage_path from public.project_assets
            where project_id in (select id from dropped_projects)
        union all select 'project-covers',storage_path from public.project_covers
            where project_id in (select id from dropped_projects)
        union all select bucket_id,storage_path from private.sanitized_assets
            where project_id in (select id from dropped_projects)
        union all select bucket_id,source_path from private.sanitized_assets
            where project_id in (select id from dropped_projects)
        union all select 'playground-assets',asset_path from public.playground_items
            where board_id in (select id from dropped_boards) and asset_path is not null
    ), kept_refs as (
        select 'brand-assets'::text bucket,storage_path path from public.brand_assets
            where client_id not in (select id from dropped_clients) and storage_path is not null
        union all select 'briefing-files',storage_path from public.briefing_attachments
            where briefing_id not in (select id from dropped_briefings)
        union all select 'delivery-files',storage_path from public.delivery_files
            where project_id not in (select id from dropped_projects)
        union all select 'internal-assets',storage_path from public.project_assets
            where project_id not in (select id from dropped_projects)
        union all select 'project-covers',storage_path from public.project_covers
            where project_id not in (select id from dropped_projects)
        union all select bucket_id,storage_path from private.sanitized_assets
            where project_id not in (select id from dropped_projects)
        union all select bucket_id,source_path from private.sanitized_assets
            where project_id not in (select id from dropped_projects)
        union all select 'playground-assets',asset_path from public.playground_items
            where board_id not in (select id from dropped_boards) and asset_path is not null
    ), removed_objects as (
        select o.bucket_id,o.name from storage.objects o where
        (o.bucket_id='brand-assets' and exists
            (select 1 from dropped_clients c where o.name like c.id::text || '/%'))
        or (o.bucket_id='briefing-files' and exists
            (select 1 from dropped_briefings b where o.name like b.id::text || '/%'))
        or (o.bucket_id in ('project-covers','internal-assets','delivery-files') and exists
            (select 1 from dropped_projects p where o.name like p.id::text || '/%'))
        or (o.bucket_id='playground-assets' and exists
            (select 1 from dropped_boards b where o.name like b.id::text || '/%'))
        or exists (select 1 from scoped_refs r where r.bucket=o.bucket_id and r.path=o.name)
    ) select jsonb_build_object(
        'removed_clients',(select count(*) from dropped_clients),
        'removed_projects',(select count(*) from dropped_projects),
        'removed_briefings',(select count(*) from dropped_briefings),
        'removed_project_debits',(select count(*) from public.credit_ledger
            where project_id in (select id from dropped_projects)),
        'removed_ledger_entries',(select count(*) from public.credit_ledger
            where client_id in (select id from dropped_clients)
               or project_id in (select id from dropped_projects)),
        'removed_workflow_attempts',(select count(*) from private.workflow_attempts w
            where exists(select 1 from dropped_projects p
                where w.payload::text like '%' || p.id::text || '%'
                   or w.result::text like '%' || p.id::text || '%')
               or exists(select 1 from dropped_design_boards b
                where w.payload::text like '%' || b.id::text || '%'
                   or w.result::text like '%' || b.id::text || '%')),
        'kept_storage_conflicts',(select count(*) from removed_objects o join kept_refs r
            on r.bucket=o.bucket_id and r.path=o.name),
        'sabre_debit_refund',(select coalesce(-sum(amount),0) from public.credit_ledger
            where client_id={SABRE_SQL} and project_id in (select id from dropped_projects)),
        'removed_storage', (select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)
            order by bucket_id,name),'[]'::jsonb) from removed_objects),
        'removed_memberships',(select count(*) from public.client_memberships m
            where m.client_id in (select id from dropped_clients))
    );""")
    if details['removed_clients'] != 9 or details['removed_projects'] != 62:
        raise RuntimeError('The removal scope is not exactly nine clients and 62 projects.')
    if details['removed_project_debits'] != 62:
        raise RuntimeError('A project debit is missing or duplicated; billing needs inspection.')
    if details['kept_storage_conflicts']:
        raise RuntimeError('A scoped Storage object is still referenced by retained content.')
    return {'before': data, 'scope': details,
            'fingerprint': hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()}


DELETE_SQL = f"""
begin;
set local statement_timeout = '2min';
set local lock_timeout = '10s';
create temp table prune_clients on commit drop as select id from public.clients where id <> {SABRE_SQL};
create temp table prune_projects on commit drop as select id,client_id,briefing_id from public.projects where id not in ({KEEP_SQL});
create temp table prune_briefings on commit drop as select id from public.briefings
    where client_id in (select id from prune_clients)
       or id in (select briefing_id from prune_projects);
create temp table prune_design_boards on commit drop as select id from public.design_boards
    where project_id in (select id from prune_projects);
create temp table prune_rounds on commit drop as select id from public.design_versions
    where project_id in (select id from prune_projects);
create temp table prune_publications on commit drop as select id from public.published_versions
    where project_id in (select id from prune_projects);
create temp table prune_comments on commit drop as select id from public.client_comments
    where project_id in (select id from prune_projects);
create temp table prune_playgrounds on commit drop as select id from public.playground_boards
    where client_id in (select id from prune_clients) or project_id in (select id from prune_projects);
create temp table prune_templates on commit drop as select id from public.brand_templates
    where client_id in (select id from prune_clients);
create temp table prune_credit on commit drop as select client_id,month,sum(-amount)::integer refund
    from public.credit_ledger where client_id={SABRE_SQL}
    and project_id in (select id from prune_projects) group by client_id,month;
create temp table prune_workflow_attempts on commit drop as select w.request_id
    from private.workflow_attempts w where exists(
        select 1 from prune_projects p where w.payload::text like '%' || p.id::text || '%'
            or w.result::text like '%' || p.id::text || '%')
       or exists(select 1 from prune_design_boards b
            where w.payload::text like '%' || b.id::text || '%'
               or w.result::text like '%' || b.id::text || '%');
do $$ begin
    if (select count(*) from prune_clients) <> 9 or (select count(*) from prune_projects) <> 62
       or (select count(*) from public.projects where id in ({KEEP_SQL})) <> 6 then
        raise exception 'Dataset changed during SABRE pruning';
    end if;
end $$;
-- Only the two immutable-history guards block this explicitly authorized fixture pruning.
-- Transaction rollback restores their enabled state on any error.
alter table public.published_versions disable trigger immutable_published_versions;
alter table public.credit_ledger disable trigger immutable_credit_ledger;
delete from private.workflow_attempts where request_id in (select request_id from prune_workflow_attempts);
delete from private.client_comment_authors where comment_id in (select id from prune_comments);
delete from private.feedback_handoff_receipts where project_id in (select id from prune_projects);
delete from private.publication_round_sources where publication_id in (select id from prune_publications);
delete from private.publication_sources where publication_id in (select id from prune_publications);
delete from private.miro_share_requests where project_id in (select id from prune_projects);
delete from private.production_brief_requests where board_id in (select id from prune_design_boards);
delete from private.sanitized_assets where project_id in (select id from prune_projects);
delete from private.invitation_tokens where invitation_id in (
    select id from public.invitations where client_id in (select id from prune_clients));
delete from private.audit_events where entity_id in (
    select id from prune_clients union select id from prune_projects union
    select id from prune_briefings union select id from prune_design_boards union
    select id from prune_rounds union select id from prune_publications union
    select id from prune_comments union select id from prune_playgrounds);
delete from public.notifications where client_id in (select id from prune_clients)
    or project_id in (select id from prune_projects);
delete from public.playground_items where board_id in (select id from prune_playgrounds);
delete from public.playground_boards where id in (select id from prune_playgrounds);
delete from public.production_brief_drafts where board_id in (select id from prune_design_boards);
delete from public.production_briefs where board_id in (select id from prune_design_boards);
delete from public.internal_comments where project_id in (select id from prune_projects);
delete from public.client_comments where id in (select id from prune_comments);
delete from public.publication_reviews where project_id in (select id from prune_projects);
delete from public.publication_miro_links where project_id in (select id from prune_projects);
delete from public.design_version_miro_links where project_id in (select id from prune_projects);
update public.design_versions set work_request_id=null where project_id in (select id from prune_projects);
delete from public.board_work_requests where project_id in (select id from prune_projects);
delete from public.design_versions where id in (select id from prune_rounds);
delete from public.published_versions where id in (select id from prune_publications);
delete from public.project_covers where project_id in (select id from prune_projects);
delete from public.project_drive_links where project_id in (select id from prune_projects);
delete from public.project_assets where project_id in (select id from prune_projects);
delete from public.delivery_files where project_id in (select id from prune_projects);
delete from public.project_settlements where project_id in (select id from prune_projects);
delete from public.deliverables where project_id in (select id from prune_projects);
delete from public.design_boards where id in (select id from prune_design_boards);
delete from public.project_assignments where project_id in (select id from prune_projects);
delete from public.credit_requests where client_id in (select id from prune_clients);
delete from public.credit_ledger where client_id in (select id from prune_clients)
    or project_id in (select id from prune_projects);
update public.credit_months m set balance=m.balance+c.refund,updated_at=now()
    from prune_credit c where m.client_id=c.client_id and m.month=c.month;
update public.credit_accounts a set balance=a.balance+c.refund,updated_at=now()
    from (select client_id,sum(refund) refund from prune_credit group by client_id) c
    where a.client_id=c.client_id;
with running as (
    select id,sum(amount) over (partition by client_id order by created_at,id)::integer balance
    from public.credit_ledger where client_id={SABRE_SQL}
) update public.credit_ledger l set balance_after=r.balance from running r where l.id=r.id;
update public.projects set activity='backlog',workflow_revision=workflow_revision+1
    where id='{BACKLOG}'::uuid;
delete from public.projects where id in (select id from prune_projects);
delete from public.briefing_attachments where briefing_id in (select id from prune_briefings);
delete from public.briefings where id in (select id from prune_briefings);
delete from public.campaigns where client_id in (select id from prune_clients);
delete from public.template_drafts where client_id in (select id from prune_clients)
    or template_id in (select id from prune_templates);
delete from public.brand_templates where id in (select id from prune_templates);
delete from public.brand_assets where client_id in (select id from prune_clients);
delete from public.brand_asset_folders where client_id in (select id from prune_clients);
delete from public.brand_sections where client_id in (select id from prune_clients);
delete from public.client_board_widgets where client_id in (select id from prune_clients);
delete from public.competitors where client_id in (select id from prune_clients);
delete from public.board_preferences where client_id in (select id from prune_clients);
delete from public.credit_months where client_id in (select id from prune_clients);
delete from public.credit_plans where client_id in (select id from prune_clients);
delete from public.credit_accounts where client_id in (select id from prune_clients);
delete from public.client_memberships where client_id in (select id from prune_clients);
delete from public.invitations where client_id in (select id from prune_clients);
delete from public.clients where id in (select id from prune_clients);
alter table public.credit_ledger enable trigger immutable_credit_ledger;
alter table public.published_versions enable trigger immutable_published_versions;
do $$ begin
    if (select count(*) from public.clients) <> 1 or (select count(*) from public.projects) <> 6
       or (select balance from public.credit_accounts where client_id={SABRE_SQL}) < 0
       or (select balance from public.credit_accounts where client_id={SABRE_SQL}) <>
          (select sum(amount) from public.credit_ledger where client_id={SABRE_SQL})
       or exists(select 1 from public.credit_months m where m.client_id={SABRE_SQL}
           and (m.balance < 0 or m.balance <>
               (select coalesce(sum(l.amount),0) from public.credit_ledger l
                where l.client_id=m.client_id and l.month=m.month)))
       or (select activity from public.projects where id='{BACKLOG}'::uuid) <> 'backlog' then
        raise exception 'SABRE pruning postcondition failed';
    end if;
end $$;
commit;
"""


def storage_delete(values, objects):
    for bucket in sorted({item['bucket'] for item in objects}):
        paths = [item['path'] for item in objects if item['bucket'] == bucket]
        for index in range(0, len(paths), 100):
            body = json.dumps({'prefixes': paths[index:index + 100]}).encode()
            request = urllib.request.Request(values['SUPABASE_URL'] + '/storage/v1/object/' + bucket,
                data=body, method='DELETE', headers={
                    'apikey': values['SUPABASE_ANON_KEY'],
                    'Authorization': 'Bearer ' + values['SUPABASE_SERVICE_ROLE_KEY'],
                    'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=60) as response:
                response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply the guarded local-only pruning.')
    args = parser.parse_args()
    values = environment()
    if STATE.exists():
        saved = json.loads(STATE.read_text())
        if not args.apply:
            print(json.dumps({'state': saved['state'],
                              'scope': {k: v for k, v in saved['scope'].items()
                                        if k != 'removed_storage'},
                              'storage_objects': len(saved['scope']['removed_storage'])}, indent=2))
            return
        if saved['state'] not in ('planned', 'database_done'):
            raise RuntimeError('The pruning plan is already complete; inspect the local state file.')
        planned = saved
    else:
        planned = plan()
        print(json.dumps({'selected': planned['before']['selected'],
                          'scope': {k: v for k, v in planned['scope'].items()
                                    if k != 'removed_storage'},
                          'storage_by_bucket': {bucket: sum(o['bucket'] == bucket for o in planned['scope']['removed_storage'])
                                                for bucket in sorted({o['bucket'] for o in planned['scope']['removed_storage']})},
                          }, indent=2))
        if not args.apply:
            return
        verify_backup()
        audit_foreign_keys(lambda statement: query(statement))
        STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        planned['state'] = 'planned'
        STATE.write_text(json.dumps(planned, indent=2) + '\n')
        os.chmod(STATE, 0o600)
    if planned['state'] == 'planned':
        before = current()
        if hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest() == planned['fingerprint']:
            verify_backup()
            sql(DELETE_SQL)
        elif (before['clients'], before['projects']) != (1, 6):
            raise RuntimeError('The database differs from both the saved source and target; inspect before resuming.')
        planned['state'] = 'database_done'
        STATE.write_text(json.dumps(planned, indent=2) + '\n')
    audit_foreign_keys(lambda statement: query(statement))
    if (current()['clients'], current()['projects']) != (1, 6):
        raise RuntimeError('The expected one-client/six-project database postcondition failed.')
    storage_delete(values, planned['scope']['removed_storage'])
    remaining = query("select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name)),'[]'::jsonb) "
                      "from storage.objects o where (o.bucket_id,o.name) in (" +
                      ','.join("(" + "'" + item['bucket'] + "','" + item['path'].replace("'", "''") + "')"
                               for item in planned['scope']['removed_storage']) + ");") if planned['scope']['removed_storage'] else []
    if remaining:
        raise RuntimeError('Storage still contains scoped objects; rerun --apply to resume removal.')
    planned['state'] = 'complete'
    STATE.write_text(json.dumps(planned, indent=2) + '\n')
    print('Local SABRE development pruning completed; Auth accounts remain unchanged.')


if __name__ == '__main__':
    main()
