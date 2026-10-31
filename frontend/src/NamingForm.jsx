import React, { useEffect, useRef, useState } from "react";
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
    [length, setLength] = useState("2");
  const formRef = useRef(null);
  const max = Math.max(1, Math.min(11, Number(counts[length]) || 11));
  useEffect(() => {
    const field = formRef.current?.elements.candidateCount;
    if (field && Number(field.value) > max) field.value = String(max);
  }, [max]);
  useEffect(() => {
    if (message)
      formRef.current
        ?.querySelector("#formMessage")
        ?.scrollIntoView({
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
      if (field) requestAnimationFrame(() => field.focus());
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
        <p>先选择起名场景并填写信息，当前版本提供演示候选和寓意参考。</p>
        <div className="form-helper">
          <b>先填最少信息也能开始</b>
          <span>姓氏、场景和时间是必填；父母姓氏与偏好可以之后补充。</span>
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
      <form id="namingForm" ref={formRef} onSubmit={submit} noValidate>
        <p className="demo-notice">
          <b>排盘口径</b> 年柱以立春、月柱以节气交接为界，日柱采用当地时间 23:00
          换日。候选名、评分及卦象仍是待核验的演示资料。
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
              <input name="parents" maxLength={4} placeholder="例如：林、沈" />
              <small className="field-hint">
                仅记录家庭线索，暂不参与候选排序
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
              <small className="field-hint">例如“林知衡”选择两字名</small>
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
                可生成 1–{max} 个，候选资料仍待核验。
              </small>
            </label>
            <label>
              性别
              <select name="gender" defaultValue="unknown">
                <option value="unknown">未知</option>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
              <small className="field-hint">未知也可以生成中性方案</small>
            </label>
          </div>
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
