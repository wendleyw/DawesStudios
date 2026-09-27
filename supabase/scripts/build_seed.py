"""Generate deterministic local-only fixtures from the checked-in service catalog."""
from pathlib import Path
import hashlib
import json
import uuid
from datetime import date, timedelta
from fixture_media import FORMAT_FREE_SIZE, format_pixel_size

ROOT = Path(__file__).resolve().parents[2]
CATALOG = json.loads((ROOT / 'docs/ref/00-guia/CATALOGO-DE-SERVICOS.json').read_text())
CLIENTS = [('Acme','acme','Consumer goods'),('Harbor & Pine','harbor-pine','Hospitality'),('Kestrel Outdoor','kestrel-outdoor','Outdoor'),('Northfield Bank','northfield-bank','Finance'),('Otto & Sons','otto-sons','Retail'),('Pelagic','pelagic','Travel'),('Rune Fitness','rune-fitness','Wellness'),('SABRE','sabre','Personal safety'),('Sablefish Provisions','sablefish-provisions','Food & beverage'),('Vela Skincare','vela-skincare','Beauty')]

ADAPTATION_PROJECTS = (4, 8, 12, 20)
# Projects with two round cycles (see `miro_history`).
SECOND_ROUND_PROJECTS = (3, 4, 6, 12, 13, 14, 20)
# Projects staffed by both designers, one design board each, so designer isolation has real data.
TWO_DESIGNER_PROJECTS = (3, 8, 10)
# Projects that keep a Google Drive backup link (`projects.drive_url`), set by the agency through
# `set_project_drive_link` like the product does; the others show no Drive action. Keys match
# `emit_project`: a number for the uniform pair, `sabre-<key>` for SABRE.
DRIVE_LINK_PROJECTS = (2, 7, 14, 'sabre-email-banner')
SABRE_SLUG = 'sabre'
# SABRE is the workspace the reference package documents end to end — its agency board is the one
# every `#/client/sabre/board` capture in `docs/ref` was taken from — so it is seeded from that
# structure instead of the uniform pattern the other nine clients share: three named campaigns,
# seven projects already in flight, and two briefings that have not become projects yet. Services
# and formats are taken from the real catalog rather than from the two placeholder sizes the
# wireframe reused everywhere, and each campaign window contains the work inside it.
SABRE_CAMPAIGNS = [
    ('summer-safety', 'Summer Safety', 'Seasonal safety push across paid and owned channels.', '2026-09-15', '2026-09-30'),
    ('everyday-confidence', 'Everyday Confidence', 'Product storytelling for the core range.', '2026-09-15', '2026-10-15'),
    ('brand-essentials', 'Brand Essentials', 'Always on: the brand system every campaign is built from.', None, None),
]
# key, title, campaign, service, [(deliverable name, format)], status, start, due, designers, second round
SABRE_PROJECTS = [
    ('instagram-ads', 'Instagram Ads', 'summer-safety', 'static-ad', [('Instagram Feed', 'feed'), ('Instagram Story', 'story')], 'client_review', '2026-09-17', '2026-09-23', 1, False),
    ('campaign-landing-page', 'Campaign Landing Page', 'summer-safety', 'web', [('Desktop Layout', 'desktop')], 'client_review', '2026-09-18', '2026-09-24', 1, True),
    ('email-banner', 'Email Banner', 'summer-safety', 'email-hero', [('Email Hero', 'email-hero')], 'approved', '2026-09-19', '2026-09-25', 1, False),
    ('social-launch', 'Social Launch', 'everyday-confidence', 'social', [('Portrait Feed', 'feed')], 'in_progress', '2026-09-17', '2026-09-23', 1, False),
    ('product-story', 'Product Story', 'everyday-confidence', 'social', [('Instagram Story', 'story')], 'internal_review', '2026-09-18', '2026-09-24', 1, True),
    ('brand-guidelines', 'Brand Guidelines', 'brand-essentials', 'branding', [('Brand Guidelines', 'guidelines')], 'internal_review', '2026-09-17', '2026-09-23', 2, False),
    ('stationery', 'Stationery', 'brand-essentials', 'print', [('A4 Stationery', 'a4')], 'client_review', '2026-09-18', '2026-09-24', 1, True),
]
# Work the client has asked for that the studio has not turned into a project yet: one waiting on the
# studio's budget, one the client is still writing and has not chosen a campaign for.
SABRE_OPEN_BRIEFINGS = [
    ('social-launch-reel', 'Social launch', 'everyday-confidence', 'reel', 'awaiting_review', '2026-10-01',
     [('Launch reel', 'reel', 'original'), ('Story cutdown', 'story', 'adaptation')]),
    ('product-spotlight', 'Product spotlight', None, 'reel', 'draft', None, []),
]

