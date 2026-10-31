# 部署准备（示例，尚未在目标服务器执行）

应用目前是开发和验证原型，尚不具备支付、正式订单或已核验的完整命名资料。不要把规划中的付费权益当成已交付服务。

示例假定专用低权限账户 `xuming`、代码位于 `/opt/xuming/app`、虚拟环境位于 `/opt/xuming/venv`，反向代理和证书由服务器管理员配置。按实际服务器修改路径和用户；确保服务用户可写 `app/data`，但不要给 Web 代理开放该目录。执行前备份既有服务和配置。

1. 获取并审核要部署的 Git 提交；在服务器准备低权限账户、应用目录及 Python 3.9+ 的虚拟环境，安装 `pip install -r /opt/xuming/app/requirements.txt`。使用 Node.js 20.19–20.x 或 22.12+ 在应用目录执行 `npm ci --prefix frontend` 和 `npm run build --prefix frontend`，构建的 `frontend/dist` 供服务只读访问。
2. 按路径和账户修改 `xuming.service.example`，安装为 systemd 服务；服务通过 `HOST=127.0.0.1` 只绑定本机。按需检查目录权限与服务日志。
3. 取得目标域名的有效证书，修改 `nginx.conf.example` 的域名和证书路径；在 Nginx 中代理到本机应用，禁止配置静态目录直出。先检查 `nginx -t`，再按服务器既有变更流程加载配置。
4. 使用 HTTPS 验证首页、排盘、候选、收藏、报告及 `/api/health`，同时确认 `/.git/config`、`/server.py`、`/data/naming.sqlite3` 不可通过代理访问；验证 HTTP 跳转、证书续期与服务重启。
5. 配置适合实际流量的限流、监控和告警、依赖更新及回滚；审查应用、代理、CDN、监控和备份是否记录或保存出生信息。示例禁用 Nginx 访问日志，不代表其他环节不会保存数据。

用户数据说明、个人信息处理者及联系渠道需要由真实运营方补全并审查后发布。示例未设置线上服务器、域名、证书、支付凭据或运营信息，也不替代针对实际环境的安全评估。

独立网页管理后台使用其他账号、端口和域名，不挂载到客户应用。后台及 Unix socket worker 的部署、凭据开通和隔离验收见 [后台说明](../backoffice/README.md)，相应 systemd/Nginx 示例位于本目录；这些配置尚未在目标服务器执行。

客户手机号登录和体验记录由另一个独立服务处理，相关配置见 [客户服务说明](../customer/README.md)。纯匿名部署可省略客户服务的代理 location；安装并配置该服务后再启用对应路由。真实短信、支付和目标主机的隔离尚待联调验收。

## 拉取代码后仍显示旧页面或点击生成无反应

React 版必须构建 `frontend/dist`，只拉取 Git 并重启不能保证前端已更新。在服务器的实际代码目录执行：

```sh
git pull --ff-only origin main
npm ci --prefix frontend
npm run build --prefix frontend
python3 scripts/import_naming_corpus.py
```

然后重启当前运行 `server.py` 的应用服务（服务名取决于实际部署）。Nginx 首页应代理到该进程，不应直接返回仓库根目录保留的旧 `index.html`，也不要只上传某个 `app.js` 或 CSS 文件。

重启后先检查本机，再检查外部域名：

```sh
python3 scripts/check_site.py --url http://127.0.0.1:4173
python3 scripts/check_site.py --url https://实际网站域名
```

自检会核对 React 首页、同一构建的入口与预加载资源、健康接口，并使用虚构的姓氏和未来预产期实际生成 3 个候选；不会创建账号、订单、收费或保存客户报告。若本机通过而域名失败，检查 Nginx 路由和 CDN；若浏览器仍显示旧页面，使用页面更新提示中的刷新按钮重新获取完整页面。本地收藏不会因此被清除。

表单当前会在最后提交时重新校验所有步骤；起名请求最长等待 15 秒，超时、接口未接通或代理返回 HTML 时会显示明确错误并允许重试。旧页面加载新脚本时会提示版本不一致，避免缺失元素导致提交中断。


## 古籍取名v3资料库

部署时运行 `python3 scripts/import_naming_corpus.py`，从仓库中的上传原文、82个取名片段、121个正向义项和规则配置重建 `data/naming-corpus.sqlite3`。原文SHA-256不符或取字片段无法逐条匹配时导入失败，不替换原库。命名服务也能在启动时补建，但应在重启客户服务与交付进程前预先完成导入。

此库仅含公共参考资料，不含客户信息，生成文件权限0644；客户服务和交付进程只读打开，不需要放宽它们的 `ReadWritePaths`。更新后重启命名服务、客户服务及实际调用算法的常驻进程，以刷新每个进程的版本快照。保留现有客户身份、财务、客服数据目录和权限隔离。

验证 `/api/naming-corpus` 和 `/api/name-counts?algorithm=literary_v3` 的实际资料版本；原始文件、字典全文和SQLite仍不通过命名HTTP服务公开。
