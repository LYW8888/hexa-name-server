from django.urls import path
from . import views
urlpatterns = [
    path('api/customer/session',views.session), path('api/customer/request-code',views.request_code),
    path('api/customer/verify-code',views.verify_code), path('api/customer/logout',views.sign_out),
    path('api/customer/records',views.records), path('api/customer/records/save',views.save_record),
    path('api/customer/records/<uuid:record_id>',views.report),
    path('api/customer/records/<uuid:record_id>/delete',views.delete_record),
]
