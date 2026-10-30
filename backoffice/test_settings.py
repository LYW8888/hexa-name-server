"""Explicit test-only configuration; never use to serve production traffic."""
import os
import tempfile

os.environ['XUMING_ADMIN_SECRET'] = 'test-only-' + 'x' * 64
_TEST_HOME = tempfile.TemporaryDirectory(prefix='xuming-admin-tests-')
os.environ['XUMING_ADMIN_HOME'] = _TEST_HOME.name
os.environ['XUMING_ADMIN_DEV'] = '1'
from .settings import *  # noqa
ALLOWED_HOSTS = ['testserver', 'localhost', '127.0.0.1']
PASSWORD_HASHERS = ['django.contrib.auth.hashers.PBKDF2PasswordHasher']
