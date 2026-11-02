"""One-time privileged account initialization; never a web signup path."""
import json
import os
from pathlib import Path
import secrets
import stat
from urllib.parse import parse_qs, urlparse
from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice
from .models import StaffProfile, AuditEvent

CREDENTIAL_NAME = 'initial-superadmin.json'


def credential_path():
    return Path(settings.HOME_DIR) / CREDENTIAL_NAME


def private_parent():
    parent = Path(settings.HOME_DIR)
    info = parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise PermissionError('管理目录必须由管理服务账号独占，权限为0700。')


def remove_initial_credentials(user):
    """Remove only the known initial bundle after that account changes credentials."""
    target = credential_path()
    try:
        private_parent()
        info = target.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
            return False
        data = json.loads(target.read_text(encoding='utf-8'))
        if data.get('username') != user.username:
            return False
        target.unlink()
        return True
    except (FileNotFoundError, PermissionError, OSError, ValueError):
        return False


def initialize(write_credentials=False):
    if StaffProfile.objects.filter(is_superadmin=True).exists():
        return None
    if get_user_model().objects.filter(is_superuser=True).exists():
        raise ValueError('已有超级用户，请先核对现有账号，初始化不会替换已有管理员。')
    target = credential_path()
    descriptor = None
    created_file = False
    if write_credentials:
        private_parent()
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        created_file = True
    try:
        with transaction.atomic():
            username = 'sa_' + secrets.token_hex(8)
            password = secrets.token_urlsafe(32)
            user = get_user_model()(username=username, is_staff=True, is_superuser=True)
            password_validation.validate_password(password, user=user)
            user.password = make_password(password, hasher='argon2')
            user.save()
            StaffProfile.objects.create(user=user, role='owner', is_superadmin=True, must_change_password=True)
            device = TOTPDevice.objects.create(user=user, name='超级管理员验证器', confirmed=True)
            AuditEvent.objects.create(action='superadmin.initialized', subject=str(user.pk))
            bundle = {'username':username, 'password':password, 'totp_uri':device.config_url,
                      'authenticator_key':parse_qs(urlparse(device.config_url).query)['secret'][0],
                      'authenticator_type':'TOTP · 6位 · 30秒',
                      'created_at':timezone.now().isoformat(), 'note':'首次登录必须修改密码；改密后服务会清除此初始化文件。请勿上传Git或发送到共享聊天。'}
            if descriptor is not None:
                with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
                    descriptor = None
                    json.dump(bundle, stream, ensure_ascii=False, indent=2)
                    stream.flush()
                    os.fsync(stream.fileno())
        return bundle
    except BaseException:
        if descriptor is not None:
            os.close(descriptor)
        if created_file:
            target.unlink(missing_ok=True)
        raise
