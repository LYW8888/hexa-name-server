import { calculationLines } from "./traditional-report.js";
export function getClockInZone(zone) {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      minutes: Number(values.hour) * 60 + Number(values.minute),
    };
  } catch (error) {
    const now = new Date();
    return {
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
}

export async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      // Some browsers block clipboard access outside a secure context.
    }
  }
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  try {
    helper.select();
    return (
      typeof document.execCommand === "function" && document.execCommand("copy")
    );
  } finally {
    helper.remove();
  }
}

export function readingNotes(pronunciation) {
  if (
    !pronunciation ||
    !Array.isArray(pronunciation.surname) ||
    !Array.isArray(pronunciation.given)
  ) {
    return ["读音对照暂不可用，请自行核对。"];
  }
  const surname = pronunciation.surname
    .map(
      (item) =>
        `${item.character}：${item.readings.length ? item.readings.join(" / ") : "字典未收录"}`,
    )
    .join("；");
  const given = pronunciation.given
    .map((item) => {
      const result =
        item.status === "listed"
          ? "字典列有此音"
          : item.status === "unknown"
            ? "字典未收录"
            : "预设读音不在字典列表中，需复核";
      const alternatives =
        item.readings.length > 1
          ? `；字典读音 ${item.readings.join(" / ")}`
          : "";
      return `${item.character}：${item.selected || "未填写"}（${result}${alternatives}）`;
    })
    .join("；");
  const notes = [`姓氏单字读音：${surname}。`, `名的读音对照：${given}。`];
  if (pronunciation.surname.some((item) => item.readings.length > 1))
    notes.push(
      "姓氏包含多音字；以上是字典单字读音，姓氏实际读法请按家族习惯核对。",
    );
  if (pronunciation.surname_given_overlap?.length)
    notes.push(
      `姓和名中都有“${pronunciation.surname_given_overlap.join("、")}”，请结合全名读写习惯判断。`,
    );
  notes.push(pronunciation.limitations);
  notes.push(
    `读音对照：${pronunciation.source.library} ${pronunciation.source.version}；预设读音和多音字用法仍需人工核对。`,
  );
  return notes;
}