def uid(label):
    return str(uuid.UUID(hashlib.md5(('dawes:'+label).encode()).hexdigest()))

def answers(service):
    return {q['id']:q['options'][0] if q.get('options') else ('12' if q['id']=='pages' else 'Use the supplied campaign direction and approved brand resources.') for q in service.get('questions',[])}

# Every design board, round frame and client version points at a placeholder Miro board. The ids
# are derived from a label, so the file stays byte-identical between builds, and follow Miro's real
# shape: 12 characters, `uXjV` + 7 + `=` (base64 of 8 bytes), as `sabre_demo.py` does. Miro frames its
# own "board not found" page for such an id; a 13-character id is served with
# `X-Frame-Options: SAMEORIGIN`, so the product would frame a URL Miro refuses.
def miro_board(label):
    return 'uXjV'+hashlib.md5(('miro-board:'+label).encode()).hexdigest()[:7]+'='

def miro_widget(label):
    return '345876'+str(int(hashlib.md5(('miro-widget:'+label).encode()).hexdigest()[:12],16))[:12]

def drive_url(key):
    """A placeholder Google Drive folder link, derived from the project key so builds stay identical."""
    return 'https://drive.google.com/drive/folders/1'+hashlib.md5(('drive-folder:'+str(key)).encode()).hexdigest()

def miro_url(board, widget=None):
    return f'https://miro.com/app/board/{board}/'+(f'?moveToWidget={widget}' if widget else '')

def sql(value):
    if value is None: return 'null'
    if isinstance(value, bool): return str(value).lower()
    if isinstance(value, (int,float)): return str(value)
    if isinstance(value, (dict,list)): value=json.dumps(value,separators=(',',':'))
    return "'"+str(value).replace("'","''")+"'"

lines=['-- Deterministic development fixtures. Never apply to a production database.','-- Regenerate with python3 supabase/scripts/build_seed.py.']
def insert(table, **values):
    lines.append(f"insert into {table} ({','.join(values)}) values ({','.join(sql(v) for v in values.values())});")

accounts=[('agency','studio@dawes.local','Dawes Studio','agency'),('designer-1','designer@dawes.local','Alex Morgan','designer'),('designer-2','designer2@dawes.local','Jordan Reed','designer')]
accounts += [(f'client-{i+1}',f'{slug}@client.dawes.local',f'{name} Team','client') for i,(name,slug,_) in enumerate(CLIENTS)]
for key,email,name,role in accounts:
    insert('auth.users',instance_id='00000000-0000-0000-0000-000000000000',id=uid(key),aud='authenticated',role='authenticated',email=email,encrypted_password='',email_confirmed_at='2026-09-01T12:00:00Z',raw_app_meta_data={'provider':'email','providers':['email']},raw_user_meta_data={'display_name':name},created_at='2026-09-01T12:00:00Z',updated_at='2026-09-01T12:00:00Z',confirmation_token='',email_change='',email_change_token_new='',recovery_token='')
    insert('auth.identities',id=uid('identity-'+key),provider_id=uid(key),user_id=uid(key),identity_data={'sub':uid(key),'email':email,'email_verified':True,'phone_verified':False},provider='email',last_sign_in_at='2026-09-01T12:00:00Z',created_at='2026-09-01T12:00:00Z',updated_at='2026-09-01T12:00:00Z')
    lines.append(f"update public.profiles set role={sql(role)} where id={sql(uid(key))};")

