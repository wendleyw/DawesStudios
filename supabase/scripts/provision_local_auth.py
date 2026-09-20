"""Provision local fixture passwords and real delivery files without printing secrets."""
from pathlib import Path
import json
import argparse
import hashlib
import os
import secrets
import subprocess
import urllib.error
import urllib.request
import uuid
from fixture_media import png_card, monogram_svg, monogram_png, monogram_pdf, simple_pdf

ROOT = Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--workdir',type=Path,default=ROOT);parser.add_argument('--files-only',action='store_true');arguments=parser.parse_args()
workdir=arguments.workdir.resolve()
if workdir not in (ROOT,ROOT/'supabase/.restore-drill'):raise SystemExit('Only the primary local project or disposable restore drill can be provisioned.')
status = json.loads(subprocess.run(['supabase', 'status', '--workdir',str(workdir),'-o', 'json'], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
expected_url='http://127.0.0.1:55421' if workdir==ROOT else 'http://127.0.0.1:55521'
if status['API_URL'] != expected_url:
    raise SystemExit('Refusing to provision a non-local or unexpected Supabase instance.')
fixtures = json.loads((ROOT/'supabase/fixtures.json').read_text())
env_path = workdir/'supabase/.env.local'
existing = {}
if env_path.exists():
    existing = dict(line.split('=', 1) for line in env_path.read_text().splitlines() if '=' in line and not line.startswith('#'))
password = existing.get('DEMO_PASSWORD') or 'Dawes!'+secrets.token_urlsafe(24)+'9aA'

def request(path, data=None, method='POST', token=None, content_type='application/json'):
    body = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(status['API_URL']+path, data=body, method=method, headers={'apikey':status['ANON_KEY'],'Authorization':'Bearer '+(token or status['SERVICE_ROLE_KEY']),'Content-Type':content_type})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content=response.read()
            return json.loads(content) if content else None
    except urllib.error.HTTPError as exc:
        # Never include the request or headers in a failure message.
        try: reason=json.loads(exc.read()).get('msg') or str(exc.code)
        except Exception: reason=str(exc.code)
        raise RuntimeError(f'Local provisioning request failed ({reason})') from None

if not arguments.files_only:
    for user in fixtures['users']:
        request('/auth/v1/admin/users/'+user['id'], {'password':password,'email_confirm':True}, method='PUT')

agency=next(user for user in fixtures['users'] if user['role']=='agency')
session=request('/auth/v1/token?grant_type=password',{'email':agency['email'],'password':password})
agency_token=session['access_token']
def fixture_object(bucket,path,content,mime):
    req=urllib.request.Request(status['API_URL']+'/storage/v1/object/authenticated/'+bucket+'/'+path,headers={'apikey':status['ANON_KEY'],'Authorization':'Bearer '+status['SERVICE_ROLE_KEY']})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:existing_bytes=response.read()
        if hashlib.sha256(existing_bytes).digest()!=hashlib.sha256(content).digest():raise RuntimeError('Fixture object differs from deterministic bytes; reset the local fixture project.')
        return
    except urllib.error.HTTPError as exc:
        exc.close()
        if exc.code not in (400,404):raise
    request('/storage/v1/object/'+bucket+'/'+path,content,content_type=mime)

brand_count=0
for asset in fixtures.get('brand_assets',[]):
    # A normal start on an older active dataset must not create unregistered new fixture objects.
    if not request('/rest/v1/brand_assets?id=eq.'+asset['id'],method='GET'):continue
    if asset['kind']=='mark':content=monogram_svg(asset['client_name'])
    elif asset['kind']=='mark-png':content=monogram_png(asset['client_name'])
    elif asset['kind']=='mark-pdf':content=monogram_pdf(asset['client_name'])
    elif asset['kind']=='guidelines':content=simple_pdf(asset['client_name']+' / Sample brand guidelines')
    else:content=png_card(asset['index']+int(asset['kind'][-1]))
    fixture_object('brand-assets',asset['storage_path'],content,asset['mime_type']);brand_count+=1
working_count=0
for asset in fixtures.get('working_assets',[]):
    design=request('/rest/v1/designs?id=eq.'+asset['design_id'],method='GET')
    if not design or design[0]['internal_asset_path']!=asset['source_path']:continue
    fixture_object('internal-assets',asset['source_path'],png_card(asset['index'],internal=True),'image/png')
    clean=png_card(asset['index'])
    fixture_object('published-assets',asset['published_path'],clean,'image/png')
    request('/rest/v1/rpc/register_sanitized_asset',{'p_project_id':asset['project_id'],'p_bucket_id':'published-assets','p_storage_path':asset['published_path'],'p_sha256':hashlib.sha256(clean).hexdigest(),'p_mime_type':'image/png','p_file_size':len(clean),'p_prepared_by':agency['id'],'p_source_design_id':asset['design_id'],'p_source_path':asset['source_path']})
    working_count+=1

project=fixtures['delivery_project_id']
current=request('/rest/v1/delivery_files?project_id=eq.'+project, method='GET', token=agency_token)
if not current:
    # A real, minimal PDF that contains only safe fixture copy and no producer identity.
    stream=b'BT /F1 24 Tf 72 720 Td (Creative Canvas - approved delivery) Tj ET'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    pdf=b'%PDF-1.4\n'; offsets=[0]
    for i,obj in enumerate(objects,1): offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    start=len(pdf);pdf+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:])+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'
    path=project+'/'+str(uuid.uuid4())+'.pdf'
    request('/storage/v1/object/delivery-files/'+path,pdf,content_type='application/pdf')
    request('/rest/v1/rpc/register_sanitized_asset',{'p_project_id':project,'p_bucket_id':'delivery-files','p_storage_path':path,'p_sha256':hashlib.sha256(pdf).hexdigest(),'p_mime_type':'application/pdf','p_file_size':len(pdf),'p_prepared_by':agency['id']})
    request('/rest/v1/rpc/add_delivery_file',{'p_project_id':project,'p_name':'Approved creative direction.pdf','p_storage_path':path,'p_mime_type':'application/pdf','p_file_size':len(pdf)},token=agency_token)
state=request('/rest/v1/projects?id=eq.'+project+'&select=status',method='GET',token=agency_token)
if state[0]['status']=='approved': request('/rest/v1/rpc/mark_project_delivered',{'p_project_id':project},token=agency_token)

# Use mode 0600: credentials are local operator data, not fixture source code.
content='\n'.join(['# Local demonstration credentials. Never deploy or commit.','SUPABASE_URL='+status['API_URL'],'SUPABASE_ANON_KEY='+status['ANON_KEY'],'SUPABASE_SERVICE_ROLE_KEY='+status['SERVICE_ROLE_KEY'],'DEMO_PASSWORD='+password,'DEMO_AGENCY_EMAIL='+agency['email'],'DEMO_DESIGNER_EMAIL=designer@dawes.local','DEMO_CLIENT_EMAIL=sabre@client.dawes.local'])+'\n'
fd=os.open(env_path, os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as file:file.write(content)
os.chmod(env_path,0o600)
print(f'Provisioned {0 if arguments.files_only else len(fixtures["users"])} Auth accounts, {brand_count} brand files, {working_count} working/publication pairs and the delivery fixture. Credentials: supabase/.env.local')
