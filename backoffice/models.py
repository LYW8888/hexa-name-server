from django.conf import settings
from django.db import models

ROLES = ('owner', 'support', 'finance', 'delivery')


class StaffProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_profile')
    role = models.CharField(max_length=16, choices=[(r, r) for r in ROLES])
    must_change_password = models.BooleanField(default=True)


class AuditEvent(models.Model):
    at = models.DateTimeField(auto_now_add=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=64)
    subject = models.CharField(max_length=80, blank=True)
