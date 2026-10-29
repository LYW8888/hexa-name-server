# 序名 · 现代东方命名

响应式中文起名与改名原型。当前已接入四柱排盘；候选名字、字的五行归类、卦象关联及评分仍为待核验的演示数据，不提供喜用神或确定性运势判断。

## 安装与运行

需要 Python 3.9+、系统时区数据库和 Node.js（运行前端测试时）。安装固定版本的 MIT 许可历法依赖：

```bash
python3 -m pip install -r requirements.txt
python3 server.py
```

访问 `http://localhost:4173`。服务提供 `/api/health`、`/api/catalog`、`/api/classics`、`/api/product` 和 `/api/analyze`。四柱由服务端计算；服务不可用时页面会提示重试，不会回退到虚构的排盘。

## 四柱排盘口径

- 支持 1900–2100 年、`Asia/Shanghai`、`Asia/Taipei`、`Asia/Hong_Kong`。输入为所选地区的当地民用日期和时间；夏令时不存在或重复的时刻会要求核对。
- 年柱以立春交接时刻为界，月柱以十二“节”的交接时刻为界。历法库节气时刻按 UTC+8 标准时间解释，再转换至所选时区。
- 日柱按当地民用时间 23:00 换日，23:00–00:59 为子时。其他流派可能采用不同换日口径。
- 地点目前为文字记录，未解析经度，**没有真太阳时修正**。年、月柱按节气实际时刻计算，日、时柱按输入的当地民用时钟计算。
- 五行计数仅统计四柱中四个天干和四个地支各一项，不含藏干或季节权重，不能直接推出旺衰、喜用神或运势。
- 预产期可以为未来时间，默认 12:00 作为参考。预产期和实际出生信息可并存；实际出生日期及准确时间一旦填写，优先用于排盘。预产期排盘明确标为参考，出生后应重新计算。
- 若输入时刻距节交接不超过 2 分钟，返回边界提醒和交接前后可能的年、月柱；请核对出生记录和节气时刻。

## 核验与局限

历法引擎固定为 [`lunar_python` 1.4.8](https://github.com/6tail/lunar-python)（MIT）。测试基于立春、惊蛰、晚子时和已知日期样例，并与 [`sxtwl` 2.0.7](https://github.com/yuangu/sxtwl_cpp) 交叉比较：固定随机种子下 1,407 个非节气交接日的四柱一致；2,613 个节交接记录（含相邻年记录）最大时刻差约 54.4 秒。两个库有共同的寿星天文历来源，因此这不是完全独立的天文观测验证。

香港天文台公开历表在本次执行环境返回 HTTP 403，尚未完成权威历表逐条对照或机构认证。时区历史数据、精确出生时间及真太阳时仍会影响结果。复现跨库检查：

```bash
python3 -m pip install -r requirements-dev.txt
python3 scripts/verify_bazi_crosscheck.py
```

## 自动化测试

```bash
python3 -m unittest discover -s tests -v
node --test tests/test_engine.js
```

启动服务后可运行 `python3 scripts/simulate_100_users.py --base-url http://127.0.0.1:4173`，生成 100 条可重复的合成用户路径；结果不是实际用户访谈。历史反馈见 `reports/simulated-100-users.md`。

## API 示例

```bash
curl -s -X POST http://localhost:4173/api/analyze -H 'Content-Type: application/json' -d '{"mode":"due_date","surname":"林","dueDate":"2099-04-16","dueTime":"12:00","place":"杭州","zone":"Asia/Shanghai","length":2,"candidateCount":5,"gender":"unknown"}'
```

`analysis.bazi` 包含四柱、日主、表面五行计数、前后节气、规则口径、来源和节气边界提示。候选名评分是独立的演示排序，未以五行缺项推断喜用神；候选卦象为人工关联，不是依据出生信息起卦。

候选筛选和排序由 `/api/analyze` 统一完成，页面仅补充展示资料。`likedChars` 是逐字排序偏好，并不保证每个名字都包含；`avoidedChars` 是逐字排除条件，仅作用于名，不排除姓氏。两者支持汉字、空格和常用分隔符，不能包含相同的字。筛选后数量不足时返回实际可用数量；没有匹配时返回空列表，不以不同字数或含避用字的名字补足。旧版 `chars` 字段仍支持“喜欢清，避开刚”等简单写法，建议新客户端使用独立字段。

## 隐私与产品状态

收藏只保存在浏览器本地，可从页面底部清除；出生信息提交至同源分析服务，不写入收藏。下载方案由浏览器生成。支付接口尚未接入，正式上线前需补齐隐私政策、数据保存及删除流程、支付与报告交付。
