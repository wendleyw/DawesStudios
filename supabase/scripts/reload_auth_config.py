"""Recreate only this project's Auth container to apply URL/password settings without data loss."""
from pathlib import Path
import json
import os
import shlex
import subprocess
import time
import tomllib
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
NAME='supabase_auth_dawes-studios'
STATE=ROOT/'supabase/.local-state'

def run(args):return subprocess.run(args,capture_output=True,text=True,check=True)

def reload_auth():
    settings=tomllib.loads((ROOT/'supabase/config.toml').read_text())
    if settings['project_id']!='dawes-studios':raise RuntimeError('Unexpected project identifier.')
    info=json.loads(run(['docker','inspect',NAME]).stdout)[0]
    if info['Mounts']:raise RuntimeError('Unexpected Auth mounts; inspect before recreating.')
    STATE.mkdir(parents=True,exist_ok=True);os.chmod(STATE,0o700)
    environment=dict(value.split('=',1) for value in info['Config']['Env'])
    environment['GOTRUE_SITE_URL']=settings['auth']['site_url']
    environment['GOTRUE_URI_ALLOW_LIST']=','.join(settings['auth']['additional_redirect_urls'])
    environment['GOTRUE_PASSWORD_MIN_LENGTH']=str(settings['auth']['minimum_password_length'])
    path=STATE/'auth.env';path.write_text('\n'.join(f'{key}={value}' for key,value in environment.items())+'\n');os.chmod(path,0o600)
    args=['docker','create','--name',NAME,'--network',info['HostConfig']['NetworkMode'],'--restart','unless-stopped','--env-file',str(path)]
    for network in info['NetworkSettings']['Networks'].values():
        for alias in network.get('Aliases') or []:args+=['--network-alias',alias]
    for key,value in info['Config'].get('Labels',{}).items():args+=['--label',f'{key}={value}']
    health=info['Config']['Healthcheck'];args+=['--health-cmd',shlex.join(health['Test'][1:]),'--health-interval',str(health['Interval'])+'ns','--health-timeout',str(health['Timeout'])+'ns','--health-retries',str(health['Retries'])]
    args+=[info['Config']['Image'],*info['Config']['Cmd']]
    try:
        run(['docker','stop',NAME]);run(['docker','rm',NAME]);run(args);run(['docker','start',NAME])
        for attempt in range(30):
            try:
                with urllib.request.urlopen('http://127.0.0.1:55421/auth/v1/health',timeout=2) as response:
                    if response.status==200:print('Auth configuration reloaded; health passed. Database and signing keys preserved.');return
            except Exception:time.sleep(1)
        raise RuntimeError('Auth did not become healthy within 30 seconds.')
    finally:path.unlink(missing_ok=True)

if __name__=='__main__':reload_auth()
