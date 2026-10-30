from getpass import getpass
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django_otp.plugins.otp_totp.models import TOTPDevice
from backoffice.models import AuditEvent


class Command(BaseCommand):
    help = 'Trusted-terminal password and TOTP recovery; invalidates existing sessions.'
    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--reactivate', action='store_true', help='Explicitly reactivate a disabled account')
    def handle(self, *args, **options):
        user = get_user_model().objects.filter(username=options['username'], staff_profile__isnull=False).first()
        if not user: raise CommandError('账号不存在。')
        password=getpass('新的初始密码：')
        if password != getpass('再次输入：'): raise CommandError('两次密码不一致。')
        try:
            password_validation.validate_password(password, user=user)
        except ValidationError as exc:
            raise CommandError('密码强度不足。') from exc
        with transaction.atomic():
            user.set_password(password)
            if options['reactivate']: user.is_active=True
            user.save()
            profile=user.staff_profile; profile.must_change_password=True; profile.save()
            TOTPDevice.objects.filter(user=user).delete()
            device=TOTPDevice.objects.create(user=user, name='工作验证器', confirmed=True)
            AuditEvent.objects.create(action='staff.recovered_via_cli', subject=str(user.pk))
        self.stdout.write('仅在可信终端中交付以下新验证器地址，首次登录需更改初始密码：')
        self.stdout.write(device.config_url)
