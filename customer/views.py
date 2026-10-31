import ipaddress
import json
import re
import secrets
import uuid
from datetime import timedelta
from functools import wraps
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.hashers import make_password
from django.db import OperationalError, transaction
from django.db.models import F, Sum
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from django.views.decorators.http import require_GET, require_POST
from . import sms
from .models import CustomerProfile, SmsChallenge, ServiceRecord, CustomerEvent, Gate

INPUT_FIELDS = {'surname','mode','purpose','gender','zone','dueDate','dueTime','birthDate','birthTime',
                'length','candidateCount','place','parents','currentName','meaning','likedChars','avoidedChars','styles','variant','elementPreference','honorParents'}


def error(message, status=400, **extra):
    return JsonResponse({'error':message, **extra}, status=status)


def body(request, allowed):
    try: value = json.loads(request.body or b'{}')
    except (ValueError, UnicodeError) as exc: raise ValueError('请求格式无效。') from exc
    if not isinstance(value, dict) or set(value) - set(allowed): raise ValueError('请求包含无效字段。')
    return value


def endpoint(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try: return view(request, *args, **kwargs)
        except ValueError: return error('信息格式不正确，请检查后重试。')
        except (OperationalError, InvalidToken): return error('服务暂时不可用，请稍后重试。',503)
    return wrapped


def profile(request):
    return CustomerProfile.objects.filter(user=request.user, user__is_active=True).first() if request.user.is_authenticated else None


def customer(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        request.customer = profile(request)
        if request.customer is None: return error('请先通过手机验证码登录。',401)
        return view(request, *args, **kwargs)
    return wrapped


def digest(namespace, value):
    return salted_hmac(namespace, value, secret=settings.PHONE_KEY, algorithm='sha256').hexdigest()


def code_digest(challenge_id, code):
    return salted_hmac('customer.sms', f'{challenge_id}:{code}', algorithm='sha256').hexdigest()


def phone_number(value):
    if not isinstance(value,str): raise ValueError('invalid phone')
    value = re.sub(r'[ -]', '', value.strip())
    if value.startswith('+86'): value = value[3:]
    if not re.fullmatch(r'1[3-9][0-9]{9}',value): raise ValueError('invalid phone')
    return '+86'+value


def ip_hash(request):
    address = request.META.get('HTTP_X_REAL_IP') if settings.TRUST_PROXY else request.META.get('REMOTE_ADDR')
    address = str(ipaddress.ip_address(address or '127.0.0.1'))
    return digest('customer.ip',address)


def take_gate(name):
    # First SQL operation acquires a write lock, including on SQLite. This
    # serializes budgets and single-use codes; no network call runs under it.
    if not Gate.objects.filter(pk=name).update(value=F('value')+1):
        raise OperationalError('customer schema not initialized')


def identity_response(request):
    current = profile(request)
    return JsonResponse({'csrf':get_token(request),'customer':{'id':str(current.pk),'phone_mask':current.phone_mask} if current else None,
                         'sms_available':bool(sms.available()),'retention_days':settings.REPORT_RETENTION_DAYS,
                         'record_limit':settings.REPORT_LIMIT,'purchases_available':False})


@require_GET
@endpoint
def session(request): return identity_response(request)


@require_POST
@endpoint
def request_code(request):
    data = body(request, ('phone',))
    try: phone = phone_number(data.get('phone'))
    except ValueError: return error('请输入有效的中国大陆手机号。')
    if not sms.available(): return error('手机号登录暂未开通，免费体验与本地下载可以继续使用。',503)
    lookup, source, timestamp = digest('customer.phone',phone), ip_hash(request), timezone.now()
    recent = timestamp-timedelta(hours=1)
    with transaction.atomic():
        take_gate('sms')
        previous = SmsChallenge.objects.filter(phone_hash=lookup).order_by('-created_at').first()
        if previous and previous.created_at > timestamp-timedelta(seconds=60):
            return error('请稍后再获取验证码。',429,retry_after=max(1,60-int((timestamp-previous.created_at).total_seconds())))
        failures = SmsChallenge.objects.filter(phone_hash=lookup,created_at__gte=timestamp-timedelta(minutes=15)).aggregate(total=Sum('failures'))['total'] or 0
        if (failures >= 10 or SmsChallenge.objects.filter(phone_hash=lookup,created_at__gte=recent).count() >= settings.SMS_PHONE_HOURLY_LIMIT
            or SmsChallenge.objects.filter(ip_hash=source,created_at__gte=recent).count() >= settings.SMS_IP_HOURLY_LIMIT
            or SmsChallenge.objects.filter(created_at__gte=timestamp.replace(hour=0,minute=0,second=0,microsecond=0)).count() >= settings.SMS_DAILY_LIMIT):
            return error('验证码请求较多，请稍后再试。',429,retry_after=900)
        challenge_id, code = uuid.uuid4(), f'{secrets.randbelow(1000000):06d}'
        SmsChallenge.objects.create(id=challenge_id,phone_hash=lookup,phone_mask=phone[3:6]+'****'+phone[-4:],
                                    ip_hash=source,code_hash=code_digest(challenge_id,code),expires_at=timestamp+timedelta(minutes=5))
    try:
        sms.send(phone,code)
    except Exception:
        # Provider failures, including uncertain delivery, must never create a
        # usable challenge, reveal a code, or silently switch to a test adapter.
        SmsChallenge.objects.filter(pk=challenge_id).update(status='failed')
        return error('验证码发送未完成，请稍后重试。',503,retry_after=60)
    with transaction.atomic():
        take_gate('sms')
        current = SmsChallenge.objects.get(pk=challenge_id)
        if SmsChallenge.objects.filter(phone_hash=lookup,created_at__gt=current.created_at).exists():
            current.status = 'superseded'; current.save(update_fields=['status'])
            return error('已有更新的验证码请求，请使用最近一次获取的验证码。',409,retry_after=60)
        SmsChallenge.objects.filter(phone_hash=lookup,status='sent').exclude(pk=challenge_id).update(status='superseded')
        SmsChallenge.objects.filter(pk=challenge_id).update(status='sent')
    return JsonResponse({'challenge_id':str(challenge_id),'retry_after':60,'expires_in':300})


@require_POST
@endpoint
def verify_code(request):
    data = body(request, ('challenge_id','code'))
    challenge_id = uuid.UUID(str(data.get('challenge_id')))
    code = data.get('code')
    if not isinstance(code,str) or not re.fullmatch(r'[0-9]{6}',code): return error('请输入六位验证码。')
    with transaction.atomic():
        take_gate('sms')
        item = SmsChallenge.objects.filter(pk=challenge_id).first()
        if not item or item.status != 'sent' or item.expires_at <= timezone.now() or item.failures >= 5:
            return error('验证码无效或已过期，请重新获取。')
        failures = SmsChallenge.objects.filter(phone_hash=item.phone_hash,created_at__gte=timezone.now()-timedelta(minutes=15)).aggregate(total=Sum('failures'))['total'] or 0
        if failures >= 10: return error('尝试次数过多，请稍后再试。',429)
        if not constant_time_compare(item.code_hash,code_digest(item.pk,code)):
            item.failures += 1
            if item.failures >= 5: item.status = 'locked'
            item.save(update_fields=['failures','status'])
            return error('验证码无效或已过期，请重新获取。')
        item.status = 'consumed'; item.save(update_fields=['status'])
        user, _ = get_user_model().objects.get_or_create(username='c_'+item.phone_hash, defaults={'password':make_password(None)})
        if not user.is_active: return error('此账号暂不可用。',403)
        current, _ = CustomerProfile.objects.get_or_create(user=user, defaults={'phone_hash':item.phone_hash,'phone_mask':item.phone_mask})
        CustomerEvent.objects.create(customer=current,action='login.success')
    login(request,user,backend='django.contrib.auth.backends.ModelBackend')
    return identity_response(request)


@require_POST
@endpoint
def sign_out(request):
    body(request, ())
    current = profile(request)
    if current: CustomerEvent.objects.create(customer=current,action='logout')
    logout(request)
    return JsonResponse({'ok':True})


def record_dto(record):
    return {'id':str(record.pk),'kind':'free_preview','status':'ready','candidate_count':record.candidate_count,
            'created_at':record.created_at,'expires_at':record.expires_at}


@require_GET
@endpoint
@customer
def records(request):
    rows = ServiceRecord.objects.filter(customer=request.customer,expires_at__gt=timezone.now()).order_by('-created_at')[:settings.REPORT_LIMIT]
    return JsonResponse({'records':[record_dto(row) for row in rows]})


@require_POST
@endpoint
@customer
def save_record(request):
    data = body(request, ('request_key','consent','input'))
    if data.get('consent') is not True: return error('请先确认将本次出生信息与方案保存到账号。')
    key = uuid.UUID(str(data.get('request_key')))
    payload = data.get('input')
    if not isinstance(payload,dict) or set(payload)-INPUT_FIELDS: return error('本次方案信息不完整或包含无效字段。')
    payload_hash = digest('customer.report-input',json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(',',':')))
    with transaction.atomic():
        take_gate('reports')
        existing = ServiceRecord.objects.filter(customer=request.customer,request_key=key).first()
        if existing:
            if existing.input_hash != payload_hash: return error('本次保存编号已对应另一份方案，请重新确认。',409)
            if existing.expires_at <= timezone.now(): return error('原保存记录已过期，请重新确认保存。',410)
            return JsonResponse({'record':record_dto(existing),'reused':True})
        if CustomerEvent.objects.filter(customer=request.customer,request_key=key).exists():
            return error('这次保存的记录已删除或过期，请重新确认后保存。',410)
        if ServiceRecord.objects.filter(customer=request.customer,expires_at__gt=timezone.now()).count() >= settings.REPORT_LIMIT:
            return error('已达到免费记录数量上限，请先删除不再需要的方案。',409)
        if CustomerEvent.objects.filter(customer=request.customer,action='report.saved',at__gte=timezone.now()-timedelta(days=1)).count() >= 10:
            return error('今天保存较多，请稍后再试。',429)
        # Recompute on the server; client-supplied candidates, prices and payment
        # flags are never accepted as evidence of either a report or a purchase.
        from server import analyze
        try: report = analyze(payload)
        except ValueError: return error('本次出生信息或命名偏好未通过校验，请修改后重试。')
        if not report['candidates']: return error('当前条件没有匹配候选，请调整后再保存。')
        envelope = {'version':1,'kind':'free_preview','data':payload,**report}
        encrypted = Fernet(settings.REPORT_KEY.encode()).encrypt(json.dumps(envelope,ensure_ascii=False).encode())
        record = ServiceRecord.objects.create(customer=request.customer,request_key=key,input_hash=payload_hash,
                    encrypted_report=encrypted,candidate_count=len(report['candidates']),expires_at=timezone.now()+timedelta(days=settings.REPORT_RETENTION_DAYS))
        CustomerEvent.objects.create(customer=request.customer,action='report.saved',record_id=record.pk,request_key=key)
    return JsonResponse({'record':record_dto(record),'reused':False},status=201)


@require_GET
@endpoint
@customer
def report(request, record_id):
    row = ServiceRecord.objects.filter(pk=record_id,customer=request.customer,expires_at__gt=timezone.now()).first()
    if not row: return error('记录不存在或已过期。',404)
    result = json.loads(Fernet(settings.REPORT_KEY.encode()).decrypt(bytes(row.encrypted_report)))
    CustomerEvent.objects.create(customer=request.customer,action='report.retrieved',record_id=row.pk)
    return JsonResponse({'report':result})


@require_POST
@endpoint
@customer
def delete_record(request, record_id):
    body(request, ())
    with transaction.atomic():
        row = ServiceRecord.objects.filter(pk=record_id,customer=request.customer).first()
        if not row: return error('记录不存在或已删除。',404)
        row.delete()
        CustomerEvent.objects.create(customer=request.customer,action='report.deleted',record_id=record_id)
    return JsonResponse({'ok':True})


def csrf_failure(request,reason=''): return error('页面验证已失效，请刷新后重试。',403)
