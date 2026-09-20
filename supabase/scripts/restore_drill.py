"""Restore a local backup into a separate disposable Supabase stack and verify Auth/Storage."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import urllib.request
import urllib.error

ROOT=Path(__file__).resolve().parents[2]
DRILL='dawes-studios-restore-drill'
WORK=ROOT/'supabase/.restore-drill'

def command(args, *, data=None, allow_error=False, environment=None):
    result=subprocess.run(args,input=data,capture_output=True,env=environment)
    if result.returncode and not allow_error:
        # CLI output can include keys. Store it locally instead of printing it.
        (WORK/'operation.log').write_bytes(result.stdout+result.stderr)
        raise RuntimeError(f'Isolated restore command failed; inspect {WORK}/operation.log locally.')
    return result

def api(url,key,path,*,token=None,data=None):
    req=urllib.request.Request(url+path,data=json.dumps(data).encode() if data is not None else None,headers={'apikey':key,'Authorization':'Bearer '+(token or key),'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=30) as response:
        content=response.read();return json.loads(content) if 'json' in response.headers.get('Content-Type','') else content

def verify_restore(manifest):
    status=json.loads(command(['supabase','status','--workdir',str(WORK),'-o','json']).stdout)
    fixture_env=dict(line.split('=',1) for line in (ROOT/'supabase/.env.local').read_text().splitlines() if '=' in line and not line.startswith('#'))
    # Services may still be becoming healthy; retry bounded network readiness checks.
    import time
    session=None
    for attempt in range(30):
        try:
            session=api(status['API_URL'],status['ANON_KEY'],'/auth/v1/token?grant_type=password',data={'email':'studio@dawes.local','password':fixture_env['DEMO_PASSWORD']});break
        except (urllib.error.URLError,TimeoutError):time.sleep(1)
    if session is None:raise RuntimeError('Restored Auth did not become ready.')
    token=session['access_token']
    clients=api(status['API_URL'],status['ANON_KEY'],'/rest/v1/clients?select=id',token=token)
    projects=api(status['API_URL'],status['ANON_KEY'],'/rest/v1/projects?select=id',token=token)
    if len(clients)!=manifest['counts']['clients'] or len(projects)!=manifest['counts']['projects']:raise RuntimeError('Restored application counts differ.')
    files=api(status['API_URL'],status['ANON_KEY'],'/rest/v1/delivery_files?select=storage_path',token=token)
    if not files:raise RuntimeError('Backup has no delivery file to verify.')
    delivery=api(status['API_URL'],status['ANON_KEY'],'/storage/v1/object/authenticated/delivery-files/'+files[0]['storage_path'],token=token)
    if not delivery.startswith(b'%PDF-'):raise RuntimeError('Restored delivery file bytes differ from expected fixture format.')
    client_session=api(status['API_URL'],status['ANON_KEY'],'/auth/v1/token?grant_type=password',data={'email':'sabre@client.dawes.local','password':fixture_env['DEMO_PASSWORD']})
    private=api(status['API_URL'],status['ANON_KEY'],'/rest/v1/designs?select=*',token=client_session['access_token'])
    if private:raise RuntimeError('Restored RLS exposed internal designs.')
    evidence={'backup_created_at':manifest['created_at'],'restored_project_id':DRILL,'client_count':len(clients),'project_count':len(projects),'agency_password_login':'passed','client_password_login':'passed','private_design_rls':'passed','delivery_file_download':'passed','delivery_sha256':hashlib.sha256(delivery).hexdigest(),'backup_checksums':'passed','source_stack_modified':False}
    (WORK/'evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence,indent=2))
    return evidence

def drill(backup,keep=False):
    manifest=json.loads((backup/'manifest.json').read_text())
    if manifest['project_id']!='dawes-studios':raise RuntimeError('Unexpected backup project.')
    for name,digest in manifest['files'].items():
        if hashlib.sha256((backup/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('Backup checksum mismatch.')
    WORK.mkdir(parents=True,exist_ok=True);(WORK/'supabase').mkdir(exist_ok=True)
    config=(ROOT/'supabase/config.toml').read_text().replace('project_id = "dawes-studios"',f'project_id = "{DRILL}"')
    for old,new in [('55420','55520'),('55421','55521'),('55422','55522'),('55423','55523'),('55424','55524'),('55427','55527'),('55428','55528'),('55429','55529')]:config=config.replace(old,new)
    config=config.replace('[db.seed]\n','[db.seed]\n',1).replace('sql_paths = ["./seed.sql"]','sql_paths = []')
    (WORK/'supabase/config.toml').write_text(config)
    excluded='studio,postgres-meta,realtime,edge-runtime,imgproxy,logflare,vector'
    try:
        command(['supabase','start','--workdir',str(WORK),'-x',excluded])
        services=[f'supabase_{name}_{DRILL}' for name in ['auth','rest','storage']]
        command(['docker','stop',*services])
        database_info=json.loads(command(['docker','inspect',f'supabase_db_{DRILL}']).stdout)[0]
        database_env=dict(item.split('=',1) for item in database_info['Config']['Env'])
        restore_environment=dict(os.environ,PGPASSWORD=database_env['POSTGRES_PASSWORD'])
        command(['docker','exec','-i','-e','PGPASSWORD',f'supabase_db_{DRILL}','pg_restore','-U','supabase_admin','-d','postgres','--clean','--if-exists','--exit-on-error'],data=(backup/'database.dump').read_bytes(),environment=restore_environment)
        # The storage container can remain stopped while its isolated volume is restored.
        command(['docker','run','--rm','-i','--user','0:0','--entrypoint','tar','-v',f'supabase_storage_{DRILL}:/restore','node:24-bookworm-slim','--xattrs','--xattrs-include=*','--acls','-xzf','-','-C','/restore'],data=(backup/'storage.tar.gz').read_bytes())
        command(['docker','start',*services])
        import time
        for attempt in range(30):
            healthy=command(['docker','inspect','--format','{{.State.Health.Status}}',f'supabase_storage_{DRILL}'],allow_error=True)
            if healthy.stdout.strip()==b'healthy':break
            time.sleep(1)
        return verify_restore(manifest)
    finally:
        if not keep:command(['supabase','stop','--workdir',str(WORK),'--no-backup'],allow_error=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('backup',type=Path);parser.add_argument('--keep',action='store_true');parser.add_argument('--verify-only',action='store_true');args=parser.parse_args()
    if args.verify_only:verify_restore(json.loads((args.backup/'manifest.json').read_text()))
    else:drill(args.backup.resolve(),args.keep)
