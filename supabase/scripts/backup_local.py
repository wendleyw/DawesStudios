"""Back up the isolated local database and Storage bytes without exposing credentials."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import subprocess

ROOT=Path(__file__).resolve().parents[2]
PROJECT='dawes-studios'

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)

def backup(destination):
    destination=destination.resolve();destination.mkdir(parents=True,exist_ok=False);os.chmod(destination,0o700)
    config=(ROOT/'supabase/config.toml').read_text()
    if 'project_id = "dawes-studios"' not in config:raise RuntimeError('Unexpected project configuration.')
    for container in [f'supabase_db_{PROJECT}',f'supabase_storage_{PROJECT}']:
        if run(['docker','inspect','--format','{{.State.Running}}',container],text=True).stdout.strip()!='true':raise RuntimeError('The local stack must be running.')
    with (destination/'database.dump').open('wb') as output:
        subprocess.run(['docker','exec',f'supabase_db_{PROJECT}','pg_dump','-U','postgres','-d','postgres','--format=custom','--no-owner','--schema=public','--schema=private','--schema=auth','--schema=storage','--schema=supabase_migrations'],stdout=output,stderr=subprocess.PIPE,check=True)
    with (destination/'storage.tar.gz').open('wb') as output:
        subprocess.run(['docker','run','--rm','--user','0:0','--entrypoint','tar','-v',f'supabase_storage_{PROJECT}:/backup:ro','node:24-bookworm-slim','--xattrs','--xattrs-include=*','--acls','--numeric-owner','-czf','-','-C','/backup','.'],stdout=output,stderr=subprocess.PIPE,check=True)
    evidence_sql="select jsonb_build_object('clients',(select count(*) from public.clients),'projects',(select count(*) from public.projects),'auth_users',(select count(*) from auth.users),'storage_objects',(select count(*) from storage.objects),'credit_balance',(select sum(balance) from public.credit_accounts),'credit_ledger_entries',(select count(*) from public.credit_ledger));"
    counts=json.loads(run(['docker','exec',f'supabase_db_{PROJECT}','psql','-U','postgres','-d','postgres','-Atc',evidence_sql],text=True).stdout)
    metadata={'project_id':PROJECT,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'database_image':run(['docker','inspect','--format','{{.Config.Image}}',f'supabase_db_{PROJECT}'],text=True).stdout.strip(),'counts':counts,'files':{name:hashlib.sha256((destination/name).read_bytes()).hexdigest() for name in ['database.dump','storage.tar.gz']},'storage_archive_format':'GNU tar with extended attributes and ACLs','database_scope':['public','private','auth','storage','supabase_migrations'],'restore_requirement':'Initialize a fresh Supabase stack with matching CLI/container versions before restoring these application/Auth/Storage schemas. Realtime transient internals are reconstructed by Supabase.','consistency':'Pause writes or use versioned immutable storage for a production backup consistency point. Counts captured after dump are diagnostic.'}
    (destination/'manifest.json').write_text(json.dumps(metadata,indent=2)+'\n')
    for path in destination.iterdir():os.chmod(path,0o600)
    print(f'Local backup saved to {destination}; {counts["clients"]} clients, {counts["projects"]} projects, {counts["storage_objects"]} storage objects.')
    return destination

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'supabase/.backups'/datetime.datetime.now().strftime('%Y%m%dT%H%M%S'));args=parser.parse_args();backup(args.output)
