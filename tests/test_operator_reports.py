import json
import os
from pathlib import Path
import socketserver
import sqlite3
import tempfile
import threading
import time
import unittest
import uuid
from unittest.mock import patch
from cryptography.fernet import Fernet
import public_proposals
import report_client
import report_service
import server

BASE = {'algorithm':'literary_v3','surname':'林','mode':'born','birthDate':'2024-04-10','birthTime':'12:00','place':'杭州','elementPreference':'yongshen','candidateCount':3}


class ReportStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.key = Fernet.generate_key()
        self.store = report_service.Store(self.temp.name, self.key)
        self.full = server.analyze(BASE)
        self.args = {'request_key':str(uuid.uuid4()), 'input':BASE, 'expected_names':[x['name'] for x in self.full['candidates']], 'consent':True, 'client':'test-client'}

    def tearDown(self):
        self.temp.cleanup()

    def create(self):
        return self.store.dispatch('create', self.args, 'public', False)

    def test_public_projection_keeps_only_names_and_never_report_evidence(self):
        value = public_proposals.project(self.full)
        self.assertEqual(value['analysis']['access'], 'proposal_only')
        self.assertEqual(public_proposals.project(value), value)
        self.assertEqual(set(value['candidates'][0]), {'name','given','pinyin','meaning'})
        for field in ('bazi','mingli','gua','source_audit','traditional','name_review','naming_reference'):
            self.assertNotIn(field, value['analysis'])
        for field in ('citations','numerology','ranking','element_evidence','score','source'):
            self.assertNotIn(field, value['candidates'][0])

    def test_explicit_submission_encrypts_and_admin_receives_same_full_snapshot(self):
        receipt = self.create()
        self.assertEqual(set(receipt), {'id','status','reused','expires_at'})
        raw = Path(self.store.path).read_bytes()
        for value in ('birthDate', '2024-04-10', '林', self.full['candidates'][0]['name']):
            self.assertNotIn(value.encode(), raw)
        report = self.store.dispatch('read', {'id':receipt['id']}, 'staff:1', True)['report']
        self.assertEqual(report['data'], BASE)
        self.assertEqual(report['analysis'], self.full['analysis'])
        self.assertEqual(report['candidates'], self.full['candidates'])
        self.assertEqual(os.stat(self.store.path).st_mode & 0o777, 0o600)

    def test_no_report_read_or_management_from_public_uid_even_with_identifier(self):
        receipt = self.create()
        for action,args in (('read',{'id':receipt['id']}),('list',{}),('deliver',{'id':receipt['id']}),('delete',{'id':receipt['id']}),('audit',{})):
            with self.subTest(action=action), self.assertRaises(report_service.Rejected) as caught:
                self.store.dispatch(action,args,'staff:1',False)
            self.assertEqual(caught.exception.status,403)

    def test_retry_is_idempotent_across_network_changes_and_cannot_replace_input(self):
        first = self.create()
        again = self.create()
        self.assertEqual(first['id'],again['id']); self.assertTrue(again['reused'])
        changed_network=self.store.dispatch('create',{**self.args,'client':'different-client'},'public',False)
        self.assertEqual(changed_network['id'],first['id'])
        with self.assertRaises(report_service.Rejected):
            self.store.dispatch('create',{**self.args,'input':{**BASE,'place':'成都'}},'public',False)
        with self.store.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM requests').fetchone()[0],1)

    def test_consent_and_original_proposal_names_are_required_and_payment_is_not_trusted(self):
        for changes in ({'consent':False},{'expected_names':['林伪造']},{'input':{**BASE,'paid':True}},{'report':self.full}):
            with self.subTest(changes=changes), self.assertRaises(report_service.Rejected):
                self.store.dispatch('create',{**self.args,**changes},'public',False)
        with self.store.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM requests').fetchone()[0],0)

    def test_delete_and_expiry_block_reads_and_late_retries(self):
        reference=self.create()['id']
        self.store.dispatch('delete',{'id':reference},'staff:1',True)
        for action,args,admin in (('read',{'id':reference},True),('create',self.args,False)):
            with self.assertRaises(report_service.Rejected): self.store.dispatch(action,args,'staff:1' if admin else 'public',admin)
        self.args['request_key']=str(uuid.uuid4())
        reference=self.create()['id']
        with self.store.connect() as db: db.execute('UPDATE requests SET expires_at=? WHERE id=?',(time.time()-1,reference))
        self.assertEqual(self.store.dispatch('list',{},'staff:1',True)['requests'],[])
        with self.assertRaises(report_service.Rejected): self.store.read(reference,'staff:1')

    def test_delivery_is_manual_idempotent_and_snapshot_is_preserved(self):
        reference=self.create()['id']
        for _ in range(2): self.store.dispatch('deliver',{'id':reference},'staff:1',True)
        with patch('server.analyze',side_effect=AssertionError('saved reports must not recompute')):
            read=self.store.read(reference,'staff:1')
        self.assertEqual(read['status'],'delivered')
        self.assertEqual(read['report']['candidates'],self.full['candidates'])
        rows=self.store.dispatch('list',{'query':reference},'staff:1',True)['requests']
        self.assertEqual(len(rows),1)
        pasted=self.store.dispatch('list',{'query':f'序名完整报告申请\n申请编号：{reference.upper()}\n名字提案：林安'},'staff:1',True)['requests']
        self.assertEqual(pasted[0]['id'],reference)
        self.assertNotIn('birthDate',json.dumps(rows))
        events=self.store.dispatch('audit',{},'staff:1',True)['events']
        self.assertTrue(any(row['action']=='report.deliver' and row['actor']=='staff:1' for row in events))

    def test_wrong_key_fails_closed_and_invalid_storage_is_rejected(self):
        reference=self.create()['id']
        other=report_service.Store(self.temp.name,Fernet.generate_key())
        with self.assertRaises(report_service.Rejected): other.read(reference,'staff:1')
        os.chmod(self.temp.name,0o755)
        with self.assertRaises(PermissionError): report_service.Store(self.temp.name,self.key)

    def test_registration_budget_limits_new_requests_but_allows_safe_retry(self):
        with self.store.connect() as db:
            for index in range(10):
                args={**self.args,'request_key':str(uuid.uuid4())}
                with patch('server.analyze',return_value=self.full):
                    receipt=self.store.dispatch('create',args,'public',False)
            with self.assertRaises(report_service.Rejected) as caught:
                self.create()
            self.assertEqual(caught.exception.status,429)
        self.assertEqual(self.store.dispatch('create',args,'public',False)['id'],receipt['id'])

    def test_public_socket_cannot_spoof_staff_actor_to_read_a_report(self):
        target=str(Path(self.temp.name)/'worker.sock')
        worker=socketserver.ThreadingUnixStreamServer(target,report_service.Handler)
        worker.store=self.store;worker.public_uid=os.geteuid();worker.admin_uid=os.geteuid()+1
        thread=threading.Thread(target=worker.serve_forever,daemon=True);thread.start()
        try:
            receipt=report_client.call('create',self.args,socket_path=target)
            with self.assertRaises(report_client.ReportRejected) as caught:
                report_client.call('read',{'id':receipt['id']},'staff:1',target)
            self.assertEqual(caught.exception.status,403)
        finally:worker.shutdown();worker.server_close();thread.join()
