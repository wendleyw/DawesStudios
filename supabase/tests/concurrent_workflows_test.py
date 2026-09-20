"""Concurrent real HTTP regressions. Writes only to the disposable restore-drill project."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import sys
import unittest
import urllib.error
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'supabase/scripts'))
from fixture_media import simple_pdf
ENV=dict(line.split('=',1) for line in (ROOT/'supabase/.restore-drill/supabase/.env.local').read_text().splitlines() if '=' in line and not line.startswith('#'))
if ENV['SUPABASE_URL']!='http://127.0.0.1:55521':raise SystemExit('Concurrent mutation tests are restricted to the disposable restore-drill backend.')
FIXTURES=json.loads((ROOT/'supabase/fixtures.json').read_text())
CATALOG=json.loads((ROOT/'docs/ref/00-guia/CATALOGO-DE-SERVICOS.json').read_text())

def request(path,method='GET',data=None,token=None,mime='application/json'):
    body=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
    req=urllib.request.Request(ENV['SUPABASE_URL']+path,data=body,method=method,headers={'apikey':ENV['SUPABASE_ANON_KEY'],'Authorization':'Bearer '+(token or ENV['SUPABASE_SERVICE_ROLE_KEY']),'Content-Type':mime})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:
            body=response.read();return response.status,json.loads(body) if body and 'json' in response.headers.get('Content-Type','') else body
    except urllib.error.HTTPError as error:
        body=error.read();error.close()
        return error.code,json.loads(body) if body else None

class ConcurrentWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_id=FIXTURES['clients'][7]['id']
        _,agency=request('/auth/v1/token?grant_type=password','POST',{'email':'studio@dawes.local','password':ENV['DEMO_PASSWORD']})
        _,client=request('/auth/v1/token?grant_type=password','POST',{'email':'sabre@client.dawes.local','password':ENV['DEMO_PASSWORD']})
        cls.agency=agency['access_token'];cls.agency_id=agency['user']['id'];cls.client=client['access_token']
        cls.campaign=request('/rest/v1/campaigns?client_id=eq.'+cls.client_id,token=cls.agency)[1][0]['id']

    def rpc(self,name,data,client=False):return request('/rest/v1/rpc/'+name,'POST',data,self.client if client else self.agency)
    def success(self,name,data,client=False):
        code,result=self.rpc(name,data,client);self.assertIn(code,(200,204),(name,result));return result
    def state(self,project):return request('/rest/v1/projects?id=eq.'+project+'&select=status',token=self.agency)[1][0]['status']
    def pending_project(self,label):
        option=next(s for s in CATALOG['types'] if s['id']=='social')['questions'][0]['options'][0]
        briefing=self.success('save_briefing',{'p_client_id':self.client_id,'p_campaign_id':self.campaign,'p_service_type':'social','p_title':label,'p_overview':'Concurrent HTTP workflow regression.','p_direction':{'questions':{'content':option}},'p_deliverables':[{'name':'Primary','format':'feed','width':1080,'height':1350,'quantity':1,'scope':'original'}],'p_estimated_credits':1})
        self.success('submit_briefing',{'p_briefing_id':briefing});self.success('confirm_briefing_budget',{'p_briefing_id':briefing,'p_credits':1})
        return briefing
    def make_version(self,project):
        deliverable=request('/rest/v1/deliverables?project_id=eq.'+project,token=self.agency)[1][0]['id']
        version=self.success('create_design_version',{'p_deliverable_id':deliverable})
        self.success('add_design',{'p_version_id':version,'p_title':'Direction','p_content':{'headline':'Approved direction','background':'#f3f2ec','foreground':'#232a23'}})
        return version
    def publish(self,version,key=None):return self.success('publish_version',{'p_version_id':version,'p_release_note':'Concurrent regression','p_idempotency_key':key or str(uuid.uuid4())})

    def test_concurrent_acceptance_publication_and_reviews(self):
        briefing=self.pending_project('Concurrent acceptance and review')
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:self.rpc('accept_briefing',{'p_briefing_id':briefing}),range(8)))
        self.assertTrue(all(code==200 for code,_ in results));self.assertEqual(len({value for _,value in results}),1)
        project=results[0][1]
        ledger=request('/rest/v1/credit_ledger?project_id=eq.'+project,token=self.agency)[1]
        self.assertEqual(len(ledger),1);self.assertEqual(ledger[0]['amount'],-1)
        version=self.make_version(project);key=str(uuid.uuid4())
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:self.rpc('publish_version',{'p_version_id':version,'p_release_note':'Concurrent regression','p_idempotency_key':key}),range(8)))
        self.assertTrue(all(code==200 for code,_ in results));self.assertEqual(len({value for _,value in results}),1)
        first=results[0][1]
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:self.rpc('review_publication',{'p_publication_id':first,'p_decision':'approved','p_feedback':'Approved'},True),range(8)))
        self.assertTrue(all(code==204 for code,_ in results));self.assertEqual(self.state(project),'approved')
        notices=request('/rest/v1/notifications?project_id=eq.'+project+'&title=eq.Client%20approved%20a%20design',token=self.agency)[1]
        self.assertEqual(len(notices),1)
        second=self.publish(version)
        decisions=[('approved','Ready'),('changes_requested','Increase spacing')]
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda decision:self.rpc('review_publication',{'p_publication_id':second,'p_decision':decision[0],'p_feedback':decision[1]},True),decisions))
        self.assertEqual(sorted(code for code,_ in results),[204,400]);previous=self.state(project)
        self.assertEqual(self.rpc('review_publication',{'p_publication_id':first,'p_decision':'changes_requested','p_feedback':'Stale reversal'},True)[0],400)
        self.assertEqual(self.state(project),previous)
        third=self.publish(version)
        with ThreadPoolExecutor(max_workers=2) as pool:
            review=pool.submit(self.rpc,'review_publication',{'p_publication_id':third,'p_decision':'approved','p_feedback':'Approved'},True)
            publication=pool.submit(self.rpc,'publish_version',{'p_version_id':version,'p_release_note':'Concurrent regression','p_idempotency_key':str(uuid.uuid4())})
            review_result,publish_result=review.result(),publication.result()
        self.assertIn(review_result[0],(204,400));self.assertEqual(publish_result[0],200)
        self.assertEqual(self.state(project),'client_review')
        latest=request('/rest/v1/publication_reviews?publication_id=eq.'+publish_result[1],token=self.agency)[1][0]
        self.assertEqual(latest['status'],'pending')

    def test_delivery_and_new_publication_cannot_both_win(self):
        project=self.success('accept_briefing',{'p_briefing_id':self.pending_project('Concurrent delivery boundary')})
        version=self.make_version(project);publication=self.publish(version)
        self.success('review_publication',{'p_publication_id':publication,'p_decision':'approved','p_feedback':'Approved'},True)
        data=simple_pdf('Approved concurrency fixture');path=project+'/'+str(uuid.uuid4())+'.pdf'
        self.assertEqual(request('/storage/v1/object/delivery-files/'+path,'POST',data,mime='application/pdf')[0],200)
        code,_=request('/rest/v1/rpc/register_sanitized_asset','POST',{'p_project_id':project,'p_bucket_id':'delivery-files','p_storage_path':path,'p_sha256':hashlib.sha256(data).hexdigest(),'p_mime_type':'application/pdf','p_file_size':len(data),'p_prepared_by':self.agency_id})
        self.assertEqual(code,204)
        self.success('add_delivery_file',{'p_project_id':project,'p_name':'Approved delivery.pdf','p_storage_path':path,'p_mime_type':'application/pdf','p_file_size':len(data)})
        with ThreadPoolExecutor(max_workers=2) as pool:
            delivery=pool.submit(self.rpc,'mark_project_delivered',{'p_project_id':project})
            revision=pool.submit(self.rpc,'publish_version',{'p_version_id':version,'p_release_note':'Concurrent regression','p_idempotency_key':str(uuid.uuid4())})
            results=[delivery.result(),revision.result()]
        self.assertEqual(sum(code in (200,204) for code,_ in results),1);self.assertEqual(sum(code==400 for code,_ in results),1)
        self.assertEqual(self.state(project),'delivered' if results[0][0]==204 else 'client_review')
        if results[0][0]==204:
            self.success('mark_project_delivered',{'p_project_id':project})
            notices=request('/rest/v1/notifications?project_id=eq.'+project+'&title=eq.Your%20project%20has%20been%20delivered',token=self.client)[1]
            self.assertEqual(len(notices),1)

    def test_ledger_races_preserve_balance_and_history(self):
        def balance():return request('/rest/v1/credit_accounts?client_id=eq.'+self.client_id,token=self.agency)[1][0]['balance']
        start=balance()
        briefings=[self.pending_project('Overdraft race '+str(index)) for index in range(2)]
        for briefing in briefings:self.success('confirm_briefing_budget',{'p_briefing_id':briefing,'p_credits':start,'p_note':'Exercise the full remaining balance.'})
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda briefing:self.rpc('accept_briefing',{'p_briefing_id':briefing}),briefings))
        self.assertEqual(sorted(code for code,_ in results),[200,400]);self.assertEqual(balance(),0)
        rejected=briefings[next(index for index,(code,_) in enumerate(results) if code==400)]
        self.assertEqual(request('/rest/v1/projects?briefing_id=eq.'+rejected,token=self.agency)[1],[])
        request_id=self.success('request_credits',{'p_client_id':self.client_id,'p_amount':25,'p_note':'Concurrent allocation'},True)
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:self.rpc('fulfill_credit_request',{'p_request_id':request_id}),range(8)))
        self.assertTrue(all(code==200 for code,_ in results));self.assertEqual(len({value for _,value in results}),1);self.assertEqual(balance(),25)
        key='concurrent-adjustment:'+str(uuid.uuid4())
        payload={'p_client_id':self.client_id,'p_amount':10,'p_description':'Concurrent authorized allocation','p_idempotency_key':key}
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:self.rpc('adjust_credits',payload),range(8)))
        self.assertTrue(all(code==200 for code,_ in results));self.assertEqual(len({value for _,value in results}),1);self.assertEqual(balance(),35)
        self.assertEqual(self.rpc('adjust_credits',{**payload,'p_amount':11})[0],400)
        self.success('adjust_credits',{'p_client_id':self.client_id,'p_amount':-10,'p_description':'Compensating correction','p_idempotency_key':key+':correction'})
        self.assertEqual(balance(),25)
        briefing=self.pending_project('Acceptance with simultaneous allocation')
        with ThreadPoolExecutor(max_workers=2) as pool:
            acceptance=pool.submit(self.rpc,'accept_briefing',{'p_briefing_id':briefing})
            allocation=pool.submit(self.rpc,'adjust_credits',{'p_client_id':self.client_id,'p_amount':10,'p_description':'Parallel allocation','p_idempotency_key':key+':parallel'})
            self.assertEqual(acceptance.result()[0],200);self.assertEqual(allocation.result()[0],200)
        self.assertEqual(balance(),34)
        ledger=request('/rest/v1/credit_ledger?client_id=eq.'+self.client_id,token=self.agency)[1]
        self.assertEqual(sum(row['amount'] for row in ledger),balance())

    def test_optimistic_draft_edits_and_submit_retry(self):
        draft=self.success('save_briefing_revision',{'p_client_id':self.client_id,'p_service_type':'social','p_title':'Concurrent draft','p_campaign_id':self.campaign,'p_overview':'Draft concurrency test','p_direction':{'questions':{'content':next(s for s in CATALOG['types'] if s['id']=='social')['questions'][0]['options'][0]}},'p_deliverables':[{'name':'Primary','format':'feed','width':1080,'height':1350,'quantity':1,'scope':'original'}]},True)
        existing=request('/rest/v1/briefings?id=eq.'+draft['id'],token=self.client)[1][0]
        payload={'p_client_id':self.client_id,'p_service_type':'social','p_briefing_id':draft['id'],'p_expected_updated_at':draft['updated_at'],'p_campaign_id':self.campaign,'p_overview':existing['overview'],'p_direction':existing['direction'],'p_deliverables':existing['requested_deliverables']}
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda title:self.rpc('save_briefing_revision',{**payload,'p_title':title},True),['Editor A','Editor B']))
        self.assertEqual(sum(code==200 for code,_ in results),1);self.assertEqual(sum(code==409 for code,_ in results),1)
        current=request('/rest/v1/briefings?id=eq.'+draft['id'],token=self.client)[1][0]
        self.assertEqual(current['updated_at'],next(value for code,value in results if code==200)['updated_at'])
        with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:self.rpc('submit_briefing',{'p_briefing_id':draft['id']},True),range(8)))
        self.assertEqual(sum(code==204 for code,_ in results),1);self.assertEqual(sum(code==400 for code,_ in results),7)
        notices=request('/rest/v1/notifications?title=eq.Briefing%20ready%20for%20review&body=eq.'+current['title'].replace(' ','%20'),token=self.agency)[1]
        self.assertEqual(len(notices),1)
        self.assertEqual(request('/rest/v1/projects?briefing_id=eq.'+draft['id'],token=self.agency)[1],[])

if __name__=='__main__':unittest.main(verbosity=2)
