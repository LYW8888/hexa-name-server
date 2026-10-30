# 客户手机号登录与体验记录

客户免费探索、浏览器收藏、本地报告下载和心愿卡继续免登录。新增“我的服务”入口，用于验证码登录后**主动保存免费体验方案**和找回记录。首次验证手机号后建立客户账号，不设置客户密码。当前没有付费订单、收款、客户与后台工单关联或真实支付回调；免费记录不会成为已购买服务。

## 隔离与数据范围

客户服务使用独立 Django 配置、秘密、系统账户及数据库，不加载员工后台的岗位、动态码或授权表，也不连接客服、财务及交付数据库。生产由 `xuming-customer` 运行，仅监听 `127.0.0.1:4181`，客户域名将 `/api/customer/` 代理至该服务，其他请求仍由起名站点处理。员工后台保留独立域名与进程。

- 客户 Cookie 与员工 Cookie 使用不同名称和秘密，主机范围限定，客户 Cookie 的路径限制为 `/api/customer/`。正常浏览器不会把客户会话发送给首页或起名分析接口。生产默认 Secure、HttpOnly、SameSite=Strict，会话绝对有效期 7 天；写操作校验 CSRF，不注册私有离线缓存。
- 验证码只保存与随机挑战 UUID 绑定的 HMAC 摘要，五分钟失效，最多错误 5 次，只可使用一次；同一手机号 15 分钟内累计 10 次错误后暂时限制。新验证码成功受理后使旧验证码失效。供应商出错时不会启用测试码或控制台登录。
- 手机原号仅在用户请求与短信发送时使用，数据库保存带密钥的手机号检索摘要和脱敏显示号码；不存储完整号码。摘要和脱敏号码仍需作为客户数据保护。客户不能查询或下载他人的记录，员工会话也不能用于客户认证。
- 只有明确勾选保存后，才把本次输入、四柱和候选写入账号。报告由服务端重新计算，拒绝客户端提供的候选、收费状态或付款标记。报告正文通过 Fernet 加密后保存，密钥不在数据库中。此措施保护数据库副本，不能防御已被控制的客户服务进程或主机管理员。
- 每个客户最多保留 20 份有效免费体验记录，24 小时最多保存 10 次；同一次保存请求使用相同 UUID 去重，不能用相同编号覆盖其他输入。匿名体验和本地收藏不自动上传，也不随登录同步。
- 保存请求编号随事件记录保留 90 天，用于拒绝删除后迟到的重复提交；用户主动重新保存须使用新编号并再次确认，不恢复原记录。
- 免费体验记录可在线找回 30 天，到期立即禁止查询；用户可提前删除账号中的记录。已下载的文件、浏览器收藏与服务端删除相互独立。清理命令删除活动数据库中过期记录、超过 2 天的短信挑战和超过 90 天的客户事件；应部署每日任务。备份中的副本须按运营方制定的保留、删除及恢复策略处理，当前没有自动备份功能。

## 短信配置

使用腾讯云官方 SDK，固定调用 `sms.tencentcloudapi.com`，不接受浏览器传入短信文本、模板、签名或供应商地址。只发送登录验证码。默认限制：每个手机号 60 秒一次、每小时 5 次；每个来源 IP 每小时 10 次；应用全局每个 UTC 自然日最多受理 100 次请求。失败受理也计入预算；这些是应用请求限制，不替代供应商计费及防刷配额。上线需结合实际流量、供应商配额与边缘限速评估，并补齐运营主体、隐私说明和联系渠道。

缺少任一短信参数时，登录能力默认关闭，不生成或展示开发验证码。免费体验仍可使用。当前没有配置真实供应商凭据，也没有发送真实短信或完成运营商联调。

在管理员控制、root 拥有且 `0600` 的 `/etc/xuming/customer.env` 中注入：

