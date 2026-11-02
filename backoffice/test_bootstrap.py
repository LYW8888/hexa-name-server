import json
import os
from pathlib import Path
import tempfile
from io import StringIO
from unittest.mock import patch
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice
from .models import StaffProfile, AuditEvent
from .bootstrap import credential_path


class SuperadminTest(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.override = override_settings(HOME_DIR=Path(self.temp.name), PASSWORD_HASHERS=[
            'django.contrib.auth.hashers.Argon2PasswordHasher', 'django.contrib.auth.hashers.PBKDF2PasswordHasher'])
        self.override.enable()

    def tearDown(self):
        self.override.disable()
        self.temp.cleanup()

    def initialize(self):
        output = StringIO()
        call_command('bootstrap_superadmin', write_credentials=True, stdout=output)
        bundle = json.loads(credential_path().read_text())
        return get_user_model().objects.get(username=bundle['username']), bundle, output.getvalue()

    def post(self, path, data):
        return self.client.post(path, data=json.dumps(data), content_type='application/json')

    def test_random_identity_argon2id_and_private_delivery_with_no_secret_logs(self):
        user, bundle, output = self.initialize()
        self.assertRegex(user.username, r'^sa_[0-9a-f]{16}$')
        self.assertGreaterEqual(len(bundle['password']), 40)
        self.assertTrue(user.password.startswith('argon2$argon2id$'))
        self.assertTrue(user.check_password(bundle['password']))
        self.assertNotIn(bundle['password'], user.password)
        self.assertTrue(user.is_superuser and user.is_staff and user.staff_profile.is_superadmin)
        self.assertEqual(user.staff_profile.role, 'owner')
        self.assertTrue(user.staff_profile.must_change_password)
        self.assertEqual(os.stat(credential_path()).st_mode & 0o777, 0o600)
        self.assertNotIn(bundle['password'], output)
        self.assertNotIn(bundle['totp_uri'], output)
        self.assertNotIn(bundle['authenticator_key'], output)
        self.assertTrue(AuditEvent.objects.filter(action='superadmin.initialized').exists())

    def test_restart_does_not_create_duplicate_or_rotate_initial_credentials(self):
        user, bundle, _ = self.initialize()
        before = credential_path().read_bytes()
        call_command('bootstrap_superadmin', write_credentials=True, stdout=StringIO())
        self.assertEqual(credential_path().read_bytes(), before)
        self.assertEqual(StaffProfile.objects.filter(is_superadmin=True).count(), 1)
        user.refresh_from_db()
        self.assertTrue(user.check_password(bundle['password']))

    def test_real_login_requires_totp_first_change_removes_initial_bundle(self):
        user, bundle, _ = self.initialize()
        self.assertEqual(self.post('/api/login', {'username':user.username,'password':bundle['password'],'token':'invalid'}).status_code,401)
        device = TOTPDevice.objects.get(user=user)
        response = self.post('/api/login', {'username':user.username,'password':bundle['password'],'token':f'{totp(device.bin_key):06d}'})
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.json()['user']['is_superadmin'])
        self.assertEqual(self.client.get('/api/reports').status_code,403)
        response = self.post('/api/password', {'current_password':bundle['password'],'new_password':'My-New-Private-Password-836!'} )
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.json()['user']['must_change_password'])
        self.assertFalse(credential_path().exists())
        user.refresh_from_db()
        self.assertFalse(user.check_password(bundle['password']))
        self.assertTrue(user.password.startswith('argon2$argon2id$'))
        self.assertEqual(self.client.get('/api/ops/finance/list').status_code,403)
        call_command('bootstrap_superadmin', write_credentials=True, stdout=StringIO())
        self.assertFalse(credential_path().exists())

    def test_superadmin_cannot_be_disabled_or_created_through_employee_api(self):
        user, _, _ = self.initialize()
        owner = get_user_model().objects.create_user('ordinary_owner', password='Owner-Private-Password-731!')
        StaffProfile.objects.create(user=owner,role='owner',must_change_password=False)
        device = TOTPDevice.objects.create(user=owner,confirmed=True)
        self.client.force_login(owner,backend='django.contrib.auth.backends.ModelBackend')
        session=self.client.session;session['otp_device_id']=device.persistent_id;session.save()
        self.assertEqual(self.post(f'/api/staff/{user.pk}/disable',{}).status_code,403)
        self.assertEqual(self.post('/api/staff',{'username':'injected_root','password':'Another-Private-Password-931!','role':'owner','is_superadmin':True}).status_code,400)
        user.refresh_from_db();self.assertTrue(user.is_active)

    def test_file_collision_or_symlink_is_never_overwritten(self):
        existing=Path(self.temp.name)/'unrelated.txt';existing.write_text('keep this')
        credential_path().symlink_to(existing)
        with self.assertRaises(CommandError):call_command('bootstrap_superadmin',write_credentials=True,stdout=StringIO())
        self.assertEqual(existing.read_text(),'keep this')
        self.assertFalse(StaffProfile.objects.filter(is_superadmin=True).exists())

    def test_io_failure_rolls_back_account_and_removes_partial_bundle(self):
        with patch('backoffice.bootstrap.json.dump',side_effect=OSError('disk unavailable')):
            with self.assertRaises(CommandError):call_command('bootstrap_superadmin',write_credentials=True,stdout=StringIO())
        self.assertFalse(StaffProfile.objects.filter(is_superadmin=True).exists())
        self.assertFalse(credential_path().exists())
        self.assertEqual(TOTPDevice.objects.count(),0)

    def test_noninteractive_plaintext_output_is_refused_and_old_superusers_are_preserved(self):
        with self.assertRaises(CommandError):call_command('bootstrap_superadmin',stdout=StringIO())
        get_user_model().objects.create_superuser('existing_root',password='Existing-Private-Password-731!')
        with self.assertRaises(CommandError):call_command('bootstrap_superadmin',write_credentials=True,stdout=StringIO())
        self.assertFalse(credential_path().exists())

    def test_database_prevents_a_second_superadmin_marker(self):
        self.initialize()
        other=get_user_model().objects.create_user('second_admin')
        with self.assertRaises(IntegrityError), transaction.atomic():
            StaffProfile.objects.create(user=other,role='owner',is_superadmin=True)
