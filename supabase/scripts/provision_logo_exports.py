"""Add exactly the two new deterministic sample logo export records per canonical client."""
from pathlib import Path
import argparse
import json
import subprocess
import sys
import urllib.request

ROOT=Path(__file__).resolve().parents[2]


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--workdir',type=Path,default=ROOT);args=parser.parse_args()
    workdir=args.workdir.resolve()
    if workdir not in (ROOT,ROOT/'supabase/.restore-drill'):raise SystemExit('Only isolated local fixture stacks can be extended.')
    env=dict(line.split('=',1) for line in (workdir/'supabase/.env.local').read_text().splitlines() if '=' in line and not line.startswith('#'))
    expected='http://127.0.0.1:55421' if workdir==ROOT else 'http://127.0.0.1:55521'
    if env['SUPABASE_URL']!=expected:raise SystemExit('Unexpected local fixture API URL.')
    fixture=json.loads((ROOT/'supabase/fixtures.json').read_text())
    def request(path,data=None):
        req=urllib.request.Request(expected+path,data=json.dumps(data).encode() if data is not None else None,headers={'apikey':env['SUPABASE_ANON_KEY'],'Authorization':'Bearer '+env['SUPABASE_SERVICE_ROLE_KEY'],'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=30) as response:
            body=response.read();return json.loads(body) if body else None
    actual=request('/rest/v1/clients?select=id')
    if {row['id'] for row in actual}!={row['id'] for row in fixture['clients']}:raise SystemExit('Canonical client IDs must match before applying fixture additions.')
    pending=[]
    for asset in [row for row in fixture['brand_assets'] if row['kind'] in ('mark-png','mark-pdf')]:
        existing=request('/rest/v1/brand_assets?id=eq.'+asset['id'])
        if existing:
            if existing[0]['storage_path']!=asset['storage_path']:raise SystemExit('A logo fixture ID is already used for another object.')
            continue
        pending.append({'id':asset['id'],'client_id':asset['client_id'],'name':'Sample compact mark ('+('PNG' if asset['kind']=='mark-png' else 'PDF')+')','category':'Logo','description':'Deterministic demonstration material. Replace with approved brand assets before live client use.','storage_path':asset['storage_path'],'mime_type':asset['mime_type'],'tags':['Sample','Brand mark','Compact']})
    if pending:request('/rest/v1/brand_assets',pending)
    subprocess.run([sys.executable,str(ROOT/'supabase/scripts/provision_local_auth.py'),'--workdir',str(workdir),'--files-only'],check=True)
    print(f'Added {len(pending)} sample logo export records without changing projects or Auth accounts.')


if __name__=='__main__':main()
