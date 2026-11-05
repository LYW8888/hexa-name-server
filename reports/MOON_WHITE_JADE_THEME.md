# 月白青黛 · 星空东方

此文记录上一版配色调整；其构图与用户选定示意图仍有差距。当前山水插画、青黛导航与纸面卡片版本见[参考图风格落地](REFERENCE_DESIGN_IMPLEMENTATION.md)。以下截图保留作历史对照。

按用户在四套配色概念中确认的第1方案，将全站改为月白底、青黛文字、玉青按钮与少量古金。保留星河、月光、水墨山峦和东方字形，粉紫色不再用于主界面。代码与截图在本地验证，目标服务器尚未更新。

## 配色与范围

| 用途 | 主色 |
| --- | --- |
| 月白画布 | `#F3F5F1` |
| 青黛正文、主标题与姓名 | `#243D46` |
| 玉青品牌、图标及选中强调 | `#56877E` |
| 古金星点、卡片角线与细节 | `#B59C68` |

操作按钮使用更深的玉青渐变`#507D73`至`#466F66`，承载白字。白字与两个端点的对比度约4.64:1和5.64:1；青黛与纯白约11.47:1。此为关键颜色对照，不代表全站无条件通过可访问性认证。

范围包括客户首页、三种命名场景、输入与选择、名字卡、收藏、账号、报告、反馈、心愿卡，以及后台登录、经营者/客服/财务/交付岗位、员工与权限、历史报告和改密页面。浏览器图标、客户PWA启动背景和后台内联图标同步。

共享颜色变量集中在`frontend/src/ui/dream-theme.css`，客户与后台复用。Radix强调色改为`jade`、灰阶为`sage`，避免组件默认紫色残留；背景、描边、星空SVG与本机Canvas心愿卡同步。错误/删除操作保留独立暖棕红提示，计算边界提醒使用暖金提示。

## 对齐与交互

单行输入保持48px、移动端文字16px；聚焦仍由输入外层绘制一圈低透明度玉青光晕，内部输入不重复描边。保留选中标识、键盘焦点与减少动态效果。名字卡片用三种轻微月白/青灰层次和细古金角线保持区分，古金不作为大面积底色。

本轮只调整表现，不改变预产期/已出生/改名流程、算法、名额计次、资料授权或岗位隔离。客户页和后台的独立入口、会话与数据权限继续由原服务保障。

## 真实运行截图

使用合成资料、临时数据库及测试账号；计数来自测试服务，不代表线上经营数据。整页截图隐藏短暂Toast并将粘性导航放回文档顶部。

| 客户端 | 管理端 |
| --- | --- |
| [电脑名字提案](images/moon-client-proposals.jpg) | [电脑登录](images/moon-admin-login.jpg) / [手机登录](images/moon-admin-login-mobile.jpg) |
| [电脑报告](images/moon-client-report.jpg) / [手机报告](images/moon-client-report-mobile.jpg) | [工作总览](images/moon-admin-overview.jpg) |
| [心愿卡](images/moon-keepsake.png) / [手机制作](images/moon-client-keepsake-mobile.jpg) | [免费名额](images/moon-admin-quota.jpg) |
| 收藏与反馈沿用同一配色 | [员工管理](images/moon-admin-staff.jpg) / [修改密码](images/moon-admin-password.jpg) |
| | [历史报告](images/moon-admin-reports.jpg) |
| | [手机客服](images/moon-admin-support.jpg) |
| | [财务](images/moon-admin-finance.jpg) / [手机交付](images/moon-admin-delivery.jpg) |

## 验证与更新

本轮共94项检查通过：公共客户端浏览器52项、管理端与完整报告浏览器10项、客户账号浏览器5项，以及Node规则/报告/分享/心愿卡检查27项。另核对构建、实际HTTP的三种命名流程与5个资源、客户与后台/PWA主题元数据和图标一致性、输入尺寸/聚焦、320px溢出及差异格式。后端算法和存储测试不计为本轮新运行。

浏览器实测：姓氏输入内层与外层`outline-style`均为`none`，外框48px，焦点为`rgba(86,135,126,.14)`外层光晕；客户及客服/财务/交付页320px布局未发现页面横向溢出。

```sh
npm --prefix frontend run build
node --test tests/test_*.js
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e -- --workers=2
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e:admin
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e:customer
```

服务器拉取后重新构建前端，让客户站和管理站都使用同一份`frontend/dist`。本轮无需数据库迁移、新依赖或环境变量。若尚未部署公开名额内测，需一并按[公开内测说明](PUBLIC_BETA_QUOTA.md)更新对应进程，保留既有数据库与密钥。
