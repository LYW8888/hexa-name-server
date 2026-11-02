from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, OperationalError
from backoffice.bootstrap import credential_path, initialize
from backoffice.models import StaffProfile


class Command(BaseCommand):
    help = 'Initialize one random superadmin; never overwrite credentials on restart.'

    def add_arguments(self, parser):
        parser.add_argument('--write-credentials', action='store_true', help='Write a private 0600 bundle in the configured admin home; never log secrets')

    def handle(self, *args, **options):
        if StaffProfile.objects.filter(is_superadmin=True).exists():
            self.stdout.write('超级管理员已初始化，未重置账号、密码或验证器。')
            return
        if not options['write_credentials'] and not self.stdout.isatty():
            raise CommandError('非交互环境请使用 --write-credentials，将初始凭据写入管理目录；不会输出到日志。')
        try:
            bundle = initialize(write_credentials=options['write_credentials'])
        except (ValueError, PermissionError, OSError, IntegrityError, OperationalError) as exc:
            raise CommandError('初始化未完成：请检查私有目录、已有凭据文件和数据库状态；不会覆盖现有凭据。') from exc
        if not bundle:
            self.stdout.write('超级管理员已初始化，未修改凭据。')
        elif options['write_credentials']:
            self.stdout.write(f'超级管理员已创建。请在可信终端读取初始凭据文件：{credential_path()}；该文件不会由网站公开。')
        else:
            self.stdout.write(f"账号：{bundle['username']}\n初始密码：{bundle['password']}\n验证器设置：{bundle['totp_uri']}\n首次登录后请修改密码。")
