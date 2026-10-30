"""Dedicated private backoffice; never load these routes into the naming server."""
import os
import stat
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ['XUMING_ADMIN_SECRET']
if len(SECRET_KEY) < 50:
    raise ValueError('XUMING_ADMIN_SECRET must contain at least 50 random characters')
DEBUG = False
DATA_UPLOAD_MAX_MEMORY_SIZE = 65536
DEV = os.environ.get('XUMING_ADMIN_DEV') == '1'
ALLOWED_HOSTS = [v.strip() for v in os.environ.get('XUMING_ADMIN_HOSTS', 'localhost,127.0.0.1').split(',') if v.strip()]
HOME_DIR = Path(os.environ.get('XUMING_ADMIN_HOME', '/var/lib/xuming-admin'))
info = HOME_DIR.lstat()
if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
    raise PermissionError('admin home must be a private 0700 directory owned by the admin service account')
os.umask(0o077)
auth_file = HOME_DIR / 'auth.sqlite3'
if auth_file.exists() or auth_file.is_symlink():
    db_info = auth_file.lstat()
    if not stat.S_ISREG(db_info.st_mode) or db_info.st_uid != os.geteuid() or stat.S_IMODE(db_info.st_mode) & 0o077:
        raise PermissionError('admin database must be a private regular file owned by the admin service account')
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': HOME_DIR / 'auth.sqlite3', 'OPTIONS': {'timeout': 10}}}
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions',
                  'django_otp', 'django_otp.plugins.otp_totp', 'axes', 'backoffice']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'backoffice.middleware.SecurityHeaders',
              'django.middleware.clickjacking.XFrameOptionsMiddleware',
              'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware',
              'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware',
              'django_otp.middleware.OTPMiddleware', 'axes.middleware.AxesMiddleware']
AUTHENTICATION_BACKENDS = ['axes.backends.AxesStandaloneBackend', 'django.contrib.auth.backends.ModelBackend']
ROOT_URLCONF = 'backoffice.urls'
WSGI_APPLICATION = 'backoffice.wsgi.application'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
USE_TZ = True
LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'UTC'
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
SESSION_COOKIE_NAME = '__Host-xuming_admin' if not DEV else 'xuming_admin_dev'
SESSION_COOKIE_SECURE = not DEV
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Strict'
SESSION_COOKIE_AGE = 1800
SESSION_SAVE_EVERY_REQUEST = False  # Absolute 30-minute lifetime, not extended by polling.
CSRF_COOKIE_NAME = '__Host-xuming_csrf' if not DEV else 'xuming_csrf_dev'
CSRF_COOKIE_SECURE = not DEV
CSRF_COOKIE_SAMESITE = 'Strict'
CSRF_FAILURE_VIEW = 'backoffice.views.csrf_failure'
SECURE_SSL_REDIRECT = not DEV
# Only enable when a trusted reverse proxy overwrites this header and the app is loopback-only.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if os.environ.get('XUMING_ADMIN_TRUST_PROXY') == '1' else None
SECURE_HSTS_SECONDS = 31536000 if not DEV else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(minutes=15)
AXES_LOCKOUT_PARAMETERS = ['username']
# Lock an account across all addresses. IP throttling belongs at the trusted
# edge; using the loopback proxy address here would lock every employee at once.
SILENCED_SYSTEM_CHECKS = ['axes.W006']
OTP_TOTP_ISSUER = '序名经营工作台'
AXES_RESET_ON_SUCCESS = True
AXES_LOCKOUT_CALLABLE = 'backoffice.views.locked_out'
AXES_SENSITIVE_PARAMETERS = ['username', 'password', 'token']
AXES_VERBOSE = False
LOGGING = {'version': 1, 'disable_existing_loggers': False,
           'handlers': {'null': {'class': 'logging.NullHandler'}},
           'loggers': {'axes': {'handlers': ['null'], 'propagate': False}}}
WORKER_SOCKETS = {role: os.environ.get(f'XUMING_{role.upper()}_SOCKET', f'/run/xuming-{role}/worker.sock')
                  for role in ('support', 'finance', 'delivery')}
