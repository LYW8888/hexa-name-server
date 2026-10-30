import json
from io import StringIO
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.core.management import call_command
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice
from .models import StaffProfile, AuditEvent

PASSWORD = 'Test-Only-Long-Passphrase-684!'


class BackofficeTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.accounts = {}
        for role in ('owner', 'support', 'finance', 'delivery'):
            user = get_user_model().objects.create_user(role + '_test', password=PASSWORD)
            StaffProfile.objects.create(user=user, role=role, must_change_password=False)
            device = TOTPDevice.objects.create(user=user, confirmed=True)
            cls.accounts[role] = (user, device)

    def as_role(self, role):
        user, device = self.accounts[role]
        self.client.force_login(user, backend='django.contrib.auth.backends.ModelBackend')
        session = self.client.session
        session['otp_device_id'] = device.persistent_id
        session.save()
        return user

    def post(self, path, data=None):
        return self.client.post(path, data=json.dumps(data or {}), content_type='application/json')

    def test_password_and_totp_are_required_and_token_cannot_be_replayed(self):
        user, device = self.accounts['support']
        token = f'{totp(device.bin_key):06d}'
        self.assertEqual(self.post('/api/login', {'username':user.username,'password':PASSWORD,'token':'not-valid'}).status_code, 401)
        # Use a different account so OTP's own failed-token backoff is irrelevant.
        user, device = self.accounts['finance']
        token = f'{totp(device.bin_key):06d}'
        self.assertEqual(self.post('/api/login', {'username':user.username,'password':PASSWORD,'token':token}).status_code, 200)
        self.assertEqual(self.client.get('/api/session').json()['user']['role'], 'finance')
        self.post('/api/logout')
        self.assertEqual(self.post('/api/login', {'username':user.username,'password':PASSWORD,'token':token}).status_code, 401)
        self.assertIsNone(self.client.get('/api/session').json()['user'])

    def test_password_only_session_is_denied(self):
        self.client.force_login(self.accounts['support'][0], backend='django.contrib.auth.backends.ModelBackend')
        self.assertEqual(self.client.get('/api/overview').status_code, 401)

    def test_csrf_and_origin_are_enforced(self):
        client = Client(enforce_csrf_checks=True)
        data = {'username':'owner_test','password':PASSWORD,'token':'000000'}
        self.assertEqual(client.post('/api/login', data=json.dumps(data), content_type='application/json').status_code, 403)
        token = client.get('/api/session').json()['csrf']
        response = client.post('/api/login', data=json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN='https://attacker.invalid')
        self.assertEqual(response.status_code, 403)

    def test_anonymous_cannot_read_or_change_staff_data(self):
        for path in ('/api/overview','/api/staff','/api/audit','/api/ops/finance/list'):
            self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.post('/api/ops/finance/record', {'kind':'income','amount_fen':100}).status_code, 401)

    @patch('backoffice.views.gateway.call')
    def test_all_cross_role_calls_are_denied_before_worker_dispatch(self, call):
        for caller in ('owner','support','finance','delivery'):
            self.as_role(caller)
            for target in ('support','finance','delivery'):
                if caller != target:
                    self.assertEqual(self.client.get(f'/api/ops/{target}/list').status_code, 403)
                    self.assertEqual(self.post(f'/api/ops/{target}/create').status_code, 403)
        call.assert_not_called()

    @patch('backoffice.views.gateway.call', return_value={'counts':{'open':2}})
    def test_owner_gets_summaries_only(self, call):
        user = self.as_role('owner')
        response = self.client.get('/api/overview')
        self.assertEqual(set(response.json()['summary']), {'support','finance','delivery'})
        self.assertEqual(call.call_count, 3)
        for args in call.call_args_list:
            self.assertEqual(args.args[1:], ('summary', {}, user.pk))

    @patch('backoffice.views.gateway.call', return_value={'status':'processing','attempts':1})
    def test_support_can_read_minimal_service_status_but_other_roles_cannot(self, call):
        service_id = '11111111-1111-4111-8111-111111111111'
        user = self.as_role('support')
        self.assertEqual(self.client.get(f'/api/service-status/{service_id}').status_code, 200)
        call.assert_called_once_with('delivery', 'status', {'id':service_id}, user.pk)
        for role in ('owner','finance','delivery'):
            self.as_role(role)
            self.assertEqual(self.client.get(f'/api/service-status/{service_id}').status_code, 403)

    @patch('backoffice.views.gateway.call', return_value={'id':'example'})
    def test_role_actions_forward_only_whitelisted_fields_with_staff_actor(self, call):
        user = self.as_role('finance')
        self.assertEqual(self.post('/api/ops/finance/record', {'kind':'income','amount_fen':9900}).status_code, 200)
        call.assert_called_once_with('finance', 'record', {'kind':'income','amount_fen':9900}, user.pk)
        self.assertEqual(self.post('/api/ops/finance/record', {'kind':'income','amount_fen':9900,'database':'/private'}).status_code, 400)
        self.assertEqual(self.client.get('/api/ops/finance/record').status_code, 405)

    def test_first_login_requires_password_change(self):
        user = self.as_role('support')
        StaffProfile.objects.filter(user=user).update(must_change_password=True)
        self.assertEqual(self.client.get('/api/overview').status_code, 403)
        result = self.post('/api/password', {'current_password':PASSWORD,'new_password':'A-Different-Strong-Password-593!'} )
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.json()['user']['must_change_password'])
        user.refresh_from_db()
        self.assertTrue(user.check_password('A-Different-Strong-Password-593!'))

    def test_staff_provisioning_never_exposes_secret_in_later_lists(self):
        self.as_role('owner')
        created = self.post('/api/staff', {'username':'new_support','password':PASSWORD,'role':'support'})
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()['provisioning_uri'].startswith('otpauth://'))
        listed = self.client.get('/api/staff').json()
        self.assertNotIn('otpauth', json.dumps(listed))
        self.assertNotIn(PASSWORD, json.dumps(listed))
        self.as_role('support')
        self.assertEqual(self.client.get('/api/staff').status_code, 403)

    def test_disabled_staff_session_is_revoked(self):
        support = self.as_role('support')
        old_client = self.client
        self.client = Client()
        self.as_role('owner')
        self.assertEqual(self.post(f'/api/staff/{support.pk}/disable').status_code, 200)
        self.client = old_client
        self.assertEqual(self.client.get('/api/overview').status_code, 401)

    def test_owner_cannot_disable_self(self):
        owner = self.as_role('owner')
        self.assertEqual(self.post(f'/api/staff/{owner.pk}/disable').status_code, 400)
        owner.refresh_from_db()
        self.assertTrue(owner.is_active)

    def test_brute_force_lockout_is_persistent(self):
        for _ in range(5):
            response = self.post('/api/login', {'username':'owner_test','password':'wrong','token':'000000'})
        self.assertEqual(response.status_code, 429)
        _, device = self.accounts['owner']
        self.assertEqual(self.post('/api/login', {'username':'owner_test','password':PASSWORD,'token':f'{totp(device.bin_key):06d}'}).status_code, 429)

    @override_settings(SESSION_COOKIE_SECURE=True, SESSION_COOKIE_SAMESITE='Strict')
    def test_security_headers_and_cookie_flags(self):
        user, device = self.accounts['owner']
        response = self.post('/api/login', {'username':user.username,'password':PASSWORD,'token':f'{totp(device.bin_key):06d}'})
        self.assertEqual(response.status_code, 200)
        cookie = response.cookies['xuming_admin_dev']
        self.assertTrue(cookie['secure']); self.assertTrue(cookie['httponly']); self.assertEqual(cookie['samesite'],'Strict')
        self.assertEqual(int(cookie['max-age']), 1800)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(response['X-Frame-Options'], 'DENY')
        self.assertIn("frame-ancestors 'none'", response['Content-Security-Policy'])
        refreshed = self.client.get('/api/session')
        self.assertEqual(refreshed.json()['user']['username'], user.username)
        self.assertNotIn('xuming_admin_dev', refreshed.cookies)

    def test_credential_recovery_revokes_old_sessions_and_rotates_totp(self):
        user = self.as_role('support')
        old_device = self.accounts['support'][1]
        with patch('backoffice.management.commands.reset_operator.getpass', return_value='Recovered-Initial-Password-731!'):
            call_command('reset_operator', user.username, stdout=StringIO())
        self.assertEqual(self.client.get('/api/overview').status_code, 401)
        self.assertFalse(TOTPDevice.objects.filter(pk=old_device.pk).exists())
        user.refresh_from_db()
        self.assertTrue(user.staff_profile.must_change_password)

    def test_credential_recovery_does_not_silently_reactivate_disabled_staff(self):
        user = self.accounts['finance'][0]
        user.is_active = False; user.save()
        with patch('backoffice.management.commands.reset_operator.getpass', return_value='Recovered-Initial-Password-731!'):
            call_command('reset_operator', user.username, stdout=StringIO())
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_internal_sources_are_not_served(self):
        for path in ('/backoffice/settings.py','/operations/console.py','/auth.sqlite3','/.git/config','/assets/../admin.html'):
            self.assertEqual(self.client.get(path).status_code, 404)
