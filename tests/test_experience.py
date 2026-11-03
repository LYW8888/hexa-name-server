import json
import os
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from cryptography.fernet import Fernet
import report_client
import report_service
import server

BASE={'algorithm':'literary_v3','surname':'林','mode':'born','birthDate':'2024-04-10','birthTime':'12:00','place':'杭州','candidateCount':3}


class ExperienceStoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.full=server.analyze(BASE)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.key=Fernet.generate_key()
        self.store=report_service.Store(self.temp.name,self.key)
        self.names=[x['name'] for x in self.full['candidates']]
        self.metrics={'purpose':'newborn','mode':'born','algorithm':'literary_v3','count':3,'requested_count':3,'length':2,'variant':0,'duration_ms':120}
        self.identity=self.record()

    def tearDown(self):
        self.temp.cleanup()

    def call(self,action,args=None,admin=False):
        return self.store.dispatch(action,args or {},'staff:1' if admin else 'public',admin)

    def record(self):
        result=self.call('generation.record',{'metrics':self.metrics,'fingerprint':report_client.proposal_fingerprint(BASE,self.names),'client':'198.51.100.4'})
        return {key:result[key] for key in ('generation_id','generation_token')}

    def quota(self):
        return self.call('quota.read')

    def configure(self,total,enabled=True,**extra):
        current=self.call('experience.list',admin=True)['quota']
        return self.call('quota.update',{'total':total,'enabled':enabled,'expected_config_version':current['config_version'],**extra},True)

    def beta(self,identity=None,**changes):
        return self.call('beta.redeem',{**(identity or self.identity),'input':BASE,'expected_names':self.names,'consent':True,**changes})

    def feedback(self,**changes):
        return {**self.identity,'request_key':str(uuid.uuid4()),'stage':'proposal','rating':1,'issues':['names','form'],
                'comment':'操作很别扭，希望减少重复填写。<script>alert(1)</script>','consent':True,**changes}

    def test_default_quota_is_real_public_and_reads_never_consume(self):
        value=self.quota()
        self.assertEqual((value['total'],value['used'],value['remaining']),(100,0,100))
        for _ in range(4):self.assertEqual(self.quota(),value)
        self.assertNotIn('config_version',value)
        self.assertNotIn('client_hash',json.dumps(value))
        self.assertNotIn(self.identity['generation_token'],json.dumps(value))

    def test_generation_and_feedback_are_private_and_no_sensitive_fields_in_counter(self):
        raw=Path(self.store.path).read_bytes()
        for secret in ('2024-04-10','birthDate','杭州','198.51.100.4',self.identity['generation_token'],*self.names):
            self.assertNotIn(secret.encode(),raw)
        args=self.feedback();first=self.call('feedback.submit',args);again=self.call('feedback.submit',args)
        self.assertEqual(first['id'],again['id']);self.assertTrue(again['reused'])
        self.assertNotIn(args['comment'].encode(),Path(self.store.path).read_bytes())
        value=self.call('experience.list',admin=True)
        self.assertEqual(value['summary']['generations'],1)
        self.assertEqual(value['summary']['average_rating'],1)
        self.assertEqual(value['feedback'][0]['comment'],args['comment'])
        self.assertNotIn('token_hash',value['generations'][0])
        self.assertEqual(os.stat(self.store.path).st_mode&0o777,0o600)

    def test_feedback_validates_consent_scope_rating_and_capability(self):
        for extra in ({'consent':False},{'rating':True},{'rating':0},{'rating':6},{'generation_token':'forged'},
                      {'stage':'report'},{'issues':['unknown']},{'comment':'字'*1501},{'role':'owner'}):
            with self.subTest(extra=extra),self.assertRaises(report_service.Rejected):
                self.call('feedback.submit',self.feedback(**extra))
        self.assertEqual(self.quota()['used'],0)

    def test_admin_quota_and_private_records_are_never_available_to_public_actor(self):
        for action,args in (('experience.list',{}),('quota.update',{'total':100000,'enabled':True,'expected_config_version':1}),
                            ('beta.invite',{}),('beta.admin_read',{'id':str(uuid.uuid4())}),('beta.delete',{'id':str(uuid.uuid4())})):
            with self.subTest(action=action),self.assertRaises(report_service.Rejected) as caught:self.call(action,args)
            self.assertEqual(caught.exception.status,403)

    def test_quota_setting_preserves_used_count_and_rejects_stale_admin_edits(self):
        initial=self.call('experience.list',admin=True)['quota']
        self.configure(3);self.beta()
        self.assertEqual(self.quota()['used'],1)
        with self.assertRaises(report_service.Rejected) as caught:
            self.call('quota.update',{'total':9,'enabled':True,'expected_config_version':initial['config_version']},True)
        self.assertEqual(caught.exception.status,409)
        with self.assertRaises(report_service.Rejected):self.configure(0)
        with self.assertRaises(report_service.Rejected):self.configure(4,used=0)
        for value in (True,-1,1.2,1000001):
            with self.subTest(value=value),self.assertRaises(report_service.Rejected):self.configure(value)
        raised=self.configure(6)
        self.assertEqual((raised['total'],raised['used'],raised['remaining']),(6,1,5))

    def test_success_uses_one_slot_and_retries_and_reads_never_use_another(self):
        self.configure(1)
        beta=self.beta()
        self.assertFalse(beta['reused']);self.assertEqual(beta['quota']['remaining'],0)
        self.assertEqual(beta['report']['analysis'],self.full['analysis'])
        self.assertEqual(self.beta()['id'],beta['id'])
        self.assertTrue(self.beta()['reused'])
        self.assertEqual(self.call('beta.read',self.identity)['id'],beta['id'])
        self.assertEqual(self.quota()['used'],1)
        other=self.record()
        with self.assertRaises(report_service.Rejected):self.beta(other)
        self.assertEqual(self.quota()['used'],1)
        self.assertEqual(len(server.analyze(BASE)['candidates']),3)

    def test_pausing_new_claims_keeps_existing_reports_accessible(self):
        beta=self.beta();self.configure(1,False)
        self.assertEqual(self.beta()['id'],beta['id'])
        self.assertEqual(self.call('beta.read',self.identity)['id'],beta['id'])
        with self.assertRaises(report_service.Rejected):self.beta(self.record())
        self.assertFalse(self.quota()['enabled'])

    def test_zero_quota_is_honest_and_cannot_be_bypassed_with_code_or_role_flags(self):
        self.configure(0)
        for extra in ({},{'code':'any-old-code'},{'paid':True},{'role':'owner'}):
            with self.subTest(extra=extra),self.assertRaises(report_service.Rejected):self.beta(**extra)
        self.assertEqual(self.quota()['used'],0)

    def test_declined_consent_or_changed_inputs_never_use_a_slot(self):
        for extra in ({'consent':False},{'input':{**BASE,'surname':'张'}},{'expected_names':['林伪造']},{'generation_token':'forged'}):
            with self.subTest(extra=extra),self.assertRaises(report_service.Rejected):self.beta(**extra)
        self.assertEqual(self.quota()['used'],0)

    def test_algorithm_or_storage_failures_leave_quota_untouched(self):
        with patch('server.analyze',return_value={**self.full,'candidates':[]}):
            with self.assertRaises(report_service.Rejected):self.beta()
        self.assertEqual(self.quota()['used'],0)
        with self.store.connect() as db:
            db.executescript("CREATE TRIGGER reject_report BEFORE INSERT ON beta_reports BEGIN SELECT RAISE(ABORT,'simulated write failure'); END;")
        with self.assertRaises(sqlite3.IntegrityError):self.beta()
        self.assertEqual(self.quota()['used'],0)
        with self.store.connect() as db:db.execute('DROP TRIGGER reject_report')
        self.assertEqual(self.beta()['quota']['used'],1)

    def test_twenty_concurrent_claims_compete_for_three_slots_without_overselling(self):
        self.configure(3)
        identities=[self.record() for _ in range(20)]
        def claim(identity):
            try:return self.beta(identity)['id']
            except report_service.Rejected as error:return error.status
        with patch('server.analyze',return_value=self.full),ThreadPoolExecutor(max_workers=8) as pool:
            results=list(pool.map(claim,identities))
        self.assertEqual(sum(isinstance(x,str) for x in results),3)
        self.assertEqual(results.count(409),17)
        self.assertEqual((self.quota()['used'],self.quota()['remaining']),(3,0))

    def test_twenty_duplicate_concurrent_claims_commit_one_report_and_one_slot(self):
        self.configure(1)
        def claim(_):
            other=report_service.Store(self.temp.name,self.key)
            return other.dispatch('beta.redeem',{**self.identity,'input':BASE,'expected_names':self.names,'consent':True},'public',False)['id']
        with patch('server.analyze',return_value=self.full),ThreadPoolExecutor(max_workers=8) as pool:
            results=list(pool.map(claim,range(20)))
        self.assertEqual(len(set(results)),1)
        self.assertEqual(self.quota()['used'],1)

    def test_response_loss_restart_and_last_slot_retry_are_idempotent(self):
        self.configure(1);first=self.beta()
        self.store=report_service.Store(self.temp.name,self.key)
        self.assertEqual(self.quota()['used'],1)
        self.assertEqual(self.beta()['id'],first['id'])
        self.assertEqual(self.call('beta.read',self.identity)['id'],first['id'])

    def test_deletion_and_expiry_never_refund_already_provided_reports(self):
        self.configure(1);beta=self.beta()
        self.call('beta.delete',{'id':beta['id']},True)
        self.assertEqual(self.quota()['used'],1)
        with self.assertRaises(report_service.Rejected):self.beta()
        with self.assertRaises(report_service.Rejected):self.beta(self.record())
        self.store=report_service.Store(self.temp.name,self.key)
        self.assertEqual(self.quota()['remaining'],0)

    def test_old_database_upgrade_counts_historic_reports_only_once(self):
        beta=self.beta()
        with self.store.connect() as db:
            db.execute('UPDATE beta_reports SET ciphertext=NULL WHERE id=?',(beta['id'],))
            db.execute('DROP TABLE beta_quota')
        self.store=report_service.Store(self.temp.name,self.key)
        self.assertEqual(self.quota()['used'],1)
        self.configure(2);self.beta(self.record())
        self.store=report_service.Store(self.temp.name,self.key)
        self.assertEqual((self.quota()['total'],self.quota()['used']),(2,2))

    def test_old_invite_creation_is_retired(self):
        with self.assertRaises(report_service.Rejected) as caught:self.call('beta.invite',admin=True)
        self.assertEqual(caught.exception.status,410)

    def test_report_and_proposal_feedback_keep_independent_scores_and_processing(self):
        proposal=self.feedback();self.call('feedback.submit',proposal)
        beta=self.beta();receipt=self.call('feedback.submit',self.feedback(stage='report',rating=2,comment='报告太长，希望增加摘要。'))
        value=self.call('experience.list',{'stage':'report'},True)
        self.assertEqual(value['summary']['by_stage']['proposal'],{'count':1,'average_rating':1.0})
        self.assertEqual(value['summary']['by_stage']['report'],{'count':1,'average_rating':2.0})
        self.assertEqual(value['feedback'][0]['beta_report_id'],beta['id'])
        self.call('experience.update',{'id':receipt['id'],'state':'planned'},True)
        self.assertEqual(self.call('experience.list',admin=True)['feedback'][0]['state'],'planned')
        self.call('experience.delete',{'id':receipt['id']},True)
        self.assertEqual(self.call('experience.list',admin=True)['summary']['feedback'],1)

    def test_expiry_removes_personal_data_but_not_cumulative_quota_usage(self):
        self.beta();self.call('feedback.submit',self.feedback())
        with self.store.connect() as db:
            db.execute('UPDATE generations SET expires_at=?',(time.time()-1,))
            db.execute('UPDATE beta_reports SET expires_at=?',(time.time()-1,))
            db.execute('UPDATE feedback SET expires_at=?',(time.time()-1,))
            self.store.purge(db)
            self.assertIsNone(db.execute('SELECT ciphertext FROM beta_reports').fetchone()[0])
        self.assertEqual(self.quota()['used'],1)
        self.assertEqual(self.call('experience.list',admin=True)['feedback'],[])
        with self.assertRaises(report_service.Rejected):self.call('feedback.submit',self.feedback())
