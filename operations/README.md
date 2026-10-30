# 单次命名服务与岗位隔离

产品按“一次购买、一次确认范围、一次交付”设计，不订阅、不自动续费。正常流程不设置退款步骤，客服围绕交付与使用问题提供服务；重复收款、未能履约等异常进入人工核查。一次性服务不应表述为任何异常都不处理，具体条款须在开放购买前明确。

当前支付尚未接入。仓库提供内部登记工具及单次履约状态机，尚没有客户订单页面、真实支付确认、自动报告任务、报告存储或鉴权下载。下面的交付登记不能作为收款或客户实际收到报告的凭据。

## 单次服务规则

1. 购买前确认本次姓氏、起名场景、预产期/实际出生信息、偏好、候选范围和交付内容，再展示价格与条款。当前服务仍在规划，未公布交付期限，也未开放购买。
2. 同一次服务绑定不可变的需求摘要和版本。预产期仅作为参考；同时填写实际出生信息时优先采用实际时间，并保留预产期对照。交付后更改出生信息或要求，需要重新确认服务范围，不会自动扣费。
3. 同一业务请求和履约授权仅登记一份服务；重复提交返回原服务。需求变化不能偷偷覆盖原需求。未来支付系统必须把同一商户订单的重复通知映射为稳定的授权编号，而非每个通知新建授权。
4. 内部状态为 `ready` → `processing` → `delivered`。失败记为 `failed`，可在原服务下重试；最多尝试 3 次后转为 `manual_review`，不得无限循环。这里规定重试边界，尚未实现自动调度或人工处置功能。
5. 每次执行签发独立尝试编号并保留 10 分钟租期；租期内禁止并发启动。旧进程超时后可由新尝试接手，旧尝试不能覆盖新结果。连续超时也受 3 次上限限制。
6. 交付登记保存不可变的报告摘要。相同尝试对相同报告重复完成为幂等操作；交付后不能再次开始生成或替换报告。未来下载接口应通过客户身份鉴权复用同一份报告，下载次数不等于新购买；当前还没有该接口。
7. `manual_review` 由授权人员在独立的受控流程中处理，当前没有重置次数或重新开启的命令。不得绕过唯一授权重新登记同一服务。无法交付、重复扣款及其他履约争议转人工核查，处理方式以实际情况和适用要求为准，不自动标记已解决。

需求摘要应由可信业务服务根据规范化输入、方案和规则版本计算。输入明文和报告正文应留在独立的受控服务中，内部登记只保存 UUID 和 SHA-256；摘要也属于应保护的元数据。登记工具不验证摘要对应的内容或支付来源，生产环境需通过经过验证的支付适配器和受控报告任务调用，不能将 CLI 暴露给客户或作为公开授权接口。

## 岗位边界

| 岗位 | 当前工具能力 | 默认无权访问或操作 |
| --- | --- | --- |
| 经营者 | 查看客服、财务及交付汇总，明确服务范围与异常处置责任 | 客户出生信息、原始支付资料及岗位明细 |
| 客服 | 按工单 UUID 分类和流转状态，可记录服务 UUID 并查询只读交付状态摘要 | 财务账目、支付密钥、交付执行令牌和报告正文 |
| 财务 | 手工登记收入/支出，错误登记做一次冲销，查看登记汇总 | 客服内容、交付任务、出生资料、直接支付或退款 |
| 交付服务 | 注册需求摘要，控制尝试、失败与完成，查看状态汇总 | 客服数据库、财务数据库、支付密钥 |
| 系统管理员 | 配置主机、角色账户与备份 | 不参与日常业务审批；主机高权限仍可绕过本机隔离 |

客服分类为 `usage`、`naming`、`technical`、`delivery`、`billing_exception`、`other`。服务 UUID 不授予客户或财务数据访问权限；网页后台的独立接口只允许客服查询最少的交付状态字段，各岗位不直接跨库查询。工单不记录姓名、联系方式、出生资料或对话；不能代替正式客服系统。流转为 `open` → `in_progress` → `resolved` → `closed`，处理中也可关闭，已解决可退回处理中；关闭后新问题另建工单。