states=['planned','in_progress','internal_review','client_review','changes_requested','approved','approved','in_progress','client_review','planned','in_progress','client_review','changes_requested','approved','internal_review','client_review','in_progress','approved','planned','client_review']
# Project schedules keyed by project index, as (start_date, due_date) inclusive windows.
# Every seeded campaign runs 2026-09-01 to 2026-10-31 and the fixture reference day is 2026-09-20, so each
# window is placed against the status above it: delivered and approved work closes before that day,
# in-progress work straddles it, review work lands just after it, and planned work opens later in the
# campaign. The two projects of a campaign overlap so a lane of the planning calendar shows contention,
# durations range from a four-day turnaround to a five-week production, and several windows stay short
# enough to sit whole inside the fortnight the planning calendar opens on.
schedules={
  1:('2026-09-28','2026-10-09'), 2:('2026-09-14','2026-10-02'), 3:('2026-09-07','2026-09-23'), 4:('2026-09-19','2026-09-24'),
  5:('2026-09-09','2026-09-22'), 6:('2026-09-02','2026-09-15'), 7:('2026-09-01','2026-09-11'), 8:('2026-09-10','2026-10-01'),
  9:('2026-09-15','2026-09-26'), 10:('2026-09-24','2026-09-27'), 11:('2026-09-17','2026-09-30'), 12:('2026-09-12','2026-09-24'),
  13:('2026-09-04','2026-09-21'), 14:('2026-09-03','2026-09-17'), 15:('2026-09-18','2026-09-27'), 16:('2026-09-17','2026-09-21'),
  17:('2026-09-08','2026-10-07'), 18:('2026-09-05','2026-09-19'), 19:('2026-10-12','2026-10-30'), 20:('2026-09-13','2026-09-25')}
# The Miro model a project's status implies. Production happens on design boards, one per assigned
# designer; a designer sends a round (a Miro frame) to the studio, and only the agency shares a round
# with the client as an immutable client version, which the client then approves or sends back.
# Each status is reached by replaying that history through the real RPCs, so every round and client
# version sits in a state the product itself produces. Sending any round moves a project to
# internal review, so a project that has not reached it has no round yet. This is the same mapping
# `sabre_demo.py` uses (`miro_history`), so the canonical seed and the demonstration agree:
#   planned, in_progress   boards only, no round and no client version;
#   internal_review        one round per board with the studio (`submitted`), or two;
#   client_review          R1 shared as V1, awaiting the client; or V1 sent back and V2 awaiting;
#   changes_requested      V1 sent back; or V1 and V2 both sent back;
#   approved               V1 approved; or V1 sent back and V2 approved. Delivery (`delivered`) is
#                          added after provisioning attaches the final file.
# A project with two designers stays before client review, so its client versions never have to
# pick one designer's board over the other's.
# Row ids: the RPCs take no id argument and insert with the tables' `gen_random_uuid()` default, so
# boards, rounds, client versions, Miro links, reviews, comments and notifications get new ids on
# every load. Rewriting them afterwards would break the foreign keys the same RPCs create. Each row
# has a stable natural key instead, which is how this file and `verify_seed.py` refer to them: a
# board by (project, name), a round by (board, number) and its `request_key`, a client version by
# (project, number) and its share request key, and a comment by its idempotency key.
TWO_DESIGNER_STATUSES = ('planned','in_progress','internal_review')

def miro_history(status, second_round):
    """One entry per round cycle: None keeps the round inside the studio; a decision shares it."""
    if status in ('planned','in_progress'): return []
    if status=='internal_review': return [None,None] if second_round else [None]
    last={'client_review':'pending','changes_requested':'changes_requested'}.get(status,'approved')
    return (['changes_requested'] if second_round else [])+[last]

