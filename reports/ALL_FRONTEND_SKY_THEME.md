# 全站前端：梦幻星空＋东方特色

本轮将全部正在使用的前端统一为浅色梦幻星空与东方美学，覆盖客户页、独立管理端、心愿卡和手机启动外观。代码与截图在本地验证，目标服务器尚未更新。

## 主题与覆盖范围

使用共享`DreamSky`背景和`dream-theme.css`设计变量，统一雾紫、浅蓝、淡粉、珍珠白玻璃面板与轻柔光晕。星河、月光和山水轮廓为装饰，不表示实际星图或命理计算。中文宋体、篆印边框般的星形品牌标志和水墨山峦表现东方风格。

| 区域 | 本轮覆盖 |
| --- | --- |
| 客户首页与起名 | 星空背景、三种场景、输入/选择/错误状态、名字卡片、比较及收藏 |
| 客户辅助服务 | 手机导航、账号保存与找回、命名方法、联系方式、心愿卡制作 |
| 完整报告与反馈 | 四柱及选名依据面板、弹窗、反馈选中状态、下载入口 |
| 后台登录 | 登录卡片、可见密码开关、动态码、找回说明、手机品牌栏 |
| 经营者 | 总览、名额、反馈、历史报告、员工权限、操作记录、首次改密及修改密码 |
| 客服/财务/交付 | 表单、登记列表、表格、状态、确认操作和手机横向导航 |
| 手机与浏览器外观 | 客户与后台theme-color、客户PWA启动背景、浏览器图标 |
| 心愿卡图片 | 本机Canvas生成的渐变星河、月光、水墨山峦、名字及祝愿 |

管理端保持独立身份与数据边界；统一主题不合并账号、会话、岗位或数据库。现有预产期/已出生/改名流程、公开名额计次与自愿反馈机制沿用原实现。根目录历史静态页面仍为回滚资料，生产入口为`frontend/dist/index.html`与独立的`admin.html`。

## 控件与适配

客户页与管理端单行输入统一48px，带图标输入仅由外层绘制聚焦光晕，避免内外两层描边。键盘焦点、选中、错误与删除状态分别呈现。移动端输入16px，主操作至少44px；表格在自身容器内横向滚动，导航可横向浏览，页面本身不横向溢出。

后台页实测确认密码输入内层与外层`outline-style`均为`none`，外框48px，焦点通过外层光晕呈现。客户页及客服、财务、交付页检查了320px布局。星光缓慢明暗变化遵循系统“减少动态效果”；装饰不接收点击，不进入辅助技术阅读顺序。

管理端图标内联在其HTML中，避免请求客户域名或为图标增加新的后台公开路由。客户PWA保留原离线缓存边界，业务与身份接口不加入缓存。心愿卡继续在本机生成，图片只含填写的名字、祝愿和站点，不自动包含出生资料。

## 本地实测截图

下列截图使用合成资料、临时数据库和测试账号，不代表线上业务数据。整页截图隐藏短暂Toast并将粘性导航放回文档顶部；图片内容均由真实页面渲染。

| 客户端 | 管理端 |
| --- | --- |
| [名字提案](images/sky-client-proposals.jpg) | [电脑登录](images/sky-admin-login.jpg) / [手机登录](images/sky-admin-login-mobile.jpg) |
| [电脑报告](images/sky-client-report.jpg) / [手机报告](images/sky-client-report-mobile.jpg) | [经营总览](images/sky-admin-overview.jpg) |
| [心愿卡预览](images/sky-keepsake.png) / [手机制作](images/sky-client-keepsake-mobile.jpg) | [名额与报告](images/sky-admin-quota.jpg) |
| 输入与收藏沿用统一控件 | [员工管理](images/sky-admin-staff.jpg) / [修改密码](images/sky-admin-password.jpg) |
| 报告弹窗沿用统一表面 | [历史报告](images/sky-admin-reports.jpg) |
|  | [手机客服](images/sky-admin-support.jpg) |
|  | [财务](images/sky-admin-finance.jpg) / [手机交付](images/sky-admin-delivery.jpg) |

## 验证与部署

本轮通过94项检查：公共客户端浏览器52项、管理端与完整报告浏览器10项、客户账号浏览器5项、Node规则及分享/卡片相关检查27项。另通过前端构建、实际HTTP站点自检（三种命名流程与5个构建资源）、页面视觉和尺寸检查、`git diff --check`。本轮未改后端算法和存储，不将旧版后端测试计为本次新运行。

```sh
npm --prefix frontend run build
node --test tests/test_*.js
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e -- --workers=2
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e:admin
CHROMIUM_PATH=/usr/bin/chromium npm --prefix frontend run test:e2e:customer
```

服务器拉取后重新安装锁定依赖并构建，确保客户站和管理站都读取同一份`frontend/dist`。本轮无需新增数据库迁移或环境变量，保留原数据库、密钥、独立域名、岗位服务与权限配置。若尚未部署公开限额内测，先按[公开内测说明](PUBLIC_BETA_QUOTA.md)更新命名、后台和报告服务。