| 参数 | 用途 |
| --- | --- |
| `XUMING_CUSTOMER_SECRET` | 至少 50 位随机签名秘密，与管理端不同 |
| `XUMING_CUSTOMER_PHONE_KEY` | 独立、稳定的至少 50 位随机手机号检索密钥 |
| `XUMING_CUSTOMER_REPORT_KEY` | `cryptography.fernet.Fernet.generate_key()` 生成的报告密钥 |
| `XUMING_CUSTOMER_HOME` | `/var/lib/xuming-customer`，对应账户独占，目录 `0700` |
| `XUMING_CUSTOMER_HOSTS` | 实际客户网站域名，不填管理端域名 |
| `XUMING_CUSTOMER_TRUST_PROXY` | 仅在回环监听且可信代理覆盖转发头后设为 `1` |
| `XUMING_SMS_SECRET_ID` / `XUMING_SMS_SECRET_KEY` | 供应商提供的最小权限短信凭据 |
| `XUMING_SMS_APP_ID` | 腾讯云短信应用 ID |
| `XUMING_SMS_SIGN_NAME` | 已批准的短信签名 |
| `XUMING_SMS_TEMPLATE_ID` | 已批准的登录模板，两个参数按顺序为验证码和有效分钟数 `5` |
| `XUMING_SMS_REGION` | 默认 `ap-guangzhou`，按供应商资源调整 |

不要提交环境文件、在命令参数或日志中暴露密钥。手机号检索密钥必须稳定备份，否则同一手机无法对应原账号；报告密钥必须独立备份，否则无法解密原报告。当前没有自动密钥轮换或重加密迁移工具，轮换需专门规划，不能直接替换后丢弃旧钥。

## 部署与检查

1. 在只读代码目录安装 `pip install -r requirements-customer.txt`，使用现有 Node 环境执行 `npm ci --prefix frontend` 和 `npm run build --prefix frontend`。
2. 创建与客户站点及员工后台不同的 `xuming-customer` 低权限系统账户，准备其独占 `0700` 数据目录及受保护的环境文件。代码、模板和静态字库只读；其他岗位不能读取客户数据库或环境。
3. 在客户服务账户的受保护运行环境中执行 `python manage_customer.py migrate`。同一环境下执行 `python manage_customer.py check --deploy`，审查安全检查结果。生产不设置 `XUMING_CUSTOMER_DEV=1`；默认 HTTPS，域名 HSTS 预加载需单独评估，当前未申请。
4. 审核 [客户服务示例](../deploy/xuming-customer.service.example) 并安装。仅在该服务安装后，在 [客户网站代理示例](../deploy/nginx.conf.example) 中启用对应 `/api/customer/` 路由；代理覆盖 `Host`、`X-Forwarded-Proto` 和 `X-Real-IP`。仅可信代理可直连服务端口；如有 CDN，先配置可信来源的真实 IP 处理，不能信任客户自行传入的 IP 头。
5. 安装 [清理服务](../deploy/xuming-customer-purge.service.example) 与 [每日定时器](../deploy/xuming-customer-purge.timer.example)，或按实际系统运行 `python manage_customer.py purge_customer_data`。验证过期记录不可访问、删除策略和备份恢复后不重新开放已删除数据。
6. 验证原匿名体验、真实短信受理与验证、跨设备找回、CSRF、跨客户越权、员工会话拒绝、Cookie 路径、服务账号之间的文件权限、日配额和日志。供应商、支付和目标服务器未接入，当前自动化测试不能代替这些上线验收。

纯匿名部署不需要 Django 客户服务：公开起名服务器提供不读取会话的匿名能力响应，页面显示“手机号登录暂未开通”。一旦配置客户服务，应保持其独立代理路由，即使短信暂不可用也不要把客户身份请求转给起名进程。

## 测试

```sh
python3 manage_customer.py test customer --settings=customer.test_settings
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e:customer
```

`customer.test_settings` 和 `scripts/customer_e2e.py` 只使用临时数据库、随机临时密钥和模拟短信，测试码不会从业务 API 返回。夹具只绑定回环地址，并要求专门的测试开关，不可部署给客户。员工后台测试保持单独运行，生产代码没有验证码旁路。
