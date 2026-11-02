from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('backoffice', '0001_initial')]
    operations = [
        migrations.AddField(model_name='staffprofile', name='is_superadmin', field=models.BooleanField(default=False)),
        migrations.AddConstraint(model_name='staffprofile', constraint=models.UniqueConstraint(fields=('is_superadmin',), condition=models.Q(is_superadmin=True), name='one_superadmin_profile')),
    ]
