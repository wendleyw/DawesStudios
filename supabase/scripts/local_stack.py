"""Repeatable lifecycle commands restricted to the dawes-studios local Docker project."""
from pathlib import Path
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
STATE=ROOT/'supabase/.local-state'
MEDIA='dawes-media-dev'

def run(args, *, sensitive=True):
    result=subprocess.run(args,cwd=ROOT,capture_output=True,text=True)
    if result.returncode:
        STATE.mkdir(parents=True,exist_ok=True)
        log=STATE/'lifecycle.log';log.write_text(result.stdout+result.stderr);os.chmod(log,0o600)
        raise RuntimeError(f'Local stack command failed. Inspect {log} locally; it may contain credentials.')
    if not sensitive and result.stdout:print(result.stdout.strip())
    return result.stdout

def assert_project():
    import tomllib
    if tomllib.loads((ROOT/'supabase/config.toml').read_text())['project_id']!='dawes-studios':raise RuntimeError('Refusing to operate on a different Supabase project.')

def media_running():
    try:
        with urllib.request.urlopen('http://127.0.0.1:55430/health',timeout=2) as response:return json.load(response).get('service')=='dawes-media'
    except (urllib.error.URLError,TimeoutError):return False

def stop_media():
    result=subprocess.run(['docker','inspect','--format','{{ index .Config.Labels "com.dawes.project" }}',MEDIA],capture_output=True,text=True)
    if result.returncode==0:
        if result.stdout.strip()!='dawes-studios':raise RuntimeError('Media container ownership does not match.')
        run(['docker','rm','-f',MEDIA])

# The loopback origins this machine serves the application from: the container on its documented
# port, and a `next dev` on either of the ports this project uses beside it. The media service
# matches an origin whole, so naming them is what lets a publication be prepared from a development
# server without reflecting whatever origin happens to ask. Override with MEDIA_ALLOWED_ORIGINS.
LOCAL_ORIGINS=','.join(f'http://{host}:{port}' for host in ('localhost','127.0.0.1') for port in (3000,3003,3010))

def start_media():
    if media_running():print('Media service is already healthy on port55430.');return
    status=json.loads(run(['supabase','status','-o','json']))
    path=ROOT/'apps/media/.env.docker.local'
    path.write_text('\n'.join(['SUPABASE_URL=http://host.docker.internal:55421','SUPABASE_ANON_KEY='+status['ANON_KEY'],'SUPABASE_SERVICE_ROLE_KEY='+status['SERVICE_ROLE_KEY'],'APP_ORIGIN=http://localhost:3003','MEDIA_ALLOWED_ORIGINS='+os.environ.get('MEDIA_ALLOWED_ORIGINS',LOCAL_ORIGINS),'MEDIA_PORT=55430','MEDIA_HOST=0.0.0.0'])+'\n');os.chmod(path,0o600)
    run(['docker','build','-t','dawes-media:local','apps/media'])
    stop_media()
    run(['docker','run','-d','--name',MEDIA,'--label','com.dawes.project=dawes-studios','--restart','unless-stopped','--memory','1g','--cpus','2','--pids-limit','128','--security-opt','no-new-privileges','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=536870912','-p','127.0.0.1:55430:55430','--env-file',str(path),'dawes-media:local'])
    for attempt in range(30):
        if media_running():print('Docker media service is healthy on port55430.');return
        time.sleep(1)
    raise RuntimeError('Media service did not become healthy.')

def start(provision=True):
    run(['supabase','start'])
    run(['supabase','migration','up','--local'])
    if provision:run([sys.executable,'supabase/scripts/provision_local_auth.py'],sensitive=False)
    start_media()
    print('Local backend ready: API55421, Studio55423, email55424, media55430.')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','stop','status','reset','media-start','media-stop']);parser.add_argument('--confirm-local-data-loss',action='store_true');args=parser.parse_args();assert_project()
    if args.action=='start':start()
    elif args.action=='stop':stop_media();run(['supabase','stop']);print('Only the dawes-studios stack was stopped; Docker volumes were retained.')
    elif args.action=='status':
        status=json.loads(run(['supabase','status','-o','json']));print(json.dumps({'project':'dawes-studios','api':status['API_URL'],'studio':status['STUDIO_URL'],'media_healthy':media_running()},indent=2))
    elif args.action=='reset':
        if not args.confirm_local_data_loss:parser.error('Reset requires --confirm-local-data-loss and removes only this local project\'s database/storage volumes.')
        stop_media();run(['supabase','stop','--no-backup']);start()
        print('Deterministic fixture reset completed. Re-run the acceptance verifier.')
    elif args.action=='media-start':start_media()
    else:stop_media();print('Managed Docker media service stopped. Native foreground processes remain under their original terminal.')

if __name__=='__main__':main()
