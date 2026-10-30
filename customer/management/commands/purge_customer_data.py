from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from customer.models import ServiceRecord, SmsChallenge, CustomerEvent


class Command(BaseCommand):
    help = 'Delete expired free-preview records, SMS challenges older than two days, and customer events older than 90 days.'
    def handle(self, *args, **options):
        now = timezone.now()
        reports = ServiceRecord.objects.filter(expires_at__lte=now).delete()[0]
        challenges = SmsChallenge.objects.filter(created_at__lt=now-timedelta(days=2)).delete()[0]
        events = CustomerEvent.objects.filter(at__lt=now-timedelta(days=90)).delete()[0]
        self.stdout.write(f'Expired records: {reports}; old challenges: {challenges}; old events: {events}')
