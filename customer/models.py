import uuid
from django.conf import settings
from django.db import models


class CustomerProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='customer_profile')
    phone_hash = models.CharField(max_length=64, unique=True)
    phone_mask = models.CharField(max_length=20)


class Gate(models.Model):
    name = models.CharField(max_length=16, primary_key=True)
    value = models.PositiveBigIntegerField(default=0)


class SmsChallenge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_hash = models.CharField(max_length=64, db_index=True)
    phone_mask = models.CharField(max_length=20)
    ip_hash = models.CharField(max_length=64, db_index=True)
    code_hash = models.CharField(max_length=64)
    status = models.CharField(max_length=12, default='sending')
    failures = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()


class ServiceRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE)
    request_key = models.UUIDField()
    input_hash = models.CharField(max_length=64)
    encrypted_report = models.BinaryField()
    candidate_count = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['customer','request_key'], name='customer_request_unique')]


class CustomerEvent(models.Model):
    at = models.DateTimeField(auto_now_add=True)
    customer = models.ForeignKey(CustomerProfile, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=32)
    record_id = models.UUIDField(null=True)
    request_key = models.UUIDField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['customer','request_key'], condition=models.Q(request_key__isnull=False), name='customer_saved_request_event_unique')]
