"""Anonymous generation counters, private feedback, and invitation-bound beta reports."""
import hashlib
import hmac
import json
import re
import secrets
import time
import uuid
from report_client import proposal_fingerprint
from public_proposals import INPUT_FIELDS

RETENTION = 30 * 86400
ISSUES = ('form', 'generation', 'names', 'meaning', 'evidence', 'reading', 'other')
STATES = ('new', 'planned', 'resolved')


class Experience:
    def __init__(self, store, rejected):
        self.store, self.Rejected = store, rejected
        with store.connect() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS generations (
                id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, fingerprint TEXT NOT NULL,
                client_hash TEXT NOT NULL, created_at REAL NOT NULL, expires_at REAL NOT NULL, metrics TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS generations_time ON generations(created_at);
              CREATE INDEX IF NOT EXISTS generations_client ON generations(client_hash,created_at);
              CREATE TABLE IF NOT EXISTS feedback (
                id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, generation_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL, stage TEXT NOT NULL, rating INTEGER NOT NULL,
                state TEXT NOT NULL, created_at REAL NOT NULL, expires_at REAL NOT NULL, ciphertext BLOB,
                UNIQUE(generation_id,stage));
              CREATE TABLE IF NOT EXISTS beta_invites (
                id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, created_at REAL NOT NULL,
                expires_at REAL NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0);
              CREATE TABLE IF NOT EXISTS beta_reports (
                id TEXT PRIMARY KEY, generation_id TEXT UNIQUE NOT NULL, invite_id TEXT NOT NULL,
                created_at REAL NOT NULL, expires_at REAL NOT NULL, ciphertext BLOB);
              CREATE TABLE IF NOT EXISTS beta_attempts (client_hash TEXT NOT NULL,at REAL NOT NULL);
              CREATE INDEX IF NOT EXISTS beta_attempt_time ON beta_attempts(client_hash,at);
            ''')

    def fail(self, message, status=400):
        raise self.Rejected(message, status)

    def fields(self, args, allowed):
        if not isinstance(args, dict) or set(args) - set(allowed):
            self.fail('请求包含无效字段。')

    def identifier(self, value):
        try:
            if str(uuid.UUID(str(value))) != value:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            self.fail('记录编号无效。')
        return value

    def digest(self, kind, value):
        return hmac.new(self.store.digest_key, f'{kind}:{value}'.encode(), hashlib.sha256).hexdigest()

    def encrypt(self, data):
        return self.store.cipher.encrypt(json.dumps(data, ensure_ascii=False, sort_keys=True).encode())

    def decrypt(self, row):
        return self.store.decrypt(row)

    def purge(self, db):
        now = time.time()
        db.execute('DELETE FROM generations WHERE expires_at<=?', (now,))
        db.execute('DELETE FROM feedback WHERE expires_at<=?', (now,))
        db.execute('UPDATE beta_reports SET ciphertext=NULL WHERE expires_at<=?', (now,))
        db.execute('DELETE FROM beta_reports WHERE created_at<?', (now - 90 * 86400,))
        db.execute('DELETE FROM beta_invites WHERE created_at<?', (now - 90 * 86400,))
        db.execute('DELETE FROM beta_attempts WHERE at<?', (now - 900,))

    def generation(self, db, args):
        reference = self.identifier(args.get('generation_id'))
        token = args.get('generation_token')
        row = db.execute('SELECT * FROM generations WHERE id=? AND expires_at>?', (reference, time.time())).fetchone()
        if not isinstance(token, str) or not row or not hmac.compare_digest(row['token_hash'], self.digest('generation', token)):
            self.fail('本次体验记录无效或已过期，请重新生成名字。', 404)
        return row

    def record(self, args, actor):
        self.fields(args, ('metrics', 'fingerprint', 'client'))
        metrics = args.get('metrics')
        required = {'purpose', 'mode', 'algorithm', 'count', 'requested_count', 'length', 'variant', 'duration_ms'}
        if not isinstance(metrics, dict) or set(metrics) != required:
            self.fail('生成统计字段无效。')
        if metrics['purpose'] not in ('newborn', 'rename') or metrics['mode'] not in ('due_date', 'born') or metrics['algorithm'] not in ('legacy_v2', 'literary_v3'):
            self.fail('生成场景无效。')
        if metrics['purpose'] == 'rename' and metrics['mode'] != 'born':
            self.fail('改名必须使用实际出生信息。')
        for key, low, high in (('count', 0, 11), ('requested_count', 1, 11), ('length', 1, 3), ('variant', 0, 100000), ('duration_ms', 0, 300000)):
            if type(metrics[key]) is not int or not low <= metrics[key] <= high:
                self.fail('生成统计参数无效。')
        fingerprint = args.get('fingerprint')
        if not isinstance(fingerprint, str) or not re.fullmatch('[0-9a-f]{64}', fingerprint):
            self.fail('提案标识无效。')
        now = time.time()
        client = self.digest('client', str(args.get('client', ''))[:128])
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self.purge(db)
            if db.execute('SELECT COUNT(*) FROM generations WHERE client_hash=? AND created_at>?', (client, now - 900)).fetchone()[0] >= 1000 or db.execute('SELECT COUNT(*) FROM generations').fetchone()[0] >= 100000:
                self.fail('体验记录暂时较多，本次名字提案仍可使用。', 429)
            reference, token = str(uuid.uuid4()), secrets.token_urlsafe(32)
            db.execute('INSERT INTO generations VALUES(?,?,?,?,?,?,?)', (reference, self.digest('generation', token), self.digest('proposal', fingerprint), client, now, now + RETENTION, json.dumps(metrics)))
        return {'available': True, 'generation_id': reference, 'generation_token': token, 'expires_at': now + RETENTION}

    def submit(self, args, actor):
        self.fields(args, ('generation_id', 'generation_token', 'request_key', 'stage', 'rating', 'issues', 'comment', 'consent'))
        if args.get('consent') is not True:
            self.fail('请确认自愿提交本次体验反馈。')
        request_key = self.identifier(args.get('request_key'))
        stage, rating = args.get('stage'), args.get('rating')
        issues, comment = args.get('issues', []), args.get('comment', '')
        if stage not in ('proposal', 'report') or type(rating) is not int or not 1 <= rating <= 5:
            self.fail('请选择本次体验的评分（1–5分）。')
        if not isinstance(issues, list) or len(issues) > 4 or any(not isinstance(x, str) or x not in ISSUES for x in issues) or len(set(issues)) != len(issues):
            self.fail('改进方向最多选择4项。')
        if not isinstance(comment, str) or len(comment) > 1500:
            self.fail('改进意见最多1500字。')
        content = {'stage': stage, 'rating': rating, 'issues': sorted(issues), 'comment': comment.strip()}
        fingerprint = self.digest('feedback', json.dumps(content, ensure_ascii=False, sort_keys=True))
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self.purge(db)
            generation = self.generation(db, args)
            beta = db.execute('SELECT * FROM beta_reports WHERE generation_id=?', (generation['id'],)).fetchone()
            if stage == 'report':
                if not beta:
                    self.fail('请先通过内测入口查看完整报告，再评价报告体验。', 409)
            old = db.execute('SELECT * FROM feedback WHERE request_key=? OR (generation_id=? AND stage=?)', (request_key, generation['id'], stage)).fetchall()
            if old:
                if len(old) != 1 or old[0]['generation_id'] != generation['id'] or old[0]['fingerprint'] != fingerprint or old[0]['ciphertext'] is None:
                    self.fail('本轮体验已提交反馈，请勿覆盖或重复提交。', 409)
                return {'id': old[0]['id'], 'reused': True}
            reference, now = str(uuid.uuid4()), time.time()
            envelope = {**content, 'metrics': json.loads(generation['metrics']), 'beta_report_id': beta['id'] if stage == 'report' else None}
            db.execute('INSERT INTO feedback VALUES(?,?,?,?,?,?,?,?,?,?)', (reference, request_key, generation['id'], fingerprint, stage, rating, 'new', now, now + RETENTION, self.encrypt(envelope)))
            self.store.audit(db, actor, 'experience.submitted', reference)
        return {'id': reference, 'reused': False}

    def active_invite(self, db, reference):
        row = db.execute('SELECT * FROM beta_invites WHERE id=?', (reference,)).fetchone()
        if not row or row['revoked']:
            self.fail('该内测邀请已撤销，请联系经营者。', 403)
        return row

    def invite(self, args, actor):
        self.fields(args, ())
        code, reference, now = 'XM-' + secrets.token_urlsafe(24), str(uuid.uuid4()), time.time()
        with self.store.connect() as db:
            self.purge(db)
            db.execute('INSERT INTO beta_invites(id,code_hash,created_at,expires_at) VALUES(?,?,?,?)', (reference, self.digest('invite', code), now, now + 7 * 86400))
            self.store.audit(db, actor, 'beta.invited', reference)
        return {'id': reference, 'code': code, 'expires_at': now + 7 * 86400, 'uses_allowed': 1}

    def beta_payload(self, row):
        return {'id': row['id'], 'expires_at': row['expires_at'], 'report': self.decrypt(row)}

    def beta_read(self, args, actor):
        self.fields(args, ('generation_id', 'generation_token'))
        with self.store.connect() as db:
            self.purge(db)
            generation = self.generation(db, args)
            row = db.execute('SELECT * FROM beta_reports WHERE generation_id=? AND ciphertext IS NOT NULL', (generation['id'],)).fetchone()
            if not row:
                self.fail('请先使用内测邀请码开启本次报告。', 404)
            self.active_invite(db, row['invite_id'])
            self.store.audit(db, actor, 'beta.read', row['id'])
            return self.beta_payload(row)

    def redeem(self, args, actor):
        self.fields(args, ('generation_id', 'generation_token', 'code', 'input', 'expected_names', 'consent', 'client'))
        if args.get('consent') is not True:
            self.fail('请确认同意保存本次资料和内测报告，最多30天。')
        code, data, names = args.get('code'), args.get('input'), args.get('expected_names')
        if not isinstance(code, str) or not re.fullmatch(r'XM-[A-Za-z0-9_-]{32}', code):
            self.fail('请填写有效的内测邀请码。')
        if not isinstance(data, dict) or set(data) - INPUT_FIELDS or not isinstance(names, list) or len(names) > 11 or any(not isinstance(x, str) or not 2 <= len(x) <= 5 for x in names):
            self.fail('提案资料无效，请重新生成。')
        now = time.time()
        # Commit failed-attempt counters too; an invalid code must not roll them back.
        with self.store.connect() as db:
            self.purge(db)
            generation = self.generation(db, args)
            # Per-generation capability, not a shared office/mobile-network IP.
            scope = self.digest('beta-attempt', generation['id'])
            if db.execute('SELECT COUNT(*) FROM beta_attempts WHERE client_hash=? AND at>?', (scope, now - 900)).fetchone()[0] >= 15:
                self.fail('验证次数较多，请15分钟后重试。', 429)
            db.execute('INSERT INTO beta_attempts VALUES(?,?)', (scope, now))
        with self.store.connect() as db:
            generation = self.generation(db, args)
            if generation['fingerprint'] != self.digest('proposal', proposal_fingerprint(data, names)):
                self.fail('填写内容或提案已变化，请应用修改后再体验报告。', 409)
            invite = db.execute('SELECT * FROM beta_invites WHERE code_hash=?', (self.digest('invite', code),)).fetchone()
            if not invite or invite['revoked']:
                self.fail('内测邀请码无效或已撤销。', 403)
            existing = db.execute('SELECT * FROM beta_reports WHERE generation_id=?', (generation['id'],)).fetchone()
            if existing:
                if existing['ciphertext'] is None:
                    self.fail('内测报告已删除或过期，请重新生成后体验。', 410)
                if existing['invite_id'] != invite['id']:
                    self.fail('本轮已有内测报告，请使用原邀请或重新打开已授权报告。', 409)
                return self.beta_payload(existing)
            if invite['expires_at'] <= now or invite['uses']:
                self.fail('邀请码已兑换或过期，请联系经营者获取新的邀请。', 409)
        from server import analyze
        result = analyze(data)
        if [x['name'] for x in result['candidates']] != names:
            self.fail('提案已更新，请重新生成后再体验。', 409)
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self.purge(db)
            generation = self.generation(db, args)
            existing = db.execute('SELECT * FROM beta_reports WHERE generation_id=? AND ciphertext IS NOT NULL', (generation['id'],)).fetchone()
            if existing:
                if existing['invite_id'] != invite['id']:
                    self.fail('本轮已使用另一份邀请。', 409)
                self.active_invite(db, invite['id'])
                return self.beta_payload(existing)
            invite = self.active_invite(db, invite['id'])
            if invite['expires_at'] <= time.time() or invite['uses']:
                self.fail('邀请码已兑换或过期，请联系经营者。', 409)
            reference, now = str(uuid.uuid4()), time.time()
            expires = min(generation['expires_at'], now + RETENTION)
            envelope = {'version': 1, 'kind': 'beta_report', 'data': data, **result}
            db.execute('INSERT INTO beta_reports VALUES(?,?,?,?,?,?)', (reference, generation['id'], invite['id'], now, expires, self.encrypt(envelope)))
            db.execute('UPDATE beta_invites SET uses=1 WHERE id=?', (invite['id'],))
            self.store.audit(db, actor, 'beta.opened', reference)
            return {'id': reference, 'expires_at': expires, 'report': envelope}

    def overview(self, args, actor):
        self.fields(args, ('stage', 'state'))
        stage, state = args.get('stage', ''), args.get('state', '')
        if stage not in ('', 'proposal', 'report') or state not in ('', *STATES):
            self.fail('筛选条件无效。')
        with self.store.connect() as db:
            self.purge(db)
            where, values = ['ciphertext IS NOT NULL'], []
            for key, value in (('stage', stage), ('state', state)):
                if value:
                    where.append(f'{key}=?'); values.append(value)
            feedback = []
            for row in db.execute('SELECT * FROM feedback WHERE ' + ' AND '.join(where) + ' ORDER BY created_at DESC LIMIT 100', values):
                feedback.append({**self.decrypt(row), 'id': row['id'], 'generation_id': row['generation_id'], 'created_at': row['created_at'], 'state': row['state']})
            counts = db.execute('SELECT COUNT(*),AVG(rating),SUM(state=\'new\') FROM feedback WHERE ciphertext IS NOT NULL').fetchone()
            summary = {'generations': db.execute('SELECT COUNT(*) FROM generations').fetchone()[0], 'feedback': counts[0], 'average_rating': round(counts[1], 2) if counts[1] is not None else None,
                       'pending_feedback': counts[2] or 0, 'beta_reports': db.execute('SELECT COUNT(*) FROM beta_reports WHERE ciphertext IS NOT NULL').fetchone()[0]}
            summary['by_stage'] = {}
            for scope in ('proposal', 'report'):
                count, average = db.execute('SELECT COUNT(*),AVG(rating) FROM feedback WHERE ciphertext IS NOT NULL AND stage=?', (scope,)).fetchone()
                summary['by_stage'][scope] = {'count': count, 'average_rating': round(average, 2) if average is not None else None}
            generations = [{'id': r['id'], 'created_at': r['created_at'], **json.loads(r['metrics'])} for r in db.execute('SELECT * FROM generations ORDER BY created_at DESC LIMIT 100')]
            invites = [dict(r) for r in db.execute('SELECT id,created_at,expires_at,revoked,uses FROM beta_invites ORDER BY created_at DESC LIMIT 100')]
            reports = []
            for r in db.execute('SELECT * FROM beta_reports WHERE ciphertext IS NOT NULL ORDER BY created_at DESC LIMIT 100'):
                report = self.decrypt(r)
                reports.append({'id': r['id'], 'created_at': r['created_at'], 'expires_at': r['expires_at'], 'generation_id': r['generation_id'], 'purpose': report['analysis']['purpose'], 'names': [x['name'] for x in report['candidates']]})
            self.store.audit(db, actor, 'experience.list')
        return {'summary': summary, 'feedback': feedback, 'generations': generations, 'invites': invites, 'beta_reports': reports, 'limit': 100, 'retention_days': 30}

    def admin_action(self, action, args, actor):
        if action == 'experience.list':
            return self.overview(args, actor)
        if action == 'beta.invite':
            return self.invite(args, actor)
        self.fields(args, ('id', 'state') if action == 'experience.update' else ('id',))
        reference = self.identifier(args.get('id'))
        with self.store.connect() as db:
            self.purge(db)
            if action == 'beta.delete':
                if not db.execute('SELECT id FROM beta_reports WHERE id=? AND ciphertext IS NOT NULL', (reference,)).fetchone():
                    self.fail('内测报告不存在或已删除。', 404)
                db.execute('UPDATE beta_reports SET ciphertext=NULL WHERE id=?', (reference,))
            elif action == 'beta.revoke':
                if not db.execute('SELECT id FROM beta_invites WHERE id=?', (reference,)).fetchone():
                    self.fail('邀请不存在。', 404)
                db.execute('UPDATE beta_invites SET revoked=1 WHERE id=?', (reference,))
            elif action == 'beta.admin_read':
                row = db.execute('SELECT * FROM beta_reports WHERE id=? AND ciphertext IS NOT NULL', (reference,)).fetchone()
                if not row:
                    self.fail('内测报告不存在或已过期。', 404)
                self.store.audit(db, actor, action, reference)
                return self.beta_payload(row)
            elif action in ('experience.update', 'experience.delete'):
                if not db.execute('SELECT id FROM feedback WHERE id=? AND ciphertext IS NOT NULL', (reference,)).fetchone():
                    self.fail('反馈不存在或已删除。', 404)
                if action == 'experience.update':
                    if args.get('state') not in STATES:
                        self.fail('处理状态无效。')
                    db.execute('UPDATE feedback SET state=? WHERE id=?', (args['state'], reference))
                else:
                    db.execute('UPDATE feedback SET ciphertext=NULL WHERE id=?', (reference,))
            else:
                self.fail('操作不存在。')
            self.store.audit(db, actor, action, reference)
        return {'ok': True}