财务新登记仅允许 `income`、`expense`，单位为人民币分。取消原 `refund` 新增入口，原数据库已有退款记录保留并在汇总中列为 `legacy_refund_fen`，不会删除或改写旧账。`reverse` 只冲销手工登记，不操作真实资金；一笔只能冲销一次，冲销记录不能再次冲销。金额汇总是算术登记结果，不是银行余额、支付对账或会计报表。重复收款等异常的资金处理应由真实支付系统和授权人员核查，本工具没有这些能力。

## 主机隔离部署前提

- 公网站点 `xuming`、客服 `xuming-support`、财务 `xuming-finance`、交付 `xuming-delivery` 使用不同系统账户，各自数据库目录不共享可写组。应用代码和 Python 环境由管理员维护，业务账号只读；网站与反向代理不能读取操作目录。当前并未在目标服务器配置这些条件。
- 管理员创建三个无交互登录的系统账号，以及 `/var/lib/xuming-ops/support`、`/var/lib/xuming-ops/finance`、`/var/lib/xuming-ops/delivery`。父目录由管理员控制且不可被业务账号写入，各子目录由对应账户独占，权限 `0700`，数据库权限 `0600`。程序拒绝 root、错误账户、宽松权限、符号链接及非本账户所有的目录或数据库。
- 员工经个人身份认证、多因素认证和最小授权使用受控操作接口，记录个人身份到岗位的操作。避免共享凭据或宽泛的 sudo 命令权限，离职即时撤权。独立 CLI 识别系统岗位账户；网页后台通过独立员工登录及可信网关将员工编号写入岗位审计。
- 各库审计有防止普通 SQL 修改和删除的触发器，但库所有者和主机管理员能绕过，**不是防篡改审计**。真实认证、授权、拒绝访问及变更事件应送至独立集中审计；当前未接入。
- 各岗位备份分别加密、限制访问，密钥独立管理并演练恢复，按实际要求制定保留和删除周期。当前没有自动备份或清理。
- 上线前在目标机器验证四账户不能相互读取数据，公网不能获取内部代码、数据库或报告，且真实支付通知已校验签名、订单金额和状态。自动化测试使用模拟身份，不能替代主机跨账号验证或真实支付验收。

## 内部命令示例

下面仅演示管理员在配置完成后用测试数据验证。`sudo` 示例不是员工授权配置；代码目录 `/opt/xuming/app` 必须只读，替换所有示例 UUID 和摘要。

```sh
sudo -u xuming-support python3 /opt/xuming/app/operations/console.py support init
sudo -u xuming-support python3 /opt/xuming/app/operations/console.py support create --category delivery --service-id '服务UUID'
sudo -u xuming-support python3 /opt/xuming/app/operations/console.py support move --id '工单UUID' --status in_progress
sudo -u xuming-support python3 /opt/xuming/app/operations/console.py support summary

sudo -u xuming-finance python3 /opt/xuming/app/operations/console.py finance init
sudo -u xuming-finance python3 /opt/xuming/app/operations/console.py finance record --kind income --amount-fen 9900
sudo -u xuming-finance python3 /opt/xuming/app/operations/console.py finance reverse --id '原登记UUID'
sudo -u xuming-finance python3 /opt/xuming/app/operations/console.py finance summary

sudo -u xuming-delivery python3 /opt/xuming/app/operations/console.py delivery init
sudo -u xuming-delivery python3 /opt/xuming/app/operations/console.py delivery create --request-key '稳定请求UUID' --authorization-ref '履约授权UUID' --spec-sha256 '需求的64位小写SHA256'
sudo -u xuming-delivery python3 /opt/xuming/app/operations/console.py delivery start --id '服务UUID'
sudo -u xuming-delivery python3 /opt/xuming/app/operations/console.py delivery complete --id '服务UUID' --attempt-token '本次尝试UUID' --artifact-sha256 '报告的64位小写SHA256'
sudo -u xuming-delivery python3 /opt/xuming/app/operations/console.py delivery summary
```

执行失败时使用 `delivery fail --id '服务UUID' --attempt-token '本次尝试UUID' --reason generation_failed`，原因还支持 `artifact_unavailable`、`worker_timeout`；在重试上限内再次 `start`，不会新建服务。各岗位支持 `list` 和 `audit`，最多返回最近 200 条；汇总不包含报告内容或客户信息。不要将敏感信息放进命令行、环境变量、路径、日志或编号。