def as_user(user):
    """Run the RPC calls that follow as `user`, the way PostgREST presents a signed-in session."""
    lines.append(f"select set_config('request.jwt.claims',{sql(json.dumps({'sub':user,'role':'authenticated'},separators=(',',':')))},false);")

def reset_user():
    lines.append("select set_config('request.jwt.claims','',false);")

def call(function, *arguments):
    lines.append(f"select public.{function}({','.join(arguments)});")

def emit_project(*, key, name, client, customer, campaign, service, specs, title, description,
                 status, start_date, due_date, credits, balance, designers, second_round,
                 debit_at, campaign_label='the fall campaign'):
    project=uid(f'project-{key}'); briefing=uid(f'briefing-{key}'); deliverable=uid(f'deliverable-{key}')
    assert len(designers)==1 or status in TWO_DESIGNER_STATUSES, key
    insert('public.briefings',id=briefing,client_id=client,campaign_id=campaign,title=title,service_type=service['id'],status='accepted',overview=f'Create a focused {service["name"].lower()} for {campaign_label}.',goals='Build awareness and give our audience one clear next step.',direction={'source':'brand_hub','tone':'Clear, confident and human','questions':answers(service)},requested_deliverables=specs,due_date=due_date,estimated_credits=credits,confirmed_credits=credits,budget_note='Scope confirmed.',created_by=customer,requested_by=customer)
    insert('public.projects',id=project,client_id=client,campaign_id=campaign,briefing_id=briefing,title=title,description=description,service_type=service['id'],status=status if status=='in_progress' else 'planned',due_date=due_date,start_date=start_date,board_position={'x':0,'y':0})
    for designer in designers: insert('public.project_assignments',project_id=project,designer_id=designer)
    insert('public.deliverables',id=deliverable,project_id=project,**specs[0])
    for si,spec in enumerate(specs[1:],start=1):
        insert('public.deliverables',id=uid(f'deliverable-{key}-adaptation'),project_id=project,sort_order=si,**spec)
    insert('public.credit_ledger',id=uid(f'debit-{key}'),client_id=client,project_id=project,amount=-credits,balance_after=balance,kind='project_debit',description=title,idempotency_key=f'briefing:{briefing}',created_at=debit_at)
    # Later statuses are not written here: the round, share and review RPCs below move the project
    # there, exactly as the product does.
    project_sql=sql(project)
    # A board is due a day before its project where the window allows it, never after it.
    board_due=due_date if due_date<=start_date else (date.fromisoformat(due_date)-timedelta(days=1)).isoformat()
    boards=[]
    for bi,designer in enumerate(designers):
        board_name=specs[0]['name'] if bi==0 else 'Alternative direction'
        board=miro_board(f'{key}-{bi}')
        boards.append((bi,designer,board_name,board))
    as_user(uid('agency'))
    for bi,designer,board_name,board in boards:
        call('create_design_board',project_sql,sql(board_name),sql(miro_url(board)),sql(designer),sql(board_due))
    drive=drive_url(key) if key in DRIVE_LINK_PROJECTS else None
    if drive: call('set_project_drive_link',project_sql,sql(drive))
    as_user(customer)
    call('post_comment',project_sql,sql('client'),sql('The campaign scope is confirmed. Please keep the direction clear and aligned with our brand.'),'null',sql(f'seed:{key}:context'))
    def board_ref(board_name):
        return f"(select id from public.design_boards where project_id={project_sql} and name={sql(board_name)})"
    def round_key(bi,number):
        return uid(f'round-{key}-{bi}-{number}')
    def round_ref(bi,number):
        return f"(select id from public.design_versions where board_id={board_ref(boards[bi][2])} and version_number={number})"
    def version_ref(number):
        return f"(select id from public.published_versions where project_id={project_sql} and version_number={number})"
    def send_round(bi,designer,board_name,board,number):
        as_user(designer)
        note='First direction on the board, ready for studio review.' if number==1 else 'Refined round with tighter spacing, ready for studio review.'
        call('send_board_round',board_ref(board_name),sql(note),sql(miro_url(board,miro_widget(f'{key}-{bi}-{number}'))),sql(round_key(bi,number)))
    def share(number):
        # The client version shows the lead board's frame for that round; only the agency shares.
        _,_,_,board=boards[0]
        as_user(uid('agency'))
        note=f'A considered direction for {campaign_label}.' if number==1 else 'The refined direction, with your feedback applied.'
        call('share_miro_version',project_sql,sql(miro_url(board,miro_widget(f'{key}-0-{number}'))),sql(note),round_ref(0,number),sql(uid(f'share-{key}-{number}')))
    def review(number,decision):
        as_user(customer)
        feedback='This feels right. Approved.' if decision=='approved' else 'Please give the headline a little more space.'
        call('review_publication',version_ref(number),sql(decision),sql(feedback))
    history=miro_history(status,second_round)
    versions=0
    for cycle,decision in enumerate(history,start=1):
        for bi,designer,board_name,board in boards: send_round(bi,designer,board_name,board,cycle)
        if decision is None: continue
        share(cycle); versions=cycle
        if decision!='pending': review(cycle,decision)
    if history:
        # Internal conversation on the lead board's first round: the designer asks, the studio
        # answers. Neither message leaves the internal channel.
        as_user(designers[0])
        call('post_comment',project_sql,sql('internal'),sql('The first direction is on the board and ready for studio feedback.'),round_ref(0,1),sql(f'seed:{key}:internal-designer'))
        as_user(uid('agency'))
        call('post_comment',project_sql,sql('internal'),sql('Thanks. Tighten the type hierarchy before we share it.'),round_ref(0,1),sql(f'seed:{key}:internal-studio'))
    if versions:
        as_user(uid('agency'))
        call('post_comment',project_sql,sql('client'),sql('Your first direction is ready. We would love your feedback.'),version_ref(1),sql(f'seed:{key}:studio-v1'))
        as_user(customer)
        call('post_comment',project_sql,sql('client'),sql('Please preserve the focal point in the final composition.'),version_ref(1),sql(f'seed:{key}:client-v1'))
    reset_user()
    # A cover for every project, drawn from the synthetic card artwork at the canvas of the leading
    # deliverable's format. Its bytes are uploaded after the seed through the media worker, which
    # sanitizes and attests them; only a project the client already has a version of shows it.
    format_spec=next(f for f in CATALOG['formats'] if f['id']==specs[0]['format'])
    width,height=format_pixel_size(format_spec)
    manifest['covers'].append({'project_id':project,'index':len(manifest['covers'])+1,'width':width,'height':height,'client_visible':versions>0})
    manifest['projects'].append({'id':project,'client_id':client,'briefing_id':briefing,'deliverable_id':deliverable,'service_type':service['id'],'title':title,'status':status,'credits':credits,'designers':designers,'rounds_per_board':len(history),'client_versions':versions,'drive_url':drive})

