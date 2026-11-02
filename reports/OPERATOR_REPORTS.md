# 免费名字提案与经营者报告交付

客户免费获得姓名、读音和简短寓意，可比较、收藏和保存免费提案。四柱、阴阳五行生克、旺衰喜用、现名分析、古籍出处、评分明细及完整报告只交给经营者，由经营者人工发送。微信 **LCEX511**，QQ **19437771**；公开联系信息在 `data/product.json` 中维护。

## 客户与经营者流程

1. 客户免登录生成名字提案。改名仍先在服务端分析现名，再推荐新名；免费接口只返回分析完成状态。
2. 客户明确勾选同意保存本次出生资料、偏好和提案，再点击登记，得到申请编号。之前的免费浏览不会写入报告库。
3. 客户复制申请编号与名字，通过微信或QQ联系经营者，确认报告范围、费用和交付时间。复制的咨询信息不自动附带出生时间或地点。
4. 经营者通过独立后台的“完整报告”工作台按编号查找，查看固定快照并导出 Markdown 完整报告，通过约定渠道人工交付，再明确标记已交付。
5. 经营者可以删除申请与报告。在线报告保留30天，到期立即禁止读取，配套每日清理；删除/过期后迟到的原提交编号不能恢复记录。去重与操作审计元数据保留90天。备份中的副本仍需运营方落实保留及删除策略。

登记不代表购买或收款，没有自动扣费、付款确认或自动发送。用户已取得的历史下载文件不能由服务器撤回。

## 权限与存储

- `/api/analyze`、`/api/name-review` 始终返回服务端白名单投影，付费标志、角色参数、请求头和查询参数都不授予报告权限。原本的内部 `server.analyze()` 保留完整计算，供私有服务调用。
- 已登录客户也只能找回名字提案。旧账号中的完整免费快照在读取时同样过滤，不提供历史下载绕过入口；新免费账号记录只存提案。
- `/api/report-requests` 只能创建申请，返回不含报告的随机编号；公网没有列表、读取或下载申请报告的接口。
- 独立 `xuming-reports` 进程通过 Unix socket 的真实调用 UID 区分公网与管理网关。公网 UID 只能提交，不能因伪造 `staff` 操作人而读取报告；管理网关仍需密码、TOTP、CSRF及经营者岗位检查。
- 客服、财务和原有交付岗位均不能访问新报告接口。经营者新获得报告工作台权限，原有不能读取客服和财务岗位明细的边界继续有效。
- 报告正文以 Fernet 加密存放在报告服务独占目录，数据库0600、目录0700；完整输入摘要和来源地址摘要使用密钥HMAC。公网、管理网关和其他岗位不持有报告密钥或数据库路径访问权。报告进程和主机管理员仍属于可信边界。
- 每次登记由私有服务重新计算，不信任客户端提供的报告、候选详情或收款状态；与客户所见名字不一致则要求重新生成。成功后保存固定报告，不因后续算法更新改写。相同提交键和资料重试幂等，网络改变仍可安全复用编号；输入不同不能覆盖原申请。编号和提交键都不授予报告读取权限。
- 新申请每来源15分钟最多10次，全局每天最多500次、最多10000条活动记录；重复安全重试不新增额度。入口还可通过Nginx限流。限额不是订单或支付系统。

## 部署新增报告服务

这部分需要在目标服务器安装后才可在线登记；只拉取前端不会自动创建私有服务。未配置时仍可免费起名、复制联系方式直接咨询，不显示虚构申请编号，也不恢复公开报告下载。

1. 安装 `requirements-backoffice.txt`，构建前端。创建独立非root账号 `xuming-reports`，与 `xuming`、`xuming-admin` 及其他岗位账号分离。创建 `xuming-report-clients` 组，仅让公网和管理网关账号加入该组以连接socket；报告数据库目录不要给该组读取权限。
2. 创建 root 拥有、0600的 `/etc/xuming/reports.env`，注入稳定的 `XUMING_REPORTS_KEY`（由 `Fernet.generate_key()` 生成）、公网账号的实际数字UID `XUMING_PUBLIC_UID`、管理账号的实际数字UID `XUMING_ADMIN_UID`。通过可信密钥管理流程生成、注入和备份；不把密钥放在Git、命令行、截图或日志中，也不把它交给公网和管理网关进程。丢失或直接替换密钥会导致原报告无法解密。
3. 安装审核后的 [报告服务](../deploy/xuming-reports.service.example) 和 [每日清理服务](../deploy/xuming-reports-purge.service.example)、[定时器](../deploy/xuming-reports-purge.timer.example)。systemd创建私有 `/var/lib/xuming-reports` 与可连接的 `/run/xuming-reports/worker.sock`；代码和字库只读。服务会拒绝root、共享UID或不安全目录。
4. 在公网 `/etc/xuming/public.env` 与管理网关 `/etc/xuming/admin.env` 中配置 `XUMING_REPORTS_SOCKET=/run/xuming-reports/worker.sock`，并确保两个服务具有 `xuming-report-clients` 附加组。不要配置报告密钥。公网仍只绑定回环地址；在可信反向代理覆盖 `X-Real-IP` 且应用不能被外网直连的前提下，在公网环境中设 `XUMING_TRUST_PROXY=1`，否则同一回环代理地址会共用申请限额。
5. 更新 [客户站点代理](../deploy/nginx.conf.example)，重启报告服务、命名服务及管理网关；如已部署客户账号服务，也需重启该服务以启用旧记录的访问过滤。管理域名继续与客户域名分开，Cookie不跨域共享。
6. 使用真实系统账号验证：公网账号不能读取报告目录或密钥、不能通过socket读取报告；客服/财务/交付账号的网页请求返回403；经营者可按匿名申请编号查看、导出与删除。再验证真实微信/QQ沟通、备份恢复和定时清理。仓库内浏览器夹具使用同一测试UID模拟边界，不能代替目标主机的跨账号验收。

## 自动化验证

```sh
python3 -m unittest discover -s tests -v
node --test tests/test_*.js
python3 manage_backoffice.py test backoffice --settings=backoffice.test_settings
python3 manage_customer.py test customer --settings=customer.test_settings
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e:admin
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e:customer
```

覆盖免费接口及旧账号记录无报告、显式同意、加密存储、申请编号复用、原提案一致性、后台权限、公开socket拒绝报告读取、过期删除、人工交付与完整报告导出。共298项验证通过：168项Python测试、25项Node测试、19项后台测试、26项客户服务测试、50项公开页面浏览器测试、5项后台浏览器测试、5项客户账号浏览器测试；生产前端构建成功。

实测截图使用合成姓名与出生资料：[手机端免费提案](images/free-proposals-mobile.png)、[联系方式与申请编号](images/report-contact-mobile.png)、[经营者报告工作台](images/operator-report-desktop.png)。
