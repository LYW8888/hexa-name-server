import React, {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { formRequest, nameReviewKey } from "./form-state.js";
import { requestNameReview } from "./analysis.js";
import NameReview from "./NameReview.jsx";
import { Chart } from "./Results.jsx";
import LOCATIONS from "../../data/locations.json";
import { friendlyError, getClockInZone } from "./utils.js";

export default forwardRef(function NamingForm(
  { onGenerate, busy, counts, message, setMessage, toast, onDraftChange },
  controller,
) {
  const [step, setStep] = useState(0),
    [review, setReview] = useState(null),
    [reviewBusy, setReviewBusy] = useState(false),
    [acceptedReview, setAcceptedReview] = useState(null),
    [purpose, setPurpose] = useState("newborn"),
    [mode, setMode] = useState("due_date"),
    [length, setLength] = useState("2"),
    [draft, setDraft] = useState({}),
    [elementPreference, setElementPreference] = useState("yongshen"),
    [timeBasis, setTimeBasis] = useState("civil"),
    [furthest, setFurthest] = useState(0),
    [dates, setDates] = useState({
      dueDate: "",
      dueTime: "12:00",
      birthDate: "",
      birthTime: "",
    });
  const formRef = useRef(null),
    invalidField = useRef(null),
    reviewInFlight = useRef(false);
  const rename = purpose === "rename";
  const preferenceStep = rename ? 3 : 2;
  const labels = rename ? ["对象与现名", "出生信息", "现名分析", "改名偏好"] : ["对象与姓氏", "出生信息", "偏好与寓意"];
  const locked = busy || reviewBusy;
  const reviewCurrent = !!review && nameReviewKey(draft) === review.key;
  const max = Math.max(1, Math.min(11, Number(counts[length]) || 11));
  useLayoutEffect(() => {
    if (message && !invalidField.current) {
      const element = formRef.current?.querySelector("#formMessage");
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, [message]);
  function capture() {
    if (!formRef.current) return;
    const data = formRequest(formRef.current);
    setDraft(data);
    onDraftChange?.(data);
  }
  function clearError() {
    invalidField.current?.removeAttribute("aria-invalid");
    invalidField.current?.removeAttribute("aria-describedby");
    invalidField.current = null;
    setMessage("");
  }
  function openStep(index, fieldName) {
    clearError();
    setStep(index);
    setFurthest((value) => Math.max(value, index));
    requestAnimationFrame(() => {
      const panel = formRef.current.querySelectorAll(".panel")[index];
      const field = fieldName
        ? formRef.current.elements[fieldName]
        : panel.querySelector("legend");
      const disclosure = field?.closest("details");
      if (disclosure) disclosure.open = true;
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({
        behavior: "instant",
        block: "start",
      });
    });
  }
  function navigate(index) {
    if (locked) return;
    if (index > step) for (let i = 0; i < index; i++) if (!validate(i)) return;
    if (rename && index >= 2 && !reviewCurrent) {
      analyzeCurrentName();
      return;
    }
    if (rename && index > 2 && acceptedReview !== review.key) {
      openStep(2);
      return;
    }
    openStep(index);
  }
  async function analyzeCurrentName() {
    if (locked || reviewInFlight.current || !validate(0) || !validate(1)) return;
    const data = formRequest(formRef.current);
    reviewInFlight.current = true;
    setReviewBusy(true);
    setMessage("");
    try {
      const payload = await requestNameReview(data);
      setReview({ payload, key: nameReviewKey(data) });
      setDraft(data);
      onDraftChange?.(data);
      setAcceptedReview(null);
      openStep(2);
    } catch (error) {
      setMessage(friendlyError(error.message));
    } finally {
      reviewInFlight.current = false;
      setReviewBusy(false);
    }
  }
  useImperativeHandle(controller, () => ({
    openStep: (index, field) => {
      if (rename && index === 2 && (!reviewCurrent || acceptedReview !== review?.key)) navigate(preferenceStep);
      else openStep(index === 2 ? preferenceStep : index, field);
    },
    resume: () => openStep(step),
    submit: submitFinal,
  }));
  useEffect(() => {
    if (!locked) capture();
  }, [purpose, mode, length, timeBasis, elementPreference]);
  useEffect(() => {
    const field = formRef.current?.elements.candidateCount;
    if (!locked && field && Number(field.value) > max) {
      field.value = String(max);
      capture();
    }
  }, [max, busy]);
  function validate(index = step) {
    const form = formRef.current,
      panel = form.querySelectorAll(".panel")[index];
    function fail(text, field) {
      setStep(index);
      setMessage(text);
      if (field) {
        const disclosure = field.closest("details");
        if (disclosure) disclosure.open = true;
        invalidField.current?.removeAttribute("aria-invalid");
        invalidField.current?.removeAttribute("aria-describedby");
        invalidField.current = field;
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", "formMessage");
        requestAnimationFrame(() => {
          field.focus({ preventScroll: true });
          field.scrollIntoView({ behavior: "instant", block: "center" });
        });
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
      if (rename) {
        const current = form.elements.currentName;
        if (!current.value.trim().startsWith(form.elements.surname.value.trim()) || [...current.value.trim()].length <= [...form.elements.surname.value.trim()].length || [...current.value.trim()].some(char => char !== "〇" && !/\p{Script=Han}/u.test(char)))
          return fail("请填写包含当前姓氏与名字的完整现用姓名，例如：林知远。", current);
      }
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
        return fail("改名必须使用实际出生信息。");
    }
    if (index === 1) {
      const birthDate = form.elements.birthDate?.value || "",
        birthTime = form.elements.birthTime?.value || "";
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
    if (index === preferenceStep) {
      const getChars = (name) => new Set([...(form.elements[name]?.value || "")].filter(c => /\p{Script=Han}/u.test(c)));
      const required = getChars("requiredChars"), excluded = new Set([...getChars("avoidedChars"), ...getChars("tabooChars")]);
      if (required.size > Number(length)) return fail("必用字的不同汉字数量不能超过名的字数。", form.elements.requiredChars);
      if ([...required].some(c => excluded.has(c))) return fail("必用字与避用字或家族避讳字有冲突，请调整。", form.elements.requiredChars);
    }
    setMessage("");
    return true;
  }
  function changePurpose(value) {
    clearError();
    setPurpose(value);
    setStep(0);
    setFurthest(0);
    setAcceptedReview(null);
    if (value === "rename") setMode("born");
  }
  function changeLength(value) {
    setLength(value);
    const maximum = Math.max(1, Math.min(11, Number(counts[value]) || 11));
    const field = formRef.current.elements.candidateCount;
    if (Number(field.value) > maximum) field.value = String(maximum);
  }
  function submitFinal() {
    if (locked) return;
    if (!validate(0) || !validate(1)) return;
    const current = formRequest(formRef.current);
    if (rename && (!review || nameReviewKey(current) !== review.key)) {
      analyzeCurrentName();
      return;
    }
    if (rename && acceptedReview !== review.key) {
      openStep(2);
      return;
    }
    if (!validate(preferenceStep)) return;
    clearError();
    const data = formRequest(formRef.current);
    setDraft(data);
    onDraftChange?.(data);
    onGenerate(data);
  }
  function submit(event) {
    event.preventDefault();
    if (locked) return;
    if (step < preferenceStep) {
      navigate(step + 1);
      return;
    }
    submitFinal();
  }
  function dateFields(kind) {
    const due = kind === "due",
      dateName = due ? "dueDate" : "birthDate",
      timeName = due ? "dueTime" : "birthTime";
    const required = true;
    return (
      <div className="grid date-fields">
        <label>
          <span id={due ? "dueDateLabel" : "birthDateLabel"}>
            {due ? "预产期日期" : "实际出生日期"}
            {required ? "（必填）" : "（可选）"}
          </span>
          <input
            name={dateName}
            type="date"
            min="1900-01-01"
            max="2100-12-31"
            required={required}
            value={dates[dateName]}
            onChange={(e) =>
              setDates((v) => ({ ...v, [dateName]: e.target.value }))
            }
          />
        </label>
        <label>
          <span id={due ? "dueTimeLabel" : "birthTimeLabel"}>
            {due ? "预产期参考时间" : "准确出生时间"}
          </span>
          <input
            name={timeName}
            type="time"
            required={!due && born}
            value={dates[timeName]}
            onChange={(e) =>
              setDates((v) => ({ ...v, [timeName]: e.target.value }))
            }
          />
          {due && (
            <small className="field-hint">
              默认12:00作参考；允许未来日期。出生后请切换“已出生起名”重新计算。
            </small>
          )}
        </label>
      </div>
    );
  }
  const born = mode === "born";
  const hint = rename
    ? "改名只使用实际出生日期与准确出生时间。完成后先分析现用姓名，再设置改名偏好。"
    : born
      ? "只使用实际出生日期与准确出生时间，不使用预产期；出生时间不能晚于当前时间。"
      : "只使用预产期及参考时间，允许未来日期；实际出生后请切换到已出生起名。";
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
        onChange={(event) => {
          if (invalidField.current?.name === event.target.name) clearError();
          capture();
        }}
        aria-busy={locked}
        noValidate
      >
        <input type="hidden" name="algorithm" value="literary_v3" />
        <p className="demo-notice">
          <b>每个名字都有理由</b>{" "}
          四柱、阴阳五行与生辰起卦可以展开复算；匹配指数帮助比较本次用字偏好。
        </p>
        <div className={`progress ${rename ? "rename-progress" : ""}`} aria-label="起名步骤">
          {labels.map((label, index) => (
            <React.Fragment key={label}>
              {index > 0 && <i />}
              <button
                type="button"
                className={index <= step ? "active" : ""}
                aria-current={index === step ? "step" : undefined}
                disabled={locked || index > furthest}
                onClick={() => navigate(index)}
              >
                {String(index + 1).padStart(2, "0")} <b>{label}</b>
              </button>
            </React.Fragment>
          ))}
        </div>

        <div
          id="formMessage"
          tabIndex={-1}
          className="form-message error"
          role="alert"
          aria-live="polite"
          hidden={!message}
        >
          {message}
        </div>
        <fieldset
          className={`panel ${step === 0 ? "active" : ""}`}
          disabled={locked}
        >
          <legend tabIndex={-1}>{rename ? "对象与现用姓名" : "对象与姓氏"}</legend>
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
                改名<small>先分析现用姓名，再推荐改名方案</small>
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
              现用姓名（改名必填）
              <input
                name="currentName"
                required={rename}
                maxLength={20}
                disabled={purpose !== "rename"}
                placeholder="例如：林知远"
              />
              <small className="field-hint">填写含姓氏的完整姓名，用于生成现名分析报告</small>
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
          <details className="family-options">
            <summary>家庭姓氏与读音设置（可选）</summary>{" "}
            <label>
              父母姓氏（可选）
              <input name="parents" maxLength={12} placeholder="例如：林、沈" />
              <small className="field-hint">
                默认只记录；勾选下方选项才参与用字偏好
              </small>
            </label>
            <label>姓氏读音（多音姓可填）
              <input name="surnameReading" maxLength={32} placeholder="例如：shàn；复姓读音用空格分开" />
              <small className="field-hint">留空按字典及常用姓氏读音；单、解、区等姓氏可指定自家读法。</small>
            </label>
            <label className="inline-check">
              <input type="checkbox" name="honorParents" value="true" />
              希望名中呼应父母姓氏（排序偏好，可不选）
            </label>
          </details>
          <button
            className="primary next"
            type="button"
            onClick={() => {
              navigate(1);
            }}
          >
            继续 →
          </button>
        </fieldset>
        <fieldset
          className={`panel ${step === 1 ? "active" : ""}`}
          disabled={locked}
        >
          <legend tabIndex={-1}>出生信息</legend>
          <div className="choices" hidden={purpose === "rename"}>
            <label>
              <input
                type="radio"
                name="mode"
                value="due_date"
                disabled={purpose === "rename"}
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
          <p className="date-primary-label">
            {born ? "按实际出生信息生成" : "先用预产期探索名字"}
          </p>
          {dateFields(born ? "birth" : "due")}
          <div className="grid">
            <label>
              {born ? "出生地点" : "预计出生地点"}
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
          <p className="birth-basis-preview">
            本次时间依据：
            {born
              ? `实际出生 ${dates.birthDate || "待填写日期"} ${dates.birthTime || "待填写时间"}`
              : `预产期 ${dates.dueDate || "待填写日期"} ${dates.dueTime || "12:00"}（参考）`}
          </p>
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
                openStep(0);
              }}
            >
              返回
            </button>
            <button
              type="button"
              hidden={rename}
              className="secondary quick-generate"
              disabled={locked}
              onClick={submitFinal}
            >
              跳过偏好，先生成
            </button>
            <button
              className="primary next"
              type="button"
              onClick={() => {
                navigate(2);
              }}
            >
              {reviewBusy ? "正在分析现名…" : rename ? "分析现用姓名 →" : "继续 →"}
            </button>
          </div>
        </fieldset>
        {rename && <fieldset className={`panel ${step === 2 ? "active" : ""}`} disabled={locked}>
          <legend tabIndex={-1}>现用姓名分析</legend>
          {reviewCurrent ? <>
            <NameReview review={review.payload.analysis.name_review} id="formNameReview" />
            <details className="review-chart"><summary>查看现名分析采用的四柱与起卦依据</summary><Chart analysis={review.payload.analysis} id="reviewTraditionalBasis" /></details>
            <div className="actions">
              <button type="button" className="secondary back" onClick={() => openStep(1)}>返回修改出生信息</button>
              <button type="button" className="primary next" onClick={() => { setAcceptedReview(review.key); openStep(3); }}>继续，设置改名偏好 →</button>
            </div>
          </> : <div className="review-stale"><p>现用姓名或出生信息已变更，请重新分析后继续。</p><button type="button" className="primary" onClick={analyzeCurrentName}>重新分析现用姓名</button></div>}
        </fieldset>}
        <fieldset
          className={`panel ${step === preferenceStep ? "active" : ""}`}
          disabled={locked}
        >
          <legend tabIndex={-1}>{rename ? "改名偏好与寓意" : "偏好与寓意"}</legend>
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
          <details className="naming-constraints">
            <summary>必用字、家族避讳与数理设置（可选）</summary>
            <div className="grid">
              <label>辈分或必用字<input name="requiredChars" maxLength={30} placeholder="例如：知（每个字至少出现一次）" /><small className="field-hint">严格满足，与“喜欢的字”排序偏好分别处理。</small></label>
              <label>家族避讳字<input name="tabooChars" maxLength={100} placeholder="只填需要避开的字，不必提供长辈完整姓名" /><small className="field-hint">仅排除名中用字，不排除姓氏。</small></label>
            </div>
            <label className="inline-check"><input type="checkbox" name="tabooHomophones" value="true" />同时避开这些字的普通话同音字</label>
            <label>五格数理<select name="numerologyMode" defaultValue="reference"><option value="reference">展示计算参考</option><option value="strict">严格筛选人格、地格、总格</option><option value="off">关闭五格展示</option></select><small className="field-hint">使用有记录的康熙笔画。严格模式会排除三格含凶数或笔画不完整的候选，可能减少数量。</small></label>
          </details>
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
                  openStep(0);
                }}
              >
                修改基本信息
              </button>
              <button
                type="button"
                onClick={() => {
                  openStep(1);
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
              {born
                ? `采用实际出生 ${draft.birthDate || "待填写"} ${draft.birthTime || "待填写"}`
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
              {rename ? `改名：${draft.currentName || "待填写现名"}。先完成现名分析，再推荐新方案。` : born ? "已出生起名：采用实际出生时间。" : "预产期起名：仅作出生前参考，出生后需按实际时间重新生成。"}出生信息不会自动保存。
            </small>
          </section>
          <div className="actions">
            <button
              className="secondary back"
              type="button"
              onClick={() => {
                openStep(rename ? 2 : 1);
              }}
            >
              返回
            </button>
            <button
              className="primary"
              type="submit"
              disabled={locked}
              aria-busy={locked}
            >
              {busy ? "正在整理…" : rename ? "生成改名方案 ✦" : "生成名字方案 ✦"}
            </button>
          </div>
        </fieldset>
        <p className="generation-progress" role="status" hidden={!locked}>
          {reviewBusy ? "正在整理现名分析与出生四柱，请稍候…" : "正在整理名字与四柱参考，请稍候…"}
        </p>
      </form>
    </section>
  );
});
