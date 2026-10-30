import React, { useEffect, useRef, useState } from "react";
import { downloadReportFile } from "./utils.js";
const FIELDS = [
  "surname",
  "mode",
  "purpose",
  "gender",
  "zone",
  "dueDate",
  "dueTime",
  "birthDate",
  "birthTime",
  "length",
  "candidateCount",
  "place",
  "parents",
  "currentName",
  "meaning",
  "likedChars",
  "avoidedChars",
  "styles",
  "variant",
];
const newKey = () => globalThis.crypto?.randomUUID?.() || null;
const displayDate = (value) =>
  new Date(value).toLocaleString("zh-CN", { hour12: false });
export default function CustomerArea({ result, toast }) {
  const [customer, setCustomer] = useState(null),
    [available, setAvailable] = useState(false),
    [connectionFailed, setConnectionFailed] = useState(false),
    [loaded, setLoaded] = useState(false),
    [records, setRecords] = useState([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(null),
    [cooldown, setCooldown] = useState(0),
    [consent, setConsent] = useState(false),
    [deleteId, setDeleteId] = useState(null),
    [retention, setRetention] = useState(30);
  const csrf = useRef(""),
    requestKey = useRef(newKey()),
    generation = useRef(0);
  useEffect(() => {
    setConsent(false);
    requestKey.current = newKey();
  }, [result]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function api(path, data) {
    let response;
    try {
      response = await fetch(`/api/customer/${path}`, {
        method: data === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers:
          data === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "X-CSRFToken": csrf.current,
              },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    } catch {
      throw Error("暂时无法连接我的服务，请稍后重试。");
    }
    if (response.status === 401) {
      generation.current++;
      setCustomer(null);
      setRecords([]);
      setConsent(false);
    }
    const payload = await response
      .json()
      .catch(() => ({ error: "我的服务暂不可用，请稍后重试。" }));
    if (payload.csrf) csrf.current = payload.csrf;
    if (!response.ok) {
      if (payload.retry_after) setCooldown(Math.min(900, payload.retry_after));
      throw Error(payload.error || "操作未完成，请稍后再试。");
    }
    return payload;
  }
  useEffect(() => {
    let active = true;
    api("session")
      .then((data) => {
        if (!active) return;
        setCustomer(data.customer);
        setAvailable(data.sms_available);
        setRetention(data.retention_days);
      })
      .catch(() => {
        if (active) {
          setAvailable(false);
          setConnectionFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, []);
  async function refresh() {
    const current = ++generation.current;
    const data = await api("records");
    if (current === generation.current) setRecords(data.records);
  }
  useEffect(() => {
    setRecords([]);
    setDeleteId(null);
    if (customer) refresh().catch((error) => setMessage(error.message));
  }, [customer?.id]);
  async function run(task) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  function retrySession() {
    run(async () => {
      const data = await api("session");
      setCustomer(data.customer);
      setAvailable(data.sms_available);
      setRetention(data.retention_days);
      setConnectionFailed(false);
    });
  }
  function send() {
    if (!/^(\+86)?1[3-9][0-9]{9}$/.test(phone.replace(/[ -]/g, ""))) {
      setMessage("请输入有效的中国大陆手机号。");
      return;
    }
    run(async () => {
      const data = await api("request-code", { phone });
      setChallenge(data.challenge_id);
      setCooldown(data.retry_after);
      setCode("");
      setMessage("验证码已发送，五分钟内有效。");
    });
  }
  function signIn(event) {
    event.preventDefault();
    if (!challenge || !/^\d{6}$/.test(code)) {
      setMessage("请先获取验证码，再填写六位验证码。");
      return;
    }
    run(async () => {
      const data = await api("verify-code", { challenge_id: challenge, code });
      setCustomer(data.customer);
      setChallenge(null);
      setCode("");
      setPhone("");
      setConsent(false);
      requestKey.current = newKey();
      setMessage("已登录，可以主动保存本次方案或找回记录。");
    });
  }
  function signOut() {
    run(async () => {
      await api("logout", {});
      generation.current++;
      setCustomer(null);
      setRecords([]);
      setConsent(false);
      setDeleteId(null);
      setMessage("已退出账号，本地收藏仍保存在当前浏览器。");
    });
  }
  function save() {
    run(async () => {
      if (!requestKey.current)
        throw Error("请通过安全的 HTTPS 连接保存账号记录。");
      if (!result || !consent) throw Error("请确认本次信息后再保存。");
      const input = Object.fromEntries(
        FIELDS.filter((key) => result.data[key] !== undefined).map((key) => [
          key,
          result.data[key],
        ]),
      );
      await api("records/save", {
        request_key: requestKey.current,
        consent: true,
        input,
      });
      await refresh();
      setMessage("体验方案已保存，可在同一手机号下找回；不会产生费用。");
    });
  }
  function download(id) {
    run(async () => {
      const { report } = await api(`records/${id}`);
      const candidates = window.NameEngine.candidates(
        report.data,
        report.analysis,
        report.candidates,
      );
      downloadReportFile(report.data, report.analysis, candidates, toast);
    });
  }
  function remove(id) {
    run(async () => {
      await api(`records/${id}/delete`, {});
      requestKey.current = newKey();
      setConsent(false);
      setDeleteId(null);
      await refresh();
      setMessage("这份账号记录已删除，已下载的本地文件不会同步删除。");
    });
  }
  return (
    <section className="customer-area wrap" id="account" aria-label="我的服务">
      <div className="customer-intro">
        <p className="eyebrow">YOUR PRIVATE COLLECTION</p>
        <h2>
          先安心体验，
          <br />
          再留住喜欢的方向。
        </h2>
        <p>
          免费起名无需登录。手机号登录后，可主动保存本次体验方案，并在其他设备找回。
        </p>
        <div className="customer-points">
          <span>免密码登录</span>
          <span>主动选择保存</span>
          <span>账号独立保护</span>
        </div>
        <p className="customer-scope">
          当前仅提供免费体验记录，尚未开放购买。保存的候选资料仍待核验。
        </p>
      </div>
      <div className="customer-panel">
        <div className="customer-head">
          <h3>我的服务</h3>
          {customer && (
            <>
              <span>{customer.phone_mask}</span>
              <button
                type="button"
                className="secondary"
                onClick={signOut}
                disabled={busy}
              >
                退出账号
              </button>
            </>
          )}
        </div>
        {message && (
          <p className="customer-message" role="status">
            {message}
          </p>
        )}
        {!loaded ? (
          <p className="hint">正在检查账号服务…</p>
        ) : !customer ? (
          available ? (
            <form onSubmit={signIn} noValidate>
              <label>
                中国大陆手机号
                <input
                  type="tel"
                  name="customerPhone"
                  disabled={busy}
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setChallenge(null);
                    setCode("");
                  }}
                  maxLength={16}
                  placeholder="请输入手机号"
                />
              </label>
              <div className="customer-code-row">
                <label>
                  短信验证码
                  <input
                    name="customerCode"
                    disabled={busy || !challenge}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="六位验证码"
                  />
                </label>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy || cooldown > 0}
                  onClick={send}
                >
                  {cooldown > 0 ? `${cooldown} 秒后重发` : "获取验证码"}
                </button>
              </div>
              <p className="privacy-note">
                手机号用于登录与记录找回，首次验证后自动建立客户账号，无需设置密码。
              </p>
              <button
                className="primary"
                type="submit"
                disabled={busy || !challenge}
              >
                {busy ? "正在处理…" : "验证码登录 →"}
              </button>
            </form>
          ) : (
            <div className="customer-unavailable">
              <strong>
                {connectionFailed ? "账号服务暂时不可用" : "手机号登录暂未开通"}
              </strong>
              <p>免费体验、本地收藏、下载方案与制作心愿卡均可直接使用。</p>
              <a className="primary" href="#form">
                继续免费体验 ↗
              </a>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={retrySession}
              >
                刷新账号状态
              </button>
            </div>
          )
        ) : (
          <>
            <div className="customer-save">
              <strong>把当前体验方案保存到账号</strong>
              <p>
                会保存本次出生信息、命名偏好及方案，保留 {retention}{" "}
                天。你可以随时删除账号中的记录。
              </p>
              <label className="customer-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={!result?.candidates?.length || busy}
                />
                <span>我确认保存本次信息与体验方案。</span>
              </label>
              <button
                className="primary"
                type="button"
                disabled={busy || !consent || !result?.candidates?.length}
                onClick={save}
              >
                保存当前体验方案
              </button>
              {!result?.candidates?.length && (
                <small className="field-hint">
                  先在上方生成一份有候选的方案，再选择保存。
                </small>
              )}
            </div>
            <div className="customer-records-head">
              <h4>已保存的体验记录</h4>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => run(refresh)}
              >
                刷新记录
              </button>
            </div>
            {records.length ? (
              <ul className="customer-records">
                {records.map((record) => (
                  <li key={record.id}>
                    <div>
                      <b>免费体验方案 · {record.candidate_count} 个候选</b>
                      <small>
                        保存于 {displayDate(record.created_at)}
                        <br />
                        保留至 {displayDate(record.expires_at)}
                      </small>
                    </div>
                    <div className="customer-record-actions">
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => download(record.id)}
                      >
                        获取报告
                      </button>
                      <button
                        className="customer-delete"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          deleteId === record.id
                            ? remove(record.id)
                            : setDeleteId(record.id)
                        }
                      >
                        {deleteId === record.id ? "确认删除" : "删除"}
                      </button>
                      {deleteId === record.id && (
                        <button
                          className="customer-delete"
                          type="button"
                          disabled={busy}
                          onClick={() => setDeleteId(null)}
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="customer-empty">
                还没有保存记录。你可以先完成免费体验，再决定是否保存。
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
