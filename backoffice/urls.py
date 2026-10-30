from django.urls import path
from . import views

urlpatterns = [
    path('', views.shell), path('assets/<str:name>', views.asset),
    path('api/session', views.session), path('api/login', views.sign_in), path('api/logout', views.sign_out),
    path('api/password', views.change_password), path('api/overview', views.overview),
    path('api/ops/<str:role>/<str:action>', views.operation),
    path('api/service-status/<str:service_id>', views.service_status),
    path('api/staff', views.users), path('api/staff/<int:user_id>/disable', views.disable_user),
    path('api/audit', views.audit),
]
