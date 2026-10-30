"""Tencent Cloud adapter. Never echo, log or provide a development bypass code."""
import json
from django.conf import settings


def available():
    return all((settings.SMS_SECRET_ID, settings.SMS_SECRET_KEY, settings.SMS_APP_ID,
                settings.SMS_SIGN_NAME, settings.SMS_TEMPLATE_ID))


def send(phone, code):
    if not available(): raise RuntimeError('SMS is not configured')
    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.sms.v20210111 import sms_client, models
    http = HttpProfile()
    http.endpoint = 'sms.tencentcloudapi.com'; http.reqTimeout = 5
    profile = ClientProfile(); profile.httpProfile = http
    client = sms_client.SmsClient(credential.Credential(settings.SMS_SECRET_ID,settings.SMS_SECRET_KEY), settings.SMS_REGION, profile)
    request = models.SendSmsRequest()
    request.from_json_string(json.dumps({'PhoneNumberSet':[phone], 'SmsSdkAppId':settings.SMS_APP_ID,
                                         'SignName':settings.SMS_SIGN_NAME,'TemplateId':settings.SMS_TEMPLATE_ID,
                                         'TemplateParamSet':[code,'5']}))
    response = client.SendSms(request)
    if not response.SendStatusSet or response.SendStatusSet[0].Code != 'Ok':
        raise RuntimeError('SMS delivery was not accepted')
