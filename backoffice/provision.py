import re
from django.contrib.auth import get_user_model, password_validation
from django.db import transaction
from django_otp.plugins.otp_totp.models import TOTPDevice
from .models import StaffProfile, ROLES


def create_staff(username, password, role):
    if not isinstance(username, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{3,64}', username) or role not in ROLES:
        raise ValueError('账号须为 3–64 位字母、数字或 ._-，并选择有效岗位。')
    user = get_user_model()(username=username)
    password_validation.validate_password(password, user=user)
    with transaction.atomic():
        user.set_password(password)
        user.save()
        StaffProfile.objects.create(user=user, role=role)
        device = TOTPDevice.objects.create(user=user, name='工作验证器', confirmed=True)
    return user, device
