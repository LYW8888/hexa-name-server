"""Customer identity service: independent secrets, sessions and database."""
import os
import stat
from pathlib import Path
from cryptography.fernet import Fernet

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ['XUMING_CUSTOMER_SECRET']
PHONE_KEY = os.environ['XUMING_CUSTOMER_PHONE_KEY']
REPORT_KEY = os.environ['XUMING_CUSTOMER_REPORT_KEY']
if len(SECRET_KEY) < 50 or len(PHONE_KEY) < 50 or SECRET_KEY == PHONE_KEY:
    raise ValueError('customer signing and phone lookup keys must be distinct random values of at least 50 characters')
Fernet(REPORT_KEY.encode())
DEV = os.environ.get('XUMING_CUSTOMER_DEV') == '1'
if not DEV and (os.getuid() == 0 or os.geteuid() == 0):
    raise PermissionError('run the customer service as its dedicated non-root account')
DEBUG = False
ALLOWED_HOSTS = [value.strip() for value in os.environ.get('XUMING_CUSTOMER_HOSTS', 'localhost,127.0.0.1').split(',') if value.strip()]
HOME_DIR = Path(os.environ.get('XUMING_CUSTOMER_HOME', '/var/lib/xuming-customer'))
info = HOME_DIR.lstat()
if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
    raise PermissionError('customer home must be a private 0700 directory owned by its service account')
os.umask(0o077)
path = HOME_DIR / 'customer.sqlite3'
if path.exists() or path.is_symlink():
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077 or info.st_nlink != 1:
        raise PermissionError('customer database must be private and owned by its service account')
DATABASES = {'default': {'ENGINE':'django.db.backends.sqlite3','NAME':path,'OPTIONS':{'timeout':10}}}
INSTALLED_APPS = ['django.contrib.auth','django.contrib.contenttypes','django.contrib.sessions','customer']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware','customer.middleware.SecurityHeaders',
              'django.middleware.clickjacking.XFrameOptionsMiddleware','django.contrib.sessions.middleware.SessionMiddleware',
              'django.middleware.common.CommonMiddleware','django.middleware.csrf.CsrfViewMiddleware',
              'django.contrib.auth.middleware.AuthenticationMiddleware']
AUTHENTICATION_BACKENDS = ['django.contrib.auth.backends.ModelBackend']
ROOT_URLCONF = 'customer.urls'
WSGI_APPLICATION = 'customer.wsgi.application'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
USE_TZ = True
TIME_ZONE = 'UTC'
LANGUAGE_CODE = 'zh-hans'
DATA_UPLOAD_MAX_MEMORY_SIZE = 65536
SESSION_COOKIE_NAME = '__Secure-xuming_customer' if not DEV else 'xuming_customer_dev'
SESSION_COOKIE_PATH = '/api/customer/'
SESSION_COOKIE_DOMAIN = None
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEV
SESSION_COOKIE_SAMESITE = 'Strict'
SESSION_COOKIE_AGE = 7 * 86400
SESSION_SAVE_EVERY_REQUEST = False
CSRF_COOKIE_NAME = '__Secure-xuming_customer_csrf' if not DEV else 'xuming_customer_csrf_dev'
CSRF_COOKIE_PATH = '/api/customer/'
CSRF_COOKIE_DOMAIN = None
CSRF_COOKIE_SECURE = not DEV
CSRF_COOKIE_SAMESITE = 'Strict'
CSRF_FAILURE_VIEW = 'customer.views.csrf_failure'
SECURE_SSL_REDIRECT = not DEV
TRUST_PROXY = os.environ.get('XUMING_CUSTOMER_TRUST_PROXY') == '1'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO','https') if TRUST_PROXY else None
SECURE_HSTS_SECONDS = 31536000 if not DEV else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SMS_SECRET_ID = os.environ.get('XUMING_SMS_SECRET_ID','')
SMS_SECRET_KEY = os.environ.get('XUMING_SMS_SECRET_KEY','')
SMS_APP_ID = os.environ.get('XUMING_SMS_APP_ID','')
SMS_SIGN_NAME = os.environ.get('XUMING_SMS_SIGN_NAME','')
SMS_TEMPLATE_ID = os.environ.get('XUMING_SMS_TEMPLATE_ID','')
SMS_REGION = os.environ.get('XUMING_SMS_REGION','ap-guangzhou')
SMS_DAILY_LIMIT = 100  # Hard default cost cap; review before scaling.
SMS_IP_HOURLY_LIMIT = 10
SMS_PHONE_HOURLY_LIMIT = 5
REPORT_RETENTION_DAYS = 30
REPORT_LIMIT = 20