export function friendlyError(message) {
  const text = String(message || "");
  const rules = [
    [
      /surname must contain one or two (?:Chinese )?characters/i,
      "姓氏需要填写 1–2 个汉字。",
    ],
    [/mode must be due_date or born/i, "请选择预产期或已出生流程。"],
    [/purpose must be newborn or rename/i, "请选择新生儿起名或成人改名。"],
    [/rename purpose requires born mode/i, "成人改名需要使用已出生信息流程。"],
    [/gender must be male, female, or unknown/i, "性别请选择男、女或未知。"],
    [/zone must be/i, "请选择列表中的时区。"],
    [/dueDate is required/i, "预产期流程需要填写预产期日期。"],
    [
      /birthDate and exact birthTime are required/i,
      "已出生流程需要填写出生日期和准确时间。",
    ],
    [
      /birthDate and birthTime must be supplied together/i,
      "出生日期和准确出生时间需要同时填写。",
    ],
    [
      /actual birth date cannot be in the future/i,
      "实际出生日期不能晚于今天。",
    ],
    [/birthTime cannot be in the future/i, "出生时间不能晚于当前时间。"],
    [/dueTime must use/i, "预产期时间格式不正确，请重新选择。"],
    [/birthTime must use/i, "出生时间格式不正确，请重新选择。"],
    [/length must be/i, "名字字数请选择 1–3 个字。"],
    [/candidateCount must be/i, "生成数量需要填写 1–11 个整数。"],
    [/place is required/i, "请填写出生地点，便于生成地域和时区参考。"],
    [/currentName must be/i, "现用姓名最多填写 20 个字符。"],
    [
      /likedChars and avoidedChars cannot overlap/i,
      "喜欢的字和必须避开的字不能重复，请调整后重试。",
    ],
    [
      /(likedChars|avoidedChars) must contain/i,
      "喜欢和避开的字请填写汉字，可用空格、顿号或逗号分隔。",
    ],
    [/longitude is required/i, "启用真太阳时后，请选择城市或填写出生地经度。"],
    [
      /longitude must be/i,
      "出生地经度请输入 −180 到 180 之间的数字，东经为正、西经为负。",
    ],
    [/timeBasis must be/i, "请选择民用时钟或真太阳时。"],
    [/locationId must/i, "请选择列表中的城市，或手动填写经度。"],
    [/elementPreference must be/i, "请选择列表中的传统文化选字参考。"],
    [/request too large/i, "提交内容过大，请减少文字后重试。"],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? match[1] : text || "暂时无法生成方案，请稍后重试。";
}

export function downloadReportFile(
  lastRequest,
  lastAnalysis,
  lastCandidates,
  showToast,
) {
  if (!lastRequest || !lastCandidates.length) {
    showToast("先生成名字方案，再下载命名记录。", "info");
    return;
  }
  const analysis = lastAnalysis;
  if (!analysis?.bazi) return;
  const chart = analysis.bazi;
  const comparison = analysis.bazi_comparison;
  const referenceBoundary = comparison?.reference?.boundary;
  const comparisonLines = !comparison
    ? []
    : comparison.error
      ? [`预产期参考对照暂不可用：${comparison.error}；实际出生排盘不受影响。`]
      : [
          `预产期参考四柱（${comparison.reference.local_time}）：${comparison.differences.map((item) => `${item.label} ${item.reference}`).join("　")}`,
          `实际出生四柱：${comparison.differences.map((item) => `${item.label} ${item.actual}`).join("　")}`,
          `四柱对照：${comparison.differences.map((item) => `${item.label}${item.changed ? "有变化" : "相同"}`).join("、")}`,
          ...(comparison.near_boundary
            ? [
                "节气边界提示：其中一组时间接近节气交接，年柱或月柱的对照结果可能随节气时刻核对而变化。",
              ]
            : []),
          ...(referenceBoundary
            ? [
                `预产期参考边界：${referenceBoundary.warning} ${referenceBoundary.term} ${referenceBoundary.local_time}`,
                `交接前：${referenceBoundary.alternatives[0].year}年 ${referenceBoundary.alternatives[0].month}月；交接后：${referenceBoundary.alternatives[1].year}年 ${referenceBoundary.alternatives[1].month}月`,
              ]
            : []),
          "对照只比较四柱，不判断运势好坏；生辰起卦与选字采用实际出生时间。",
        ];
  const lines = [
    "# 序名 · 命名参考方案",
    "",
    `姓氏：${lastRequest.surname || "未填写"}`,
    `用途：${analysis.purpose || (lastRequest.purpose === "rename" ? "成人改名" : "新生儿起名")}`,
    `现用姓名：${analysis.current_name || lastRequest.currentName || "未填写"}`,
    `场景：${analysis.scenario || "命名参考"}`,
    `性别：${analysis.gender || "未知"}`,
    `出生地点：${lastRequest.place || "未填写"}`,
    `时区：${analysis.zone_label || analysis.zone || lastRequest.zone || "中国标准时间 UTC+8"}`,
    `预产期：${analysis.due_date ? `${analysis.due_date} ${analysis.due_time || "12:00"}` : "未填写"}`,
    `出生信息：${analysis.birth_date ? `${analysis.birth_date} ${analysis.birth_time || "时间待补充"}` : "尚未填写"}`,
    `喜欢的字：${lastRequest.likedChars || "未填写"}（排序偏好）`,
    `避用字：${lastRequest.avoidedChars || "未填写"}（仅作用于名）`,
    `候选数量：${lastCandidates.length}`,
    `四柱：${chart.pillars.map((item) => `${item.label} ${item.ganzhi}`).join("　")}`,
    `日主：${chart.day_master.stem}（${chart.day_master.element}）`,
    `表面八字五行计数：${Object.entries(chart.element_counts)
      .map(([element, count]) => `${element} ${count}`)
      .join("、")}`,
    `排盘口径：${chart.conventions.join("；")}`,
    ...(chart.boundary
      ? [
          `节气边界提醒：${chart.boundary.warning} ${chart.boundary.term} ${chart.boundary.local_time}`,
          `交接前：${chart.boundary.alternatives[0].year}年 ${chart.boundary.alternatives[0].month}月；交接后：${chart.boundary.alternatives[1].year}年 ${chart.boundary.alternatives[1].month}月`,
        ]
      : []),
    ...(analysis.traditional
      ? [
          `四柱阴阳：阴 ${analysis.traditional.polarity_counts.阴}，阳 ${analysis.traditional.polarity_counts.阳}`,
          ...analysis.traditional.pillars.map(
            (p) =>
              `${p.label}：干${p.stem_polarity}、支${p.branch_polarity}；天干十神 ${p.ten_god}；藏干 ${p.hidden_stems.map((h) => `${h.stem}(${h.element}，${h.ten_god})`).join("、")}`,
          ),
          `藏干单独计数（未赋权重）：${Object.entries(
            analysis.traditional.hidden_element_counts,
          )
            .map(([e, c]) => `${e} ${c}`)
            .join("、")}`,
          ...analysis.traditional.notes,
        ]
      : []),
    ...(analysis.gua
      ? [
          `起卦方法：${analysis.gua.method}；时间 ${analysis.gua.local_time}`,
          `农历参数：${analysis.gua.inputs.lunar_year}年${analysis.gua.inputs.leap_month ? "闰" : ""}${analysis.gua.inputs.lunar_month}月${analysis.gua.inputs.lunar_day}日；年支数 ${analysis.gua.inputs.year_branch_number}；时支数 ${analysis.gua.inputs.hour_branch_number}`,
          `起卦：上卦 ${analysis.gua.arithmetic.upper_sum} 除8余 ${analysis.gua.arithmetic.upper_remainder}，下卦 ${analysis.gua.arithmetic.lower_sum} 除8余 ${analysis.gua.arithmetic.lower_remainder}；总数除6余 ${analysis.gua.arithmetic.moving_remainder}；余0分别作8或6`,
          `本卦 ${analysis.gua.hexagram}，动第${analysis.gua.moving_line}爻，变卦 ${analysis.gua.changed_hexagram}；体卦 ${analysis.gua.body.name}(${analysis.gua.body.element})，用卦 ${analysis.gua.use.name}(${analysis.gua.use.element})`,
          ...analysis.gua.conventions,
          analysis.gua.limitations,
        ]
      : []),
    ...(analysis.naming_reference
      ? [
          `选字参考：${analysis.naming_reference.label}；${analysis.naming_reference.explanation}`,
        ]
      : []),
    ...calculationLines(analysis),
    ...comparisonLines,
    "",
    `说明：${analysis.method || "传统文化参考，不承诺确定性运势结果。"}`,
    "",
    "## 候选名字",
    "",
  ];
  lastCandidates.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.fullName}`);
    lines.push(`- 拼音：${item.pinyin}`);
    readingNotes(item.pronunciation).forEach((note) => lines.push(`- ${note}`));
    lines.push(`- 寓意：${item.meaning}`);
    lines.push(`- 标签：${item.tags.join("、")}`);
    lines.push(
      `- ${item.ranking ? "偏好匹配" : "演示评分"}：${item.score}/100`,
    );
    lines.push(`- 字形意象：${item.elementEvidence}`);
    lines.push(`- 易经象意：${item.guaEvidence}`);
    lines.push(`- 阴阳：${item.yinyangEvidence}`);
    lines.push(`- 评分构成：${item.scoreEvidence}`);
    lines.push(
      `- 寓意资料：${item.source_status === "verified" ? "已记录复核" : "待核验"}；${item.source}`,
    );
    if (item.source_reference?.url)
      lines.push(`- 参考来源：${item.source_reference.url}`);
    lines.push(
      item.ranking
        ? `- ${item.ranking.notice}`
        : "- 此旧版记录的评分和卦象关联仍为演示资料。",
    );
    lines.push("");
  });
  const blob = new Blob([`\ufeff${lines.join("\n")}`], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeSurname = String(lastRequest.surname || "方案").replace(
    /[^\u4e00-\u9fa5A-Za-z0-9_-]/g,
    "",
  );
  link.href = url;
  link.download = `序名-${safeSurname || "方案"}.md`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("命名方案已下载到本地。");
}
