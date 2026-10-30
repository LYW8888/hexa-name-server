"""Test only; independent ephemeral database and non-production keys."""
import os
import tempfile
from cryptography.fernet import Fernet
_TEST_HOME = tempfile.TemporaryDirectory(prefix='xuming-customer-test-')
os.environ.update(XUMING_CUSTOMER_HOME=_TEST_HOME.name, XUMING_CUSTOMER_SECRET='test-signing-'+'x'*64,
                  XUMING_CUSTOMER_PHONE_KEY='test-lookup-'+'y'*64, XUMING_CUSTOMER_REPORT_KEY=Fernet.generate_key().decode(),
                  XUMING_CUSTOMER_DEV='1')
from .settings import *  # noqa
ALLOWED_HOSTS = ['testserver','localhost','127.0.0.1']
# A developer may have live provider credentials in the shell. Tests must not
# inherit them or send messages; provider-specific tests use explicit mocks.
SMS_SECRET_ID = SMS_SECRET_KEY = SMS_APP_ID = SMS_SIGN_NAME = SMS_TEMPLATE_ID = ''
TRUST_PROXY = False
SECURE_PROXY_SSL_HEADER = None
