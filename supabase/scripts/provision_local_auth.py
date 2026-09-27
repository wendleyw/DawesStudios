"""Provision local fixture passwords, fixture files and project covers without printing secrets.

Covers go through the media worker, which sanitizes and attests them, so it must be running first
(`local_stack.py start` starts it before this script; otherwise run `local_stack.py media-start`)."""
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
from fixture_provisioning import ensure_fixture_object

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
password = existing.get('DEMO_PASSWORD')
agency=next(user for user in fixtures['users'] if user['role']=='agency')

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

if not password:
    # `supabase/.env.local` is gitignored, so a linked worktree starts without one while still
    # pointing at the single stack on 55421 that every worktree shares. Minting a password here would
    # rotate the fixture accounts out from under whichever tree provisioned them, and that tree would
    # only find out when every sign-in started returning `invalid_credentials`. The seed inserts each
    # account with `created_at` equal to `updated_at`, so an account whose timestamps still match has
    # never been given a password and there is nothing to invalidate.
    seeded = request('/auth/v1/admin/users/'+agency['id'], method='GET')
    if seeded['updated_at'] != seeded['created_at']:
        raise SystemExit(
            'This Supabase stack already holds fixture passwords that this working tree cannot read. '
            'Copy supabase/.env.local from the working tree that provisioned the stack, or run '
            'npm run db:reset -- --confirm-local-data-loss to provision it from scratch.'
        )
    password = 'Dawes!'+secrets.token_urlsafe(24)+'9aA'

if not arguments.files_only:
    for user in fixtures['users']:
        request('/auth/v1/admin/users/'+user['id'], {'password':password,'email_confirm':True}, method='PUT')

session=request('/auth/v1/token?grant_type=password',{'email':agency['email'],'password':password})
agency_token=session['access_token']
def fixture_object(bucket,path,content,mime):
    return ensure_fixture_object(status['API_URL'],status['ANON_KEY'],status['SERVICE_ROLE_KEY'],bucket,path,content,mime)

brand_count=0
for asset in fixtures.get('brand_assets',[]):
    # A normal start on an older active dataset must not create unregistered new fixture objects.
    if not request('/rest/v1/brand_assets?id=eq.'+asset['id'],method='GET'):continue
    if asset['kind']=='mark':content=monogram_svg(asset['client_name'])
    elif asset['kind']=='mark-png':content=monogram_png(asset['client_name'])
    elif asset['kind']=='mark-pdf':content=monogram_pdf(asset['client_name'])
    elif asset['kind']=='guidelines':content=simple_pdf(asset['client_name']+' / Sample brand guidelines')
    # The manifest carries the pixel canvas of every rendered fixture image, so provisioning renders
    # each one at the size the generator decided instead of guessing one here.
    else:content=png_card(asset['index']+int(asset['kind'][-1]),asset['width'],asset['height'])
    fixture_object('brand-assets',asset['storage_path'],content,asset['mime_type']);brand_count+=1
# Project covers. A cover must be sanitized and attested by the media worker before
# `set_project_cover` accepts it, so the bytes are posted to `/covers/prepare` under the agency's own
# session rather than written to Storage here. A project that already has a cover keeps it, and a
# project the dataset no longer holds is skipped. The client sees a cover only once it has a client
# version of that project, read from the database rather than assumed from the manifest.
MEDIA_URL=os.environ.get('MEDIA_URL','http://127.0.0.1:55430')
def media_prepare(project_id, content, visible):
    req=urllib.request.Request(f"{MEDIA_URL}/covers/prepare?projectId={project_id}&visible={'true' if visible else 'false'}", data=content, method='POST', headers={'Authorization':'Bearer '+agency_token,'Content-Type':'image/png'})
    try:
        with urllib.request.urlopen(req, timeout=60) as response: return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try: reason=json.loads(exc.read()).get('error') or str(exc.code)
        except Exception: reason=str(exc.code)
        raise RuntimeError(f'Cover preparation failed ({reason})') from None
    except urllib.error.URLError:
        raise SystemExit(f'The media worker is not reachable at {MEDIA_URL}. Run python3 supabase/scripts/local_stack.py media-start, then provision again.') from None
cover_count=0
preserved_cover_count=0
# The restore drill has no media worker of its own, so it keeps the covers its backup restored.
for cover in fixtures.get('covers',[]) if workdir==ROOT else []:
    if not request('/rest/v1/projects?select=id&id=eq.'+cover['project_id'],method='GET'):continue
    if request('/rest/v1/project_covers?select=project_id&project_id=eq.'+cover['project_id'],method='GET'):
        preserved_cover_count+=1;continue
    visible=bool(request('/rest/v1/published_versions?select=id&project_id=eq.'+cover['project_id'],method='GET'))
    media_prepare(cover['project_id'],png_card(cover['index'],cover['width'],cover['height']),visible)
    cover_count+=1

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
print(f'Provisioned {0 if arguments.files_only else len(fixtures["users"])} Auth accounts, {brand_count} brand files, {cover_count} new project covers ({preserved_cover_count} existing covers kept) and the delivery fixture. Credentials: supabase/.env.local')
