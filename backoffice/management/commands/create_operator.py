from getpass import getpass
from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from backoffice.models import ROLES
from backoffice.provision import create_staff


class Command(BaseCommand):
    help = 'Create a staff account and print TOTP setup once in a trusted terminal; no default accounts.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--role', choices=ROLES, required=True)

    def handle(self, *args, **options):
        password = getpass('初始密码（至少 12 位）：')
        if password != getpass('再次输入：'):
            raise CommandError('两次密码不一致。')
        try:
            _, device = create_staff(options['username'], password, options['role'])
        except (ValueError, ValidationError, IntegrityError) as exc:
            raise CommandError('创建失败：请检查账号是否重复、密码强度及岗位。') from exc
        self.stdout.write('在可信终端中将以下地址导入验证器，妥善交给该员工；首次登录必须修改初始密码。')
        self.stdout.write(device.config_url)
