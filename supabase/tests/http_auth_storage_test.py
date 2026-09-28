"""Exercise real local Auth, PostgREST and Storage boundaries using fixture sessions."""
from pathlib import Path
import base64
import json
import secrets
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[2]
ENV=dict(line.split('=',1) for line in (ROOT/'supabase/.env.local').read_text().splitlines() if '=' in line and not line.startswith('#'))
FIXTURES=json.loads((ROOT/'supabase/fixtures.json').read_text())
URL=ENV['SUPABASE_URL']
if URL!='http://127.0.0.1:55421': raise SystemExit('Tests require the isolated local Supabase project.')

def api(path,method='GET',data=None,token=None,mime='application/json'):
    raw=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
    headers={'apikey':ENV['SUPABASE_ANON_KEY'],'Content-Type':mime}
    if token: headers['Authorization']='Bearer '+token
    request=urllib.request.Request(URL+path,data=raw,headers=headers,method=method)
    try:
        with urllib.request.urlopen(request,timeout=20) as response:
            raw=response.read(); ct=response.headers.get('Content-Type','')
            return response.status,json.loads(raw) if raw and 'json' in ct else raw
    except urllib.error.HTTPError as error:
        raw=error.read();error.close()
        try:body=json.loads(raw)
        except Exception:body=raw
        return error.code,body

class AuthorizationIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tokens={}
        for name,email in [('agency','studio@dawes.local'),('client','sabre@client.dawes.local'),('designer','designer@dawes.local'),('delivery_client','northfield-bank@client.dawes.local')]:
            code,result=api('/auth/v1/token?grant_type=password','POST',{'email':email,'password':ENV['DEMO_PASSWORD']})
            if code!=200: raise RuntimeError(f'Fixture sign-in failed for {name}: HTTP {code}')
            cls.tokens[name]=result['access_token']

    def test_real_password_authentication_resolves_protected_roles(self):
        for name,role in [('agency','agency'),('client','client'),('designer','designer')]:
            code,user=api('/auth/v1/user',token=self.tokens[name]);self.assertEqual(code,200)
            code,profile=api('/rest/v1/profiles?id=eq.'+user['id'],token=self.tokens[name]);self.assertEqual(code,200)
            self.assertEqual(profile[0]['role'],role)

    def test_anonymous_rest_and_rpc_are_rejected(self):
        self.assertEqual(api('/rest/v1/clients')[0],401)
        self.assertEqual(api('/rest/v1/rpc/accept_briefing','POST',{'p_briefing_id':FIXTURES['projects'][0]['briefing_id']})[0],401)

    def test_client_wildcard_queries_cannot_reveal_internal_metadata(self):
        # The Miro model's internal side: boards, rounds and their frames, assignments, the studio channel.
        for table in ['project_assignments','design_boards','internal_comments']:
            code,result=api('/rest/v1/'+table+'?select=*',token=self.tokens['client'])
            self.assertEqual(code,200);self.assertEqual(result,[],table)
        # A whole-row read of rounds and their frames is refused outright rather than exposing an
        # author column; a narrow read returns nothing.
        for table,column in [('design_versions','id'),('design_version_miro_links','version_id')]:
            self.assertEqual(api('/rest/v1/'+table+'?select=*',token=self.tokens['client'])[0],403,table)
            code,result=api('/rest/v1/'+table+'?select='+column,token=self.tokens['client']);self.assertEqual((code,result),(200,[]),table)
        code,result=api('/rest/v1/profiles?select=*',token=self.tokens['client']);self.assertEqual(len(result),1)
        # The client's side is the immutable client version, its Miro link and its review.
        shared=[]
        for table in ['published_versions','publication_miro_links','publication_reviews']:
            code,result=api('/rest/v1/'+table+'?select=*',token=self.tokens['client'])
            self.assertEqual(code,200);self.assertGreater(len(result),0,table);shared.append(result)
        serialized=json.dumps(shared)
        self.assertNotIn('created_by',serialized);self.assertNotIn('internal_',serialized)
        for user in FIXTURES['users']:
            if user['role']=='designer':self.assertNotIn(user['id'],serialized);self.assertNotIn(user['name'],serialized)

    def test_cross_tenant_read_and_credit_mutation_are_rejected(self):
        foreign_project=FIXTURES['projects'][0]['id']
        self.assertEqual(api('/rest/v1/projects?select=id&id=eq.'+foreign_project,token=self.tokens['client'])[1],[])
        code,_=api('/rest/v1/rpc/adjust_credits','POST',{'p_client_id':FIXTURES['clients'][7]['id'],'p_amount':100,'p_description':'Unauthorized','p_idempotency_key':str(uuid.uuid4())},self.tokens['client'])
        self.assertEqual(code,403)

    def test_designer_cannot_read_credits_or_client_channel(self):
        for table in ['credit_accounts','credit_ledger','client_comments','publication_reviews']:
            code,result=api('/rest/v1/'+table,token=self.tokens['designer'])
            self.assertEqual(code,200);self.assertEqual(result,[],table)

    def test_all_resource_families_enforce_cross_client_reads_and_writes(self):
        client=FIXTURES['clients'][7]
        # Include this client's live demo projects while still excluding every foreign workspace.
        code,projects=api('/rest/v1/projects?select=id&client_id=eq.'+client['id'],token=self.tokens['client'])
        self.assertEqual(code,200);self.assertTrue(projects)
        own_projects=[row['id'] for row in projects]
        client_tables=['campaigns','briefings','brand_sections','brand_assets','brand_templates','template_drafts','credit_accounts','credit_ledger','credit_requests']
        project_tables=['deliverables','published_versions','publication_miro_links','publication_reviews','project_covers','client_comments','delivery_files','project_assets']
        for table,query in [(table,'client_id=neq.'+client['id']) for table in client_tables]+[(table,'select=project_id&project_id=not.in.('+','.join(own_projects)+')') for table in project_tables]+[('notifications','user_id=neq.'+client['user_id'])]:
            code,records=api('/rest/v1/'+table+'?'+query,token=self.tokens['client'])
            self.assertEqual(code,200,table);self.assertEqual(records,[],table)
        foreign=FIXTURES['clients'][0];project=FIXTURES['projects'][0]
        cases=[('clients','id=eq.'+foreign['id'],'name','Unauthorized tenant change'),('projects','id=eq.'+project['id'],'title','Unauthorized project change'),('briefings','id=eq.'+project['briefing_id'],'title','Unauthorized brief change'),('brand_sections','client_id=eq.'+foreign['id']+'&section=eq.overview','content',{'name':'Unauthorized'}),('credit_accounts','client_id=eq.'+foreign['id'],'balance',9999)]
        for table,query,field,value in cases:
            path='/rest/v1/'+table+'?'+query
            code,before=api(path,token=ENV['SUPABASE_SERVICE_ROLE_KEY']);self.assertEqual(code,200);self.assertEqual(len(before),1)
            code,_=api(path,'PATCH',{field:value},self.tokens['client']);self.assertIn(code,(200,204,403))
            after=api(path,token=ENV['SUPABASE_SERVICE_ROLE_KEY'])[1]
            self.assertEqual(after,before,'Cross-client mutation changed '+table)
        self.assertEqual(api('/rest/v1/rpc/save_briefing','POST',{'p_client_id':foreign['id'],'p_service_type':'social','p_title':'Forged cross-client brief'},self.tokens['client'])[0],403)

    def test_storage_refuses_client_access_to_a_real_internal_object(self):
        project=FIXTURES['projects'][15]['id'];path=project+'/'+str(uuid.uuid4())+'.png'
        image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=')
        code,_=api('/storage/v1/object/internal-assets/'+path,'POST',image,self.tokens['agency'],'image/png');self.assertEqual(code,200)
        try:
            self.assertEqual(api('/storage/v1/object/authenticated/internal-assets/'+path,token=self.tokens['designer'])[0],200)
            self.assertNotEqual(api('/storage/v1/object/authenticated/internal-assets/'+path,token=self.tokens['client'])[0],200)
            code,_=api('/storage/v1/object/sign/internal-assets/'+path,'POST',{'expiresIn':60},self.tokens['client']);self.assertNotEqual(code,200)
        finally:
            api('/storage/v1/object/internal-assets','DELETE',{'prefixes':[path]},ENV['SUPABASE_SERVICE_ROLE_KEY'])

    def test_delivery_has_real_bytes_and_tenant_isolation(self):
        project=FIXTURES['delivery_project_id'];code,files=api('/rest/v1/delivery_files?project_id=eq.'+project,token=self.tokens['delivery_client'])
        self.assertEqual(code,200);self.assertEqual(len(files),1)
        code,data=api('/storage/v1/object/authenticated/delivery-files/'+files[0]['storage_path'],token=self.tokens['delivery_client'])
        self.assertEqual(code,200);self.assertTrue(data.startswith(b'%PDF-'))
        self.assertNotEqual(api('/storage/v1/object/authenticated/delivery-files/'+files[0]['storage_path'],token=self.tokens['client'])[0],200)

    def test_untrusted_signup_metadata_cannot_assign_agency(self):
        email='auth-boundary-'+uuid.uuid4().hex+'@dawes.local'
        code,result=api('/auth/v1/signup','POST',{'email':email,'password':'Test!'+secrets.token_urlsafe(20)+'A9','data':{'display_name':'Boundary test','role':'agency'}})
        self.assertEqual(code,200)
        user_id=result['user']['id']
        try:
            token=result['access_token'];code,profiles=api('/rest/v1/profiles?id=eq.'+user_id,token=token)
            self.assertEqual(code,200);self.assertEqual(profiles[0]['role'],'client')
            self.assertEqual(api('/rest/v1/clients',token=token)[1],[])
        finally:
            self.assertEqual(api('/auth/v1/admin/users/'+user_id,'DELETE',token=ENV['SUPABASE_SERVICE_ROLE_KEY'])[0],200)

if __name__=='__main__':unittest.main(verbosity=2)
