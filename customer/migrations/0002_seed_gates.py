from django.db import migrations


def seed(apps, schema_editor):
    gate = apps.get_model('customer','Gate')
    for name in ('sms','reports'):
        gate.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [('customer','0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