manifest={'users':[{'id':uid(k),'email':e,'name':n,'role':r} for k,e,n,r in accounts],'clients':[],'projects':[],'delivery_project_id':uid('project-7'),'brand_assets':[],'covers':[]}
for index,(name,slug,industry) in enumerate(CLIENTS):
    ci=index+1; client=uid(f'client-org-{ci}'); campaign=uid(f'campaign-{ci}'); customer=uid(f'client-{ci}'); balance=100
    insert('public.clients',id=client,name=name,slug=slug,industry=industry,initials=''.join(w[0] for w in name.split() if w[0].isalpha())[:2],description=f'{name} brand workspace',website=f'https://{slug}.example')
    insert('public.client_memberships',client_id=client,user_id=customer)
    campaigns={}
    if slug==SABRE_SLUG:
        for ck,ctitle,cdescription,cstart,cend in SABRE_CAMPAIGNS:
            campaigns[ck]=uid(f'campaign-sabre-{ck}')
            insert('public.campaigns',id=campaigns[ck],client_id=client,title=ctitle,description=cdescription,start_date=cstart,end_date=cend)
    else:
        insert('public.campaigns',id=campaign,client_id=client,title='Fall 2026',description='A focused launch campaign for the season.',start_date='2026-09-01',end_date='2026-10-31')
    insert('public.credit_ledger',id=uid(f'allocation-{ci}'),client_id=client,amount=100,balance_after=100,kind='allocation',description='September credit allocation',idempotency_key=f'seed-allocation-{ci}',created_at='2026-09-01T12:00:00Z')
    manifest['clients'].append({'id':client,'name':name,'slug':slug,'user_id':customer})
    sections={
      'overview':{'name':name,'tagline':'Made for what comes next.','description':f'{name} creates considered experiences with a clear point of view.','audience':'Curious people who value purposeful design.','tone':['Clear','Confident','Human'],'rules':['Keep the message direct.','Use generous whitespace.','Build on the core brand palette.']},
      'logos':{'guidance':'Maintain clear space equal to the height of the wordmark.','variants':['Primary wordmark','Compact mark','Reversed wordmark']},
      'colors':{'palette':[{'name':'Ink','hex':'#191919'},{'name':'Paper','hex':'#F7F6F2'},{'name':'Stone','hex':'#C9C5BB'},{'name':'Accent','hex':'#D4DCB4'}]},
      'typography':{'heading':'Inter','body':'Inter','headingSource':'https://rsms.me/inter/','bodySource':'https://rsms.me/inter/','scale':[12,14,16,24,36,56]},
      'visual-style':{'principles':['Natural light','Quiet composition','Honest materials'],'photography':'Focus on authentic moments and simple backgrounds.','use':['Natural light and honest materials.','Keep the hero subject clear.'],'avoid':['Heavy filters and busy backgrounds.','Unsupported product claims.']},
      'products':{'items':[{'name':'Essential collection','description':'Our signature everyday offering.','specs':'Core range. Matte finish. Main label must remain legible.','rules':'Use the primary palette and show the complete product.'},{'name':'Signature collection','description':'A considered expression for the seasonal campaign.','specs':'Premium range. Warm neutral treatment. Front-facing hero view.','rules':'Keep props minimal and avoid unsupported product claims.'},{'name':'Travel collection','description':'A compact offering for moments on the move.','specs':'Compact format. Clear proportions. Include one scale reference.','rules':'Preserve the approved mark and use an uncluttered background.'}]},
      'messaging':{'headline':'Every detail, considered.','description':'A clear expression of what matters.','cta':'Discover the collection','terminology':['Collection','Considered design','Everyday essentials'],'rules':['Use plain, specific language.','Avoid urgency that the offer does not support.']},
      'ai':{'instructions':f'Write in the {name} voice: clear, confident and human. Keep sentences concise. Never invent product claims.','use':['Approved client context and confirmed product facts.','Concise English copy.'],'never':['Invent certifications or performance claims.','Name the internal designer or expose production notes.']}}
    for section,content in sections.items(): insert('public.brand_sections',client_id=client,section=section,content=content)
    for ai,(asset_name,category,kind,extension,mime,tags) in enumerate([
        ('Sample brand mark','Logo','mark','svg','image/svg+xml',['Sample','Brand mark']),
        ('Essential collection reference','Product','product-1','png','image/png',['Sample','Essential collection']),
        ('Signature collection reference','Product','product-2','png','image/png',['Sample','Signature collection']),
        ('Travel collection reference','Product','product-3','png','image/png',['Sample','Travel collection']),
        ('Sample brand guidelines','Document','guidelines','pdf','application/pdf',['Sample','Guidelines']),
        ('Sample compact mark (PNG)','Logo','mark-png','png','image/png',['Sample','Brand mark','Compact']),
        ('Sample compact mark (PDF)','Logo','mark-pdf','pdf','application/pdf',['Sample','Brand mark','Compact'])
    ]):
        aid=uid(f'brand-asset-{ci}-{ai}');path=f'{client}/{aid}.{extension}'
        insert('public.brand_assets',id=aid,client_id=client,name=asset_name,category=category,description='Deterministic demonstration material. Replace with approved brand assets before live client use.',storage_path=path,mime_type=mime,tags='{'+','.join('"'+tag+'"' for tag in tags)+'}')
        entry={'id':aid,'client_id':client,'client_name':name,'kind':kind,'storage_path':path,'mime_type':mime,'index':ci}
        # A brand product reference belongs to no deliverable and therefore to no format, so it is
        # rendered at the documented format-free size rather than at a shape it was never ordered in.
        if kind.startswith('product'): entry['width'],entry['height']=FORMAT_FREE_SIZE
        manifest['brand_assets'].append(entry)
    for ti,(template,category,width,height) in enumerate([('Instagram Post','Social',1080,1080),('Website Hero','Web',1920,1080),('Amazon Gallery','Commerce',2000,2000),('Presentation','Presentation',1920,1080),('Email Header','Email',1200,600),('Print Flyer','Print',1240,1754),('Product Card','Commerce',1200,1500)]):
        tid=uid(f'template-{ci}-{ti}')
        insert('public.brand_templates',id=tid,client_id=client,name=template,category=category,width=width,height=height,content={'headline':'Every detail, considered.','subheading':name,'background':'#F7F6F2','foreground':'#191919','accent':'#D4DCB4','layout':'editorial','body':'A thoughtful expression of the everyday.','cta':'Explore the collection'})
        if ti==0: insert('public.template_drafts',id=uid(f'draft-{ci}'),client_id=client,template_id=tid,owner_id=customer,name=f'{name} social exploration',content={'headline':'Make room for the everyday.','background':'#F7F6F2','foreground':'#191919'})
    for j in range(2):
        pi=index*2+j+1
        if slug==SABRE_SLUG: break
        service=CATALOG['types'][pi-1]; designer=uid(f'designer-{1+pi%2}'); credits=(service.get('min') or 3)+j; balance-=credits
        fmt=service['formats'][0]; format_spec=next(f for f in CATALOG['formats'] if f['id']==fmt)
        spec={'name':service['name'],'format':fmt,'width':format_spec.get('width'),'height':format_spec.get('height'),'quantity':2 if pi%4==0 else 1,'scope':'original'}
        specs=[spec]
        # Four representative projects carry a second deliverable in another format.
        # The fourth used to be project 16, which belonged to SABRE before SABRE took the reference
        # package's own workspace, so it moved to 20 rather than leaving only three behind.
        if pi in ADAPTATION_PROJECTS:
            other_format=next(f for f in CATALOG['formats'] if f['id']==service['formats'][1])
            specs.append({'name':service['name']+' adaptation','format':other_format['id'],'width':other_format.get('width'),'height':other_format.get('height'),'quantity':1,'scope':'adaptation'})
        start_date,due_date=schedules[pi]
        emit_project(key=pi,name=name,client=client,customer=customer,campaign=campaign,service=service,specs=specs,
                     title=f"{name} / {service['name']}",description=f'A fresh perspective on {name}.',
                     status=states[pi-1],start_date=start_date,due_date=due_date,credits=credits,balance=balance,
                     designers=[designer,uid(f'designer-{1+(pi+1)%2}')] if pi in TWO_DESIGNER_PROJECTS else [designer],
                     second_round=pi in SECOND_ROUND_PROJECTS,
                     debit_at=f'2026-09-{2+j:02d}T12:00:00Z')
    if slug==SABRE_SLUG:
        for pi,(key,ptitle,ckey,service_id,deliverables,status,start_date,due_date,designer_count,second_round) in enumerate(SABRE_PROJECTS,start=1):
            service=next(item for item in CATALOG['types'] if item['id']==service_id)
            specs=[]
            for si,(dname,dformat) in enumerate(deliverables):
                definition=next(f for f in CATALOG['formats'] if f['id']==dformat)
                specs.append({'name':dname,'format':dformat,'width':definition.get('width'),'height':definition.get('height'),'quantity':1,'scope':'original' if si==0 else 'adaptation'})
            credits=service.get('min') or 3; balance-=credits
            campaign_title=next(c[1] for c in SABRE_CAMPAIGNS if c[0]==ckey)
            emit_project(key=f'sabre-{key}',name=name,client=client,customer=customer,campaign=campaigns[ckey],service=service,specs=specs,
                         title=ptitle,description=f'{campaign_title} — {service["name"].lower()} for {name}.',
                         status=status,start_date=start_date,due_date=due_date,credits=credits,balance=balance,
                         designers=[uid(f'designer-{1+(pi+n)%2}') for n in range(designer_count)],second_round=second_round,
                         debit_at=f'2026-09-{14+pi:02d}T12:00:00Z',campaign_label=campaign_title)
        for key,btitle,ckey,service_id,status,due_date,deliverables in SABRE_OPEN_BRIEFINGS:
            service=next(item for item in CATALOG['types'] if item['id']==service_id)
            specs=[]
            for dname,dformat,scope in deliverables:
                definition=next(f for f in CATALOG['formats'] if f['id']==dformat)
                specs.append({'name':dname,'format':dformat,'width':definition.get('width'),'height':definition.get('height'),'quantity':1,'scope':scope})
            insert('public.briefings',id=uid(f'briefing-sabre-open-{key}'),client_id=client,campaign_id=campaigns[ckey] if ckey else None,title=btitle,service_type=service['id'],status=status,overview='Introduce the new range with one clear, memorable moment.',goals='Give the audience a reason to look twice and one next step.',direction={'source':'brand_hub','questions':answers(service)},requested_deliverables=specs,due_date=due_date,estimated_credits=service.get('min') or 3,created_by=customer,requested_by=customer)
    if ci in (7,8,9):
        request=uid(f'credit-request-{ci}');request_status={7:'pending',8:'fulfilled',9:'rejected'}[ci];ledger=uid(f'credit-request-ledger-{ci}') if ci==8 else None
        if ci==8:
            balance+=25
            insert('public.credit_ledger',id=ledger,client_id=client,amount=25,balance_after=balance,kind='adjustment',description='Credit request allocation',idempotency_key=f'credit-request:{request}',created_at='2026-09-05T12:00:00Z')
        insert('public.credit_requests',id=request,client_id=client,requested_by=customer,amount={7:100,8:25,9:50}[ci],note='Planning the next campaign.',status=request_status,response_note='Additional allocation approved.' if ci==8 else ('Current allocation covers the approved scope.' if ci==9 else ''),ledger_id=ledger)
    insert('public.credit_accounts',client_id=client,balance=balance)
    if ci<=3:
        draft_state=['draft','awaiting_review','budget_confirmed'][ci-1]
        insert('public.briefings',id=uid(f'pending-{ci}'),client_id=client,campaign_id=campaign,title=['Seasonal social exploration','Product launch campaign','Expanded brand rollout'][ci-1],service_type='social',status=draft_state,overview='Introduce the new collection with a concise visual story.',direction={'source':'brand_hub','questions':answers(next(s for s in CATALOG['types'] if s['id']=='social'))},requested_deliverables=[{'name':'Launch post','format':'feed','width':1080,'height':1350,'quantity':1,'scope':'original'}],estimated_credits=3,confirmed_credits=500 if ci==3 else None,budget_note='Expanded rollout across markets.' if ci==3 else None,created_by=customer,requested_by=customer)

(ROOT/'supabase/seed.sql').write_text('\n'.join(lines)+'\n')
(ROOT/'supabase/fixtures.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Generated {len(CLIENTS)} clients and {len(manifest["projects"])} projects; Auth passwords require local provisioning.')
