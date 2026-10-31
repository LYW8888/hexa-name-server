import React, { useEffect, useRef, useState } from "react";
import LOCATIONS from "../../data/locations.json";
import { getClockInZone } from "./utils.js";

const LABELS = ["对象与姓氏", "出生信息", "偏好与寓意"];
export default function NamingForm({
  onGenerate,
  busy,
  counts,
  message,
  setMessage,
  toast,
}) {
  const [step, setStep] = useState(0),
    [purpose, setPurpose] = useState("newborn"),
    [mode, setMode] = useState("due_date"),
    [length, setLength] = useState("2"),
    [draft, setDraft] = useState({}),
    [elementPreference, setElementPreference] = useState("yongshen"),
    [timeBasis, setTimeBasis] = useState("civil");
  const formRef = useRef(null);
  const max = Math.max(1, Math.min(11, Number(counts[length]) || 11));
  useEffect(() => {
    const field = formRef.current?.elements.candidateCount;
    if (field && Number(field.value) > max) field.value = String(max);
  }, [max]);
  useEffect(() => {
    if (message)
      formRef.current?.querySelector("#formMessage")?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
  }, [message]);
  function validate(index = step) {
    const form = formRef.current,
      panel = form.querySelectorAll(".panel")[index];
    function fail(text, field) {
      setStep(index);
      setMessage(text);
      if (field) {
        const disclosure = field.closest("details");
        if (disclosure) disclosure.open = true;
        requestAnimationFrame(() => field.focus());
      }
      return false;
    }
    const invalid = [...panel.querySelectorAll("input,select,textarea")].find(
      (field) => !field.checkValidity(),
    );
    if (invalid) {
      if (invalid.name === "candidateCount")
        return fail(`生成名字数量请输入 1–${max} 个整数。`, invalid);
      const label = invalid.closest("label");
      const span = label?.querySelector("span");
      const text = [...(label?.childNodes || [])].find(
        (node) => node.nodeType === 3 && node.textContent.trim(),
      );
      return fail(
        `请检查“${span?.textContent.trim() || text?.textContent.trim() || "必填项"}”，按提示填写完整。`,
        invalid,
      );
    }
    if (index === 0) {
      const field = form.elements.surname,
        characters = [...field.value.trim()];
      if (
        characters.length < 1 ||
        characters.length > 2 ||
        characters.some(
          (char) => char !== "〇" && !/\p{Script=Han}/u.test(char),
        )
      ) {
        return fail("姓氏请填写 1–2 个汉字，支持复姓。", field);
      }
      if (purpose === "rename" && mode !== "born")
        return fail("成人改名需要选择已出生信息流程。");
    }
    if (index === 1) {
      const birthDate = form.elements.birthDate.value,
        birthTime = form.elements.birthTime.value;
      if ((birthDate && !birthTime) || (!birthDate && birthTime))
        return fail(
          "出生日期和准确出生时间需要同时填写；如果尚未出生，可以都留空。",
          birthDate ? form.elements.birthTime : form.elements.birthDate,
        );
      if (mode === "born" && (!birthDate || !birthTime))
        return fail("已出生起名需要填写出生日期和准确出生时间。");
      if (!form.elements.place.value.trim())
        return fail("请填写出生地点。", form.elements.place);
      const clock = getClockInZone(form.elements.zone.value);
      if (birthDate && birthDate > clock.date)
        return fail(
          "实际出生日期不能晚于今天；预产期可以是未来时间。",
          form.elements.birthDate,
        );
      if (birthDate && birthDate === clock.date && birthTime) {
        const [hours, minutes] = birthTime.split(":").map(Number);
        if (hours * 60 + minutes > clock.minutes)
          return fail(
            "出生时间不能晚于当前时间；预产期可以填写未来时间。",
            form.elements.birthTime,
          );
      }
    }
    setMessage("");
    return true;
  }
  function changePurpose(value) {
    setPurpose(value);
    setMessage("");
    if (value === "rename") {
      setMode("born");
      toast("成人改名已切换到已出生信息流程。", "info");
    }
  }
  function changeLength(value) {
    setLength(value);
    const maximum = Math.max(1, Math.min(11, Number(counts[value]) || 11));
    const field = formRef.current.elements.candidateCount;
    if (Number(field.value) > maximum) field.value = String(maximum);
  }
  function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (step < 2) {
      if (validate()) setStep(step + 1);
      return;
    }
    for (let index = 0; index < 3; index++) if (!validate(index)) return;
    const fd = new FormData(formRef.current);
    const data = Object.fromEntries(fd.entries());
    data.surname = data.surname.trim();
    data.styles = fd.getAll("style");
    data.variant = 0;
    try {
      onGenerate(data);
    } catch {
      setMessage("页面提交未完成，请刷新后重新生成。");
    }
  }
  const born = mode === "born";
  const hint =
    purpose === "rename"
      ? "成人改名按已出生信息整理，填写实际出生日期和准确时间；预产期可留空。"
      : born
        ? "已出生模式要求填写实际出生日期和准确时间；预产期可以同时保留，用于结果对照。实际出生日期不能晚于今天。"
        : "预产期可以是未来日期和时间；尚未出生时填写预产期即可，出生日期和准确时间可以之后补充。";
  return (
    <section className="form-section wrap" id="form">
      <div className="intro">
        <p className="eyebrow">BEGIN WITH THE ESSENTIALS</p>
        <h2>
          先告诉我们，
          <br />
          这个名字要陪谁走一生。
        </h2>
        <p>从家庭心意开始，把传统计算和日常读写一起考虑。</p>
        <div className="form-helper">
          <b>先填最少信息也能开始</b>
          <span>约 1 分钟完成；预产期可用未来日期，偏好可以留空。</span>
        </div>
        <div className="journey" aria-hidden="true">
          {[
            ["01", "从姓氏开始"],
            ["02", "记录出生时光"],
            ["03", "写下美好期待"],
          ].map(([number, label], index) => (
            <div
              className={
                index === step ? "current" : index < step ? "complete" : ""
              }
              key={number}
            >
              <span>{index < step ? "✓" : number}</span>
              <b>{label}</b>
            </div>
          ))}
        </div>
      </div>
      <form
        id="namingForm"
        ref={formRef}
        onSubmit={submit}
        onChange={() =>
          setDraft(Object.fromEntries(new FormData(formRef.current).entries()))
        }
        noValidate
      >
        <p className="demo-notice">
          <b>每个名字都有理由</b>{" "}
          四柱、阴阳五行与生辰起卦可以展开复算；匹配指数帮助比较本次用字偏好。
        </p>
        <div className="progress" aria-label="起名步骤">
          {LABELS.map((label, index) => (
            <React.Fragment key={label}>
              {index > 0 && <i />}
              <span
                className={index <= step ? "active" : ""}
                aria-current={index === step ? "step" : undefined}
              >
                {String(index + 1).padStart(2, "0")} <b>{label}</b>
              </span>
            </React.Fragment>
          ))}
        </div>

        <fieldset className={`panel ${step === 0 ? "active" : ""}`}>
          <legend>对象与姓氏</legend>
          <div
            className="choices purpose-choices"
            role="group"
            aria-label="使用场景"
          >
            <label>
              <input
                type="radio"
                name="purpose"
                value="newborn"
                checked={purpose === "newborn"}
                onChange={() => changePurpose("newborn")}
              />
              <strong>新</strong>
              <span>
                新生儿起名<small>支持预产期与出生后两种时点</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="purpose"
                value="rename"
                checked={purpose === "rename"}
                onChange={() => changePurpose("rename")}
              />
              <strong>改</strong>
              <span>
                成人改名<small>按已出生信息整理新名字方向</small>
              </span>
            </label>
          </div>
          <div className="choices">
            <label>
              <input
                type="radio"
                name="mode"
                value="due_date"
                checked={mode === "due_date"}
                onChange={() => {
                  setMode("due_date");
                  setMessage("");
                }}
              />
              <strong>期</strong>
              <span>
                按预产期起名<small>使用预产期和默认参考时间</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                value="born"
                checked={mode === "born"}
                onChange={() => {
                  setMode("born");
                  setMessage("");
                }}
              />
              <strong>生</strong>
              <span>
                已出生起名<small>使用准确出生日期和时间</small>
              </span>
            </label>
          </div>
          <div className="grid">
            <label>
              姓氏
              <input
                name="surname"
                required
                maxLength={4}
                placeholder="例如：林"
              />
              <small className="field-hint">支持单姓或复姓</small>
            </label>
            <label
              id="currentNameField"
              hidden={purpose !== "rename"}
              aria-hidden={purpose !== "rename"}
            >
              现用姓名（改名时可填）
              <input
                name="currentName"
                maxLength={20}
                disabled={purpose !== "rename"}
                placeholder="例如：林知远"
              />
              <small className="field-hint">仅用于对照，不参与公开展示</small>
            </label>
            <label>
              父母姓氏（可选）
              <input name="parents" maxLength={12} placeholder="例如：林、沈" />
              <small className="field-hint">
                默认只记录；勾选下方选项才参与用字偏好
              </small>
            </label>
            <label>
              名的字数（不含姓氏）
              <select
                name="length"
                value={length}
                onChange={(e) => changeLength(e.target.value)}
              >
                <option value="2">两字名</option>
                <option value="1">单字名</option>
                <option value="3">三字名</option>
              </select>
              <small className="field-hint">
                全名示例：{draft.surname || "林"}
                {length === "1"
                  ? "桐"
                  : length === "2"
                    ? "沐安"
                    : "沐知安"}，共{" "}
                {[...(draft.surname || "林")].length + Number(length)} 字
              </small>
            </label>
            <label>
              生成名字数量
              <input
                name="candidateCount"
                type="number"
                min="1"
                max={max}
                defaultValue="3"
                required
                inputMode="numeric"
              />
              <small className="field-hint" id="candidateCountHint">
                当前
                {length === "1"
                  ? "单字名"
                  : length === "2"
                    ? "两字名"
                    : "三字名"}
                可生成 1–{max} 个；不足时只展示实际匹配的候选。
              </small>
            </label>
            <label>
              性别
              <select name="gender" defaultValue="unknown">
                <option value="unknown">未知</option>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
              <small className="field-hint">
                未知不限制性别倾向；也适合尚未确定时使用
              </small>
            </label>
          </div>
          <label className="inline-check">
            <input type="checkbox" name="honorParents" value="true" />
            希望名中呼应父母姓氏（排序偏好，可不选）
          </label>
          <button
            className="primary next"
            type="button"
            onClick={() => {
              if (validate()) setStep(1);
            }}
          >
            继续 →
          </button>
        </fieldset>
        <fieldset className={`panel ${step === 1 ? "active" : ""}`}>
          <legend>出生信息</legend>
          <div className="grid">
            <label>
              <span id="dueDateLabel">预产期日期</span>
              <input
                name="dueDate"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                required={!born}
              />
            </label>
            <label>
              预产期参考时间
              <input name="dueTime" type="time" defaultValue="12:00" />
              <small className="field-hint">
                默认 12:00，可修改；出生后以实际时间为准。
              </small>
            </label>
            <label>
              <span id="birthDateLabel">出生日期（已出生时填写）</span>
              <input
                name="birthDate"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                required={born}
              />
            </label>
            <label>
              <span id="birthTimeLabel">准确出生时间（已出生时填写）</span>
              <input name="birthTime" type="time" required={born} />
            </label>
            <label>
              出生地点
              <input name="place" required placeholder="例如：杭州，中国" />
            </label>
            <label>
              时区
              <select name="zone" defaultValue="Asia/Shanghai">
                <option value="Asia/Shanghai">中国标准时间 UTC+8</option>
                <option value="Asia/Taipei">台北时间 UTC+8</option>
                <option value="Asia/Hong_Kong">香港时间 UTC+8</option>
              </select>
            </label>
          </div>
          <details className="time-settings">
            <summary>
              排盘时间设置 · {timeBasis === "civil" ? "民用时钟" : "真太阳时"}
            </summary>
            <label>
              日柱与时柱的时间口径
              <select
                name="timeBasis"
                value={timeBasis}
                onChange={(e) => setTimeBasis(e.target.value)}
              >
                <option value="civil">当地民用时钟</option>
                <option value="apparent_solar">
                  真太阳时（按出生地经度修正）
                </option>
              </select>
            </label>
            {timeBasis === "apparent_solar" && (
              <div className="grid solar-fields">
                <label>
                  快速选择城市中心（可选）
                  <select
                    name="locationId"
                    defaultValue=""
                    onChange={(e) => {
                      const city = LOCATIONS.cities.find(
                        (x) => x.id === e.target.value,
                      );
                      if (city) {
                        const f = formRef.current;
                        f.elements.longitude.value = String(city.longitude);
                        f.elements.place.value = city.name;
                        f.elements.zone.value = city.zone;
                      }
                    }}
                  >
                    <option value="">手动输入经度</option>
                    {LOCATIONS.cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.longitude}°E
                      </option>
                    ))}
                  </select>
                  <small className="field-hint">
                    城市中心仅为近似位置，可以修改为医院或实际出生地经度。
                  </small>
                </label>
                <label>
                  出生地经度（东经为正）
                  <input
                    name="longitude"
                    type="number"
                    min="-180"
                    max="180"
                    step="0.000001"
                    required
                    placeholder="例如：120.16"
                  />
                  <small className="field-hint">
                    西经输入负数；无需定位授权。经度只用于本次计算。
                  </small>
                </label>
              </div>
            )}
            <p className="hint">
              真太阳时同时考虑经度、历史时区/夏令时及均时差，会改变日柱或时柱；年、月柱仍以实际节气交接时刻为准。
            </p>
          </details>
          <p className="hint" id="birthHint">
            {hint}
          </p>
          <p className="privacy-note">
            出生信息只用于本次分析，不会写入浏览器收藏；你可以随时清除已收藏的名字。
          </p>
          <div className="actions">
            <button
              className="secondary back"
              type="button"
              onClick={() => {
                setMessage("");
                setStep(0);
              }}
            >
              返回
            </button>
            <button
              className="primary next"
              type="button"
              onClick={() => {
                if (validate()) setStep(2);
              }}
            >
              继续 →
            </button>
          </div>
        </fieldset>
        <fieldset className={`panel ${step === 2 ? "active" : ""}`}>
          <legend>偏好与寓意</legend>
          <label>
            希望名字传达的气质
            <textarea
              name="meaning"
              rows="3"
              placeholder="例如：清朗、坚韧、知行合一，与自然有关"
            />
          </label>
          <div className="grid">
            <label>
              喜欢的字（可选）
              <input
                name="likedChars"
                maxLength={100}
                placeholder="例如：安、清"
              />
              <small className="field-hint">
                作为排序偏好，不保证每个名字都包含。
              </small>
            </label>
            <label>
              必须避开的字（可选）
              <input
                name="avoidedChars"
                maxLength={100}
                placeholder="例如：伟、刚"
              />
              <small className="field-hint">
                逐字排除，作用于名，不包含姓氏。
              </small>
            </label>
          </div>
          <div className="tags">
            <span>偏好风格</span>
            {[
              ["classical", "清雅古典"],
              ["modern", "现代简洁"],
              ["nature", "自然山水"],
              ["bright", "明朗开阔"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  name="style"
                  value={value}
                  defaultChecked={value === "classical"}
                />
                {label}
              </label>
            ))}
          </div>
          <label className="reference-choice">
            传统文化选字参考
            <select
              name="elementPreference"
              value={elementPreference}
              onChange={(e) => setElementPreference(e.target.value)}
            >
              <option value="yongshen">按四柱喜用参考（月令扶抑法）</option>
              <option value="auto">按生辰起卦的体卦五行意象</option>
              <option value="none">仅按读音、风格和心意用字</option>
              {["木", "火", "土", "金", "水"].map((x) => (
                <option key={x} value={x}>
                  自选{x}意象
                </option>
              ))}
            </select>
            <small className="field-hint">
              {elementPreference === "yongshen"
                ? "结合月令、藏干与日主生克整理方向；多种组合并存时，优先按读音、风格与心意用字排序。"
                : elementPreference === "auto"
                  ? "生辰按年月日时起卦，再与汉字部首规则匹配。体卦五行不等于八字喜用神。"
                  : elementPreference === "none"
                    ? "四柱和起卦仍会计算，字形五行不参与排序。"
                    : "按你的选择匹配字形意象，不作补缺或运势判断。"}
            </small>
          </label>
          <section className="request-review" aria-label="生成前确认">
            <div>
              <b>生成前，再看一眼</b>
              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setStep(0);
                }}
              >
                修改基本信息
              </button>
              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setStep(1);
                }}
              >
                修改出生信息
              </button>
            </div>
            <p>
              {draft.surname || "待填写姓氏"} · {length} 字名（不含姓） ·{" "}
              {draft.candidateCount || 3} 个候选
            </p>
            <p>
              {draft.birthDate && draft.birthTime
                ? `采用实际出生 ${draft.birthDate} ${draft.birthTime}`
                : `预产期参考 ${draft.dueDate || "待填写"} ${draft.dueTime || "12:00"}`}{" "}
              · {draft.place || "待填写地点"}
            </p>
            <p>
              时间口径：
              {timeBasis === "civil"
                ? "当地民用时钟"
                : `真太阳时 · 经度 ${draft.longitude || "待填写"}°`}
            </p>
            <small>
              预产期与出生信息可以并存；两者齐全时，采用实际出生时间。出生信息不会自动保存。
            </small>
          </section>
          <div className="actions">
            <button
              className="secondary back"
              type="button"
              onClick={() => {
                setMessage("");
                setStep(1);
              }}
            >
              返回
            </button>
            <button
              className="primary"
              type="submit"
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "正在整理…" : "生成名字方案 ✦"}
            </button>
          </div>
        </fieldset>
        <p className="generation-progress" role="status" hidden={!busy}>
          正在整理名字与四柱参考，请稍候…
        </p>
        <div
          id="formMessage"
          className="form-message error"
          role="alert"
          aria-live="polite"
          hidden={!message}
        >
          {message}
        </div>
      </form>
    </section>
  );
}
