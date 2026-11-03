import json
import os
from pathlib import Path
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
        self.store=report_service.Store(self.temp.name,Fernet.generate_key())
        self.names=[x['name'] for x in self.full['candidates']]
        self.metrics={'purpose':'newborn','mode':'born','algorithm':'literary_v3','count':3,'requested_count':3,'length':2,'variant':0,'duration_ms':120}
        self.generation=self.record()
        self.identity={k:self.generation[k] for k in ('generation_id','generation_token')}

    def tearDown(self):
        self.temp.cleanup()

    def call(self,action,args=None,admin=False):
        return self.store.dispatch(action,args or {},'staff:1' if admin else 'public',admin)

    def record(self):
        return self.call('generation.record',{'metrics':self.metrics,'fingerprint':report_client.proposal_fingerprint(BASE,self.names),'client':'198.51.100.4'})

    def feedback(self,**changes):
        return {**self.identity,'request_key':str(uuid.uuid4()),'stage':'proposal','rating':1,'issues':['names','form'],'comment':'操作很别扭，希望减少重复填写。<script>alert(1)</script>','consent':True,**changes}

    def beta(self,invite=None,identity=None,**changes):
        invite=invite or self.call('beta.invite',admin=True)
        return self.call('beta.redeem',{**(identity or self.identity),'code':invite['code'],'input':BASE,'expected_names':self.names,'consent':True,'client':'198.51.100.4',**changes})

    def test_generation_is_anonymous_and_never_stores_birth_names_ip_or_bearer(self):
        raw=Path(self.store.path).read_bytes()
        for secret in ('2024-04-10','birthDate','杭州','198.51.100.4',self.generation['generation_token'],*self.names):
            self.assertNotIn(secret.encode(),raw)
        listed=self.call('experience.list',admin=True)
        self.assertEqual(listed['summary']['generations'],1)
        self.assertIsNone(listed['summary']['average_rating'])
        self.assertNotIn('client_hash',listed['generations'][0])
        self.assertNotIn('token_hash',listed['generations'][0])
        self.assertEqual(os.stat(self.store.path).st_mode&0o777,0o600)

    def test_low_rating_and_criticism_saved_encrypted_and_retry_is_idempotent(self):
        args=self.feedback()
        first=self.call('feedback.submit',args)
        second=self.call('feedback.submit',args)
        self.assertEqual(first['id'],second['id']);self.assertTrue(second['reused'])
        self.assertNotIn(args['comment'].encode(),Path(self.store.path).read_bytes())
        value=self.call('experience.list',admin=True)
        self.assertEqual(value['summary']['feedback'],1)
        self.assertEqual(value['summary']['average_rating'],1)
        self.assertEqual(value['feedback'][0]['comment'],args['comment'])
        self.assertEqual(value['feedback'][0]['stage'],'proposal')
        with self.assertRaises(report_service.Rejected):self.call('feedback.submit',{**args,'rating':5})

    def test_feedback_requires_consent_actual_generation_and_correct_scope(self):
        for extra in ({'consent':False},{'rating':True},{'rating':0},{'rating':6},{'generation_token':'forged'},
                      {'stage':'report'},{'issues':['unknown']},{'comment':'字'*1501},{'role':'owner'}):
            with self.subTest(extra=extra),self.assertRaises(report_service.Rejected):
                self.call('feedback.submit',self.feedback(**extra))
        self.assertEqual(self.call('experience.list',admin=True)['feedback'],[])

    def test_private_generation_feedback_invites_and_reports_are_not_public_actions(self):
        for action,args in (('experience.list',{}),('beta.invite',{}),('beta.revoke',{'id':str(uuid.uuid4())}),
                            ('experience.update',{'id':str(uuid.uuid4()),'state':'resolved'}),('beta.admin_read',{'id':str(uuid.uuid4())}),('beta.delete',{'id':str(uuid.uuid4())})):
            with self.subTest(action=action),self.assertRaises(report_service.Rejected) as caught:self.call(action,args)
            self.assertEqual(caught.exception.status,403)

    def test_invite_opens_full_encrypted_report_before_any_feedback_and_retry_does_not_consume_twice(self):
        invite=self.call('beta.invite',admin=True)
        self.assertNotIn(invite['code'].encode(),Path(self.store.path).read_bytes())
        beta=self.beta(invite)
        self.assertEqual(beta['report']['analysis'],self.full['analysis'])
        self.assertEqual(beta['report']['candidates'],self.full['candidates'])
        self.assertEqual(self.beta(invite)['id'],beta['id'])
        self.assertEqual(self.call('beta.read',self.identity)['id'],beta['id'])
        listed=self.call('experience.list',admin=True)
        self.assertEqual(listed['summary']['feedback'],0)
        self.assertEqual(listed['invites'][0]['uses'],1)
        raw=Path(self.store.path).read_bytes()
        for secret in ('birthDate','2024-04-10','杭州',*self.names):self.assertNotIn(secret.encode(),raw)
        other=self.record()
        with self.assertRaises(report_service.Rejected):self.beta(invite,identity={k:other[k] for k in self.identity})
        with self.assertRaises(report_service.Rejected):self.call('beta.read',{**self.identity,'generation_token':other['generation_token']})

    def test_beta_cannot_skip_consent_forge_input_names_or_use_expired_invites(self):
        invite=self.call('beta.invite',admin=True)
        for extra in ({'consent':False},{'input':{**BASE,'surname':'张'}},{'expected_names':['林伪造']},{'code':'XM-'+'x'*32}):
            with self.subTest(extra=extra),self.assertRaises(report_service.Rejected):self.beta(invite,**extra)
        with self.store.connect() as db:db.execute('UPDATE beta_invites SET expires_at=?',(time.time()-1,))
        with self.assertRaises(report_service.Rejected):self.beta(invite)
        self.assertEqual(self.call('experience.list',admin=True)['summary']['beta_reports'],0)

    def test_algorithm_change_does_not_consume_invite_or_save_a_different_report(self):
        invite=self.call('beta.invite',admin=True)
        with patch('server.analyze',return_value={**self.full,'candidates':[]}):
            with self.assertRaises(report_service.Rejected):self.beta(invite)
        self.assertEqual(self.call('experience.list',admin=True)['invites'][0]['uses'],0)
        self.assertIn('bazi',self.beta(invite)['report']['analysis'])

    def test_report_feedback_scope_cannot_be_forged_and_stays_separate_from_proposal_feedback(self):
        self.call('feedback.submit',self.feedback())
        self.beta()
        receipt=self.call('feedback.submit',self.feedback(stage='report',rating=2,comment='报告篇幅太长，希望解释清楚。'))
        value=self.call('experience.list',{'stage':'report'},True)
        self.assertEqual(value['summary']['feedback'],2)
        self.assertEqual(value['summary']['by_stage']['proposal'],{'count':1,'average_rating':1.0})
        self.assertEqual(value['summary']['by_stage']['report'],{'count':1,'average_rating':2.0})
        self.assertEqual(len(value['feedback']),1)
        self.assertEqual(value['feedback'][0]['id'],receipt['id'])
        self.assertIsNotNone(value['feedback'][0]['beta_report_id'])

    def test_feedback_is_actionable_exportable_and_deletable_without_changing_user_words(self):
        args=self.feedback();reference=self.call('feedback.submit',args)['id']
        self.call('experience.update',{'id':reference,'state':'planned'},True)
        row=self.call('experience.list',{'state':'planned'},True)['feedback'][0]
        self.assertEqual(row['comment'],args['comment']);self.assertEqual(row['rating'],1)
        self.call('experience.update',{'id':reference,'state':'resolved'},True)
        self.assertEqual(self.call('experience.list',admin=True)['feedback'][0]['state'],'resolved')
        self.call('experience.delete',{'id':reference},True)
        self.assertEqual(self.call('experience.list',admin=True)['feedback'],[])

    def test_revocation_blocks_new_report_reads_but_not_criticism_from_previous_experience(self):
        invite=self.call('beta.invite',admin=True);beta=self.beta(invite)
        self.call('beta.revoke',{'id':invite['id']},True)
        with self.assertRaises(report_service.Rejected):self.call('beta.read',self.identity)
        self.assertEqual(self.call('beta.admin_read',{'id':beta['id']},True)['id'],beta['id'])
        self.call('feedback.submit',self.feedback(stage='report',rating=1))
        self.call('beta.delete',{'id':beta['id']},True)
        with self.assertRaises(report_service.Rejected):self.call('beta.admin_read',{'id':beta['id']},True)

    def test_expiry_purges_personal_report_and_feedback_and_rejects_old_tokens(self):
        self.beta();self.call('feedback.submit',self.feedback())
        with self.store.connect() as db:
            db.execute('UPDATE generations SET expires_at=?',(time.time()-1,))
            db.execute('UPDATE beta_reports SET expires_at=?',(time.time()-1,))
            db.execute('UPDATE feedback SET expires_at=?',(time.time()-1,))
            self.store.purge(db)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM feedback').fetchone()[0],0)
            self.assertIsNone(db.execute('SELECT ciphertext FROM beta_reports').fetchone()[0])
        with self.assertRaises(report_service.Rejected):self.call('feedback.submit',self.feedback())

    def test_one_invite_cannot_be_consumed_by_two_concurrent_generations(self):
        invite=self.call('beta.invite',admin=True)
        second=self.record();identities=[self.identity,{k:second[k] for k in self.identity}]
        def redeem(identity):
            try:return self.beta(invite,identity=identity)['id']
            except report_service.Rejected as error:return error.status
        with ThreadPoolExecutor(max_workers=2) as pool:result=list(pool.map(redeem,identities))
        self.assertEqual(sum(isinstance(x,str) for x in result),1)
        self.assertIn(409,result)
        self.assertEqual(self.call('experience.list',admin=True)['summary']['beta_reports'],1)

    def test_one_testers_failed_codes_do_not_lock_other_testers_on_the_same_network(self):
        invite=self.call('beta.invite',admin=True)
        for _ in range(15):
            with self.assertRaises(report_service.Rejected):self.beta(invite,code='XM-'+'x'*32)
        with self.assertRaises(report_service.Rejected) as caught:self.beta(invite)
        self.assertEqual(caught.exception.status,429)
        other=self.record()
        result=self.beta(invite,identity={k:other[k] for k in self.identity})
        self.assertIn('bazi',result['report']['analysis'])
