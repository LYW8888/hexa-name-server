import json
import re
from functools import wraps
from pathlib import Path
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash, password_validation
from django.contrib.auth.signals import user_login_failed
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import FileResponse, JsonResponse, HttpResponseNotAllowed, Http404
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET, require_POST
from django_otp import login as otp_login, verify_token
from django_otp.plugins.otp_totp.models import TOTPDevice
from . import gateway
from .models import AuditEvent, StaffProfile
from .provision import create_staff
from operations.worker import ACTIONS


def error(text, status=400):
    return JsonResponse({'error': text}, status=status)


def body(request, allowed):
    if len(request.body) > 65536:
        raise ValueError('请求过大。')
    try:
        value = json.loads(request.body or b'{}')
    except (ValueError, UnicodeError) as exc:
        raise ValueError('请求格式无效。') from exc
    if not isinstance(value, dict) or set(value) - set(allowed):
        raise ValueError('请求包含无效字段。')
    return value


def event(user, action, subject=''):
    AuditEvent.objects.create(actor=user if user and user.is_authenticated else None, action=action, subject=str(subject)[:80])


def staff(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        user = request.user
        if not user.is_authenticated or not user.is_active or not user.is_verified():
            return error('请使用密码与动态验证码登录。', 401)
        profile = StaffProfile.objects.filter(user=user).first()
        if not profile:
            return error('此账号未分配后台岗位。', 403)
        request.staff_profile = profile
        if profile.must_change_password and view.__name__ != 'change_password':
            return error('首次登录请先修改初始密码。', 403)
        try:
            return view(request, *args, **kwargs)
        except ValueError as exc:
            return error(str(exc))
        except gateway.WorkerRejected as exc:
            return error(str(exc), 409)
        except gateway.WorkerUnavailable as exc:
            return error(str(exc), 503)
    return wrapped


def own_role(request, role):
    if request.staff_profile.role != role:
        event(request.user, 'access.denied', role)
        return False
    return True


def session_response(request):
    user = request.user
    profile = StaffProfile.objects.filter(user=user).first() if user.is_authenticated and user.is_active and getattr(user, 'otp_device', None) else None
    return JsonResponse({'csrf': get_token(request), 'user': {'id': user.pk, 'username': user.username,
                         'role': profile.role, 'must_change_password': profile.must_change_password} if profile else None})


@require_GET
def session(request):
    return session_response(request)


@require_POST
def sign_in(request):
    try:
        data = body(request, ('username', 'password', 'token'))
    except ValueError as exc:
        return error(str(exc))
    username, password, token = data.get('username'), data.get('password'), data.get('token')
    if not isinstance(username, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{3,64}', username) or not isinstance(password, str) or len(password) > 256:
        return error('账号、密码或验证码无效；多次失败后请稍后再试。', 401)
    user = authenticate(request=request, username=username, password=password)
    registered = TOTPDevice.objects.filter(user=user, confirmed=True).first() if user else None
    device = verify_token(user, registered.persistent_id, token) if registered and isinstance(token, str) and re.fullmatch(r'[0-9]{6}', token) else None
    if not user or not device or not StaffProfile.objects.filter(user=user).exists():
        if user:
            user_login_failed.send(sender=__name__, credentials={'username': username}, request=request)
        event(None, 'login.failed')
        return error('账号、密码或验证码无效；多次失败后请稍后再试。', 401)
    login(request, user)
    otp_login(request, device)
    event(user, 'login.success')
    return session_response(request)


@require_POST
def sign_out(request):
    event(request.user, 'logout')
    logout(request)
    return JsonResponse({'ok': True})


@require_POST
@staff
def change_password(request):
    data = body(request, ('current_password', 'new_password'))
    current, new = data.get('current_password'), data.get('new_password')
    if not isinstance(current, str) or not isinstance(new, str) or len(new) > 256 or not request.user.check_password(current):
        return error('当前密码错误或新密码无效。')
    try:
        password_validation.validate_password(new, user=request.user)
    except ValidationError:
        return error('新密码至少 12 位，避免常见密码、纯数字及与账号相似的内容。')
    if current == new:
        return error('新密码应与当前密码不同。')
    with transaction.atomic():
        request.user.set_password(new)
        request.user.save(update_fields=['password'])
        request.staff_profile.must_change_password = False
        request.staff_profile.save(update_fields=['must_change_password'])
        event(request.user, 'password.changed')
    update_session_auth_hash(request, request.user)
    return session_response(request)


@require_GET
@staff
def overview(request):
    roles = ('support', 'finance', 'delivery') if request.staff_profile.role == 'owner' else (request.staff_profile.role,)
    result = {}
    for role in roles:
        try:
            result[role] = {'connected': True, 'data': gateway.call(role, 'summary', {}, request.user.pk)}
        except (gateway.WorkerUnavailable, gateway.WorkerRejected):
            result[role] = {'connected': False, 'error': '岗位服务未连接或暂不可用。'}
    event(request.user, 'overview.read')
    return JsonResponse({'summary': result})


@require_GET
@staff
def service_status(request, service_id):
    if not own_role(request, 'support'):
        return error('只有客服可使用工单服务状态查询。', 403)
    from operations.console import identifier
    identifier(service_id)
    result = gateway.call('delivery', 'status', {'id': service_id}, request.user.pk)
    event(request.user, 'support.service_status.read', service_id)
    return JsonResponse({'service': result})


@staff
def operation(request, role, action):
    if role not in ACTIONS or not own_role(request, role):
        return error('无权访问该岗位数据或执行该操作。', 403)
    reads = {'summary', 'list', 'audit'}
    if action not in reads | set(ACTIONS[role]):
        return error('操作不存在。', 404)
    expected = 'GET' if action in reads else 'POST'
    if request.method != expected:
        return HttpResponseNotAllowed([expected])
    args = {} if action in reads else body(request, ACTIONS[role][action])
    result = gateway.call(role, action, args, request.user.pk)
    event(request.user, f'{role}.{action}', args.get('id', ''))
    return JsonResponse({'result': result})


@staff
def users(request):
    if not own_role(request, 'owner'):
        return error('只有经营者可管理员工账号。', 403)
    if request.method == 'GET':
        rows = list(StaffProfile.objects.select_related('user').order_by('user_id'))
        event(request.user, 'staff.list')
        return JsonResponse({'users': [{'id': p.user_id, 'username': p.user.username, 'role': p.role,
                              'active': p.user.is_active, 'must_change_password': p.must_change_password} for p in rows]})
    if request.method != 'POST': return HttpResponseNotAllowed(['GET', 'POST'])
    data = body(request, ('username', 'password', 'role'))
    if not isinstance(data.get('password'), str) or len(data['password']) > 256:
        return error('请填写有效的初始密码。')
    try:
        with transaction.atomic():
            user, device = create_staff(data.get('username'), data['password'], data.get('role'))
            event(request.user, 'staff.created', user.pk)
    except (ValidationError, IntegrityError):
        return error('账号已存在或密码强度不足。')
    return JsonResponse({'id': user.pk, 'username': user.username, 'provisioning_uri': device.config_url,
                         'note': '验证器地址仅显示本次，请通过可信渠道交给该员工，勿留在共享截图或聊天记录中。'}, status=201)


@require_POST
@staff
def disable_user(request, user_id):
    if not own_role(request, 'owner'): return error('只有经营者可停用员工账号。', 403)
    body(request, ())
    if user_id == request.user.pk: return error('不能停用自己的当前账号。')
    with transaction.atomic():
        user = get_user_model().objects.filter(pk=user_id, staff_profile__isnull=False).first()
        if not user: return error('账号不存在。', 404)
        if user.staff_profile.role == 'owner' and StaffProfile.objects.filter(role='owner', user__is_active=True).count() <= 1:
            return error('必须保留一个可用经营者账号。')
        user.is_active = False
        user.save(update_fields=['is_active'])
        event(request.user, 'staff.disabled', user_id)
    return JsonResponse({'ok': True})


@require_GET
@staff
def audit(request):
    if not own_role(request, 'owner'): return error('只有经营者可查看账号与授权审计。', 403)
    event(request.user, 'audit.read')
    return JsonResponse({'events': list(AuditEvent.objects.order_by('-id').values('id', 'at', 'actor_id', 'action', 'subject')[:200])})


def csrf_failure(request, reason=''):
    return error('页面验证已失效，请刷新页面后重试。', 403)


def locked_out(request, credentials=None, **kwargs):
    return error('尝试次数过多，请 15 分钟后再试或联系管理员。', 429)


@require_GET
def shell(request):
    path = settings.BASE_DIR / 'frontend' / 'dist' / 'admin.html'
    if not path.is_file(): return error('后台页面尚未构建，请先执行前端构建。', 503)
    return FileResponse(path.open('rb'), content_type='text/html; charset=utf-8')


@require_GET
def asset(request, name):
    if not re.fullmatch(r'[A-Za-z0-9_-]+\.(?:js|css|svg|png|woff2?)', name): raise Http404
    root = (settings.BASE_DIR / 'frontend' / 'dist' / 'assets').resolve()
    if root.parent != (settings.BASE_DIR / 'frontend' / 'dist').resolve(): raise Http404
    path = (root / name).resolve()
    if path.parent != root or not path.is_file(): raise Http404
    import mimetypes
    return FileResponse(path.open('rb'), content_type=mimetypes.guess_type(name)[0] or 'application/octet-stream')
