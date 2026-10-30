import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const roles = {
  owner: "经营者",
  support: "客服",
  finance: "财务",
  delivery: "交付",
};
const states = {
  open: "待处理",
  in_progress: "处理中",
  resolved: "已解决",
  closed: "已关闭",
  ready: "待开始",
  processing: "执行中",
  failed: "待重试",
  delivered: "已交付",
  manual_review: "转人工",
};
const categories = {
  usage: "使用问题",
  naming: "命名咨询",
  technical: "技术问题",
  delivery: "交付问题",
  billing_exception: "收款异常",
  other: "其他",
};
const moves = {
  open: ["in_progress", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
};
const money = (value) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(
    value / 100,
  );
const date = (value) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
function Confirm({ label, onConfirm, disabled }) {
  const [armed, setArmed] = useState(false);
  return (
    <span className="confirm-action">
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          armed ? (setArmed(false), onConfirm()) : setArmed(true)
        }
      >
        {armed ? `确认${label}` : label}
      </button>
      {armed && (
        <button type="button" onClick={() => setArmed(false)}>
          取消
        </button>
      )}
    </span>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState("overview"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [rows, setRows] = useState([]),
    [summary, setSummary] = useState(null),
    [enrollment, setEnrollment] = useState(null);
  const csrf = useRef(""),
    refreshEpoch = useRef(0),
    viewKey = useRef("");
  viewKey.current = `${user?.id || ""}:${tab}`;
  const api = useCallback(async (path, data) => {
    let response;
    try {
      response = await fetch(path, {
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
      throw Error("无法连接后台，请检查网络后刷新重试。");
    }
    if (response.status === 401) {
      setUser(null);
      setRows([]);
      setSummary(null);
      setEnrollment(null);
    }
    const result = await response
      .json()
      .catch(() => ({ error: "后台响应异常，请刷新后重试。" }));
    if (result.csrf) csrf.current = result.csrf;
    if (!response.ok) throw Error(result.error || "请求未完成，请稍后重试。");
    return result;
  }, []);
  useEffect(() => {
    api("/api/session")
      .then((data) => setUser(data.user))
      .catch((e) => setNotice(e.message))
      .finally(() => setReady(true));
  }, [api]);
  const refresh = useCallback(async () => {
    const key = `${user?.id || ""}:${tab}`;
    if (viewKey.current !== key) return;
    const seq = ++refreshEpoch.current;
    setRows([]);
    setSummary(null);
    if (!user || user.must_change_password) return;
    let result;
    if (tab === "overview") result = (await api("/api/overview")).summary;
    else if (tab === "users") result = (await api("/api/staff")).users;
    else if (tab === "audit")
      result = (
        await api(
          user.role === "owner" ? "/api/audit" : `/api/ops/${user.role}/audit`,
        )
      )[user.role === "owner" ? "events" : "result"];
    else if (tab === "workspace")
      result = (await api(`/api/ops/${user.role}/list`)).result;
    else return;
    if (seq !== refreshEpoch.current || viewKey.current !== key) return;
    if (tab === "overview") setSummary(result);
    else setRows(result);
  }, [api, user, tab]);
  useEffect(() => {
    setEnrollment(null);
    setNotice("");
    refresh().catch((e) => setNotice(e.message));
    return () => {
      refreshEpoch.current++;
    };
  }, [refresh]);
  async function run(task) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      return true;
    } catch (e) {
      setNotice(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const action = (name, args) =>
    run(async () => {
      await api(`/api/ops/${user.role}/${name}`, args);
      await refresh();
      setNotice("操作已完成。");
    });
  const lookupStatus = (id) =>
    run(async () => {
      const { service } = await api(`/api/service-status/${id}`);
      setNotice(
        `关联服务：${states[service.status]}；已尝试 ${service.attempts} / 3 次。`,
      );
    });
  const login = (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      data = Object.fromEntries(new FormData(form));
    run(async () => {
      const result = await api("/api/login", data);
      form.reset();
      setUser(result.user);
      setTab("overview");
    });
  };
  const password = (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      data = Object.fromEntries(new FormData(form));
    run(async () => {
      const result = await api("/api/password", data);
      form.reset();
      setUser(result.user);
      setNotice("密码已更新。");
    });
  };
  const logout = () =>
    run(async () => {
      await api("/api/logout", {});
      setUser(null);
      setRows([]);
      setSummary(null);
      setEnrollment(null);
      setTab("overview");
    });
  const message = notice && (
    <div className="admin-notice" role="status">
      {notice}
    </div>
  );
  const passwordForm = (
    <form onSubmit={password} className="admin-form">
      <Field label="当前密码">
        <input
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="新密码（至少 12 位）">
        <input
          name="new_password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          required
        />
      </Field>
      <button className="accent" disabled={busy}>
        更新密码
      </button>
    </form>
  );
  if (!ready)
    return (
      <main className="auth-page">
        <p>正在连接经营工作台…</p>
      </main>
    );
  if (!user)
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="kicker">序名 / WORKSPACE</p>
          <h1>
            每一份心意，
            <br />
            都有妥善的安排。
          </h1>
          <p className="muted">经营工作台 · 岗位独立授权</p>
          {message}
          <form onSubmit={login}>
            <Field label="员工账号">
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={64}
              />
            </Field>
            <Field label="密码">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </Field>
            <Field label="验证器动态码">
              <input
                name="token"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
            </Field>
            <button className="accent" disabled={busy}>
              {busy ? "正在验证…" : "安全登录 →"}
            </button>
          </form>
          <p className="small muted">
            使用独立员工账号与验证器登录。没有默认账号，请联系经营者开通。
          </p>
        </section>
      </main>
    );
  const tabs = [
    ["overview", "工作总览"],
    ...(user.role === "owner"
      ? [["users", "员工与权限"]]
      : [["workspace", `${roles[user.role]}工作台`]]),
    ["audit", "操作记录"],
    ["password", "修改密码"],
  ];
  return (
    <div className="admin-shell">
      <aside>
        <a className="admin-brand" href="/">
          序
          <span>
            序名<small>经营工作台</small>
          </span>
        </a>
        <p className="sidebar-caption">一次委托 · 一次交付</p>
        <nav aria-label="后台导航">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => setTab(key)}
            >
              {label}
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </nav>
        <div className="identity">
          <b>{user.username}</b>
          <span>{roles[user.role]} · 动态码验证</span>
          <button onClick={logout} disabled={busy}>
            退出登录
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header>
          <div>
            <p className="kicker">ORIGIN & NAME / OPERATIONS</p>
            <h1>
              {user.must_change_password
                ? "设置你的独立密码"
                : tabs.find((x) => x[0] === tab)?.[1]}
            </h1>
          </div>
          <button
            disabled={busy || user.must_change_password}
            onClick={() => run(refresh)}
          >
            刷新数据 ↻
          </button>
        </header>
        {message}
        {user.must_change_password ? (
          <section className="surface">
            <p>首次登录请修改初始密码，再访问岗位工作台。</p>
            {passwordForm}
          </section>
        ) : (
          <>
            {tab === "overview" && (
              <>
                <p className="muted">
                  只展示当前岗位可见的信息。收支为手工登记汇总，交付为内部状态登记。
                </p>
                <div className="summary-grid">
                  {Object.entries(summary || {}).map(([role, item]) => (
                    <section className="surface metric-card" key={role}>
                      <p className="kicker">{roles[role]} / STATUS</p>
                      <h2>{item.connected ? "岗位已连接" : "等待连接"}</h2>
                      {item.connected ? (
                        <dl>
                          {Object.entries(
                            item.data.counts || item.data.totals || {},
                          ).map(([key, value]) => (
                            <div key={key}>
                              <dt>
                                {states[key] ||
                                  { income: "收入登记", expense: "支出登记" }[
                                    key
                                  ] ||
                                  key}
                              </dt>
                              <dd>
                                {role === "finance" ? money(value) : value}
                              </dd>
                            </div>
                          ))}
                          {role === "finance" && (
                            <div>
                              <dt>登记净额</dt>
                              <dd>{money(item.data.net_recorded_fen)}</dd>
                            </div>
                          )}
                        </dl>
                      ) : (
                        <p className="muted">{item.error}</p>
                      )}
                    </section>
                  ))}
                </div>
                <div className="surface scope-card">
                  <h2>按次服务，让交付有始有终。</h2>
                  <p>
                    重复请求复用原服务，失败在原服务下重试，达到上限后转人工处理。
                  </p>
                  <p className="small muted">
                    支付、客户报告存储及真实报告交付尚未接入；这里的登记不代表收款或客户已收到报告。
                  </p>
                </div>
              </>
            )}
            {tab === "password" && (
              <section className="surface">{passwordForm}</section>
            )}
            {tab === "workspace" && (
              <>
                <section className="surface">
                  <WorkForm role={user.role} action={action} busy={busy} />
                </section>
                <section className="surface table-surface">
                  <h2>
                    最近登记 <span className="muted small">最多 200 条</span>
                  </h2>
                  <WorkTable
                    onStatus={lookupStatus}
                    role={user.role}
                    rows={rows}
                    action={action}
                    busy={busy}
                  />
                </section>
              </>
            )}
            {tab === "users" && (
              <>
                <section className="surface">
                  <h2>开通员工账号</h2>
                  <p className="muted small">
                    按实际职责选择岗位。新员工首次登录必须修改初始密码。
                  </p>
                  <form
                    className="admin-form form-grid"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const data = Object.fromEntries(new FormData(form));
                      setEnrollment(null);
                      run(async () => {
                        const result = await api("/api/staff", data);
                        form.reset();
                        await refresh();
                        setEnrollment(result);
                      });
                    }}
                  >
                    <Field label="账号">
                      <input
                        name="username"
                        pattern="[A-Za-z0-9_.-]{3,64}"
                        required
                      />
                    </Field>
                    <Field label="初始密码">
                      <input
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={256}
                        required
                      />
                    </Field>
                    <Field label="岗位">
                      <select name="role" defaultValue="support">
                        {Object.entries(roles).map(([key, label]) => (
                          <option value={key} key={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button className="accent" disabled={busy}>
                      创建独立账号
                    </button>
                  </form>
                  {enrollment && (
                    <div className="enrollment" role="status">
                      <h3>{enrollment.username} 的验证器设置</h3>
                      <p>{enrollment.note}</p>
                      <label>
                        验证器手动输入密钥
                        <code>
                          {new URL(
                            enrollment.provisioning_uri,
                          ).searchParams.get("secret")}
                        </code>
                      </label>
                      <button onClick={() => setEnrollment(null)}>
                        已妥善交付，关闭显示
                      </button>
                    </div>
                  )}
                </section>
                <section className="surface table-surface">
                  <h2>员工权限</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>账号</th>
                          <th>岗位</th>
                          <th>状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.username}</td>
                            <td>{roles[row.role]}</td>
                            <td>{row.active ? "启用" : "已停用"}</td>
                            <td>
                              <Confirm
                                label="停用"
                                disabled={
                                  busy || !row.active || row.id === user.id
                                }
                                onConfirm={() =>
                                  run(async () => {
                                    await api(
                                      `/api/staff/${row.id}/disable`,
                                      {},
                                    );
                                    await refresh();
                                  })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
            {tab === "audit" && (
              <section className="surface table-surface">
                <h2>
                  {user.role === "owner" ? "账号与授权记录" : "本岗位操作记录"}
                </h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>操作人</th>
                        <th>动作</th>
                        <th>关联编号</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td>{date(row.at)}</td>
                          <td>
                            {row.actor ||
                              (row.actor_id
                                ? `员工 #${row.actor_id}`
                                : "未登录")}
                          </td>
                          <td>{row.action}</td>
                          <td className="mono">
                            {row.subject || row.object_id || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!rows.length && <p className="empty">暂无记录。</p>}
                <p className="small muted">
                  本机记录用于核查操作；独立集中审计仍需在部署时接入。
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
function WorkForm({ role, action, busy }) {
  const requestKey = useRef(crypto.randomUUID());
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (role === "finance") {
      const match = data.amount.match(/^([0-9]{1,10})(?:\.([0-9]{1,2}))?$/);
      if (!match) return;
      const ok = await action("record", {
        kind: data.kind,
        amount_fen:
          Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0")),
        request_key: requestKey.current,
      });
      if (ok) {
        form.reset();
        requestKey.current = crypto.randomUUID();
      }
    } else if (role === "support")
      action("create", {
        category: data.category,
        ...(data.service_id ? { service_id: data.service_id } : {}),
      });
    else action("create", data);
  }
  return (
    <>
      <h2>
        {role === "support"
          ? "登记新工单"
          : role === "finance"
            ? "登记一笔收支"
            : "登记单次服务"}
      </h2>
      <p className="small muted">
        {role === "support"
          ? "只记录分类、状态和服务编号，请勿输入客户资料。"
          : role === "finance"
            ? "人民币手工登记，不执行实际收付款。错误登记可冲销。"
            : "仅供已获外部授权的内部登记，不验证支付、不生成报告。"}
      </p>
      <form className="admin-form form-grid" onSubmit={submit}>
        {role === "support" ? (
          <>
            <Field label="问题分类">
              <select name="category">
                {Object.entries(categories).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="关联服务 UUID（可选）">
              <input name="service_id" maxLength={36} />
            </Field>
          </>
        ) : role === "finance" ? (
          <>
            <Field label="收支类型">
              <select name="kind">
                <option value="income">收入</option>
                <option value="expense">支出</option>
              </select>
            </Field>
            <Field label="金额（元，最多两位小数）">
              <input
                name="amount"
                inputMode="decimal"
                pattern="[0-9]{1,10}(\.[0-9]{1,2})?"
                required
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="稳定请求 UUID">
              <input name="request_key" required maxLength={36} />
            </Field>
            <Field label="履约授权 UUID">
              <input name="authorization_ref" required maxLength={36} />
            </Field>
            <Field label="已确认需求的 SHA-256">
              <input name="spec_sha256" pattern="[a-f0-9]{64}" required />
            </Field>
          </>
        )}
        <button className="accent" disabled={busy}>
          提交登记
        </button>
      </form>
    </>
  );
}
function WorkTable({ role, rows, action, busy, onStatus }) {
  const reversed = new Set(rows.map((r) => r.reverses).filter(Boolean));
  return (
    <>
      {!rows.length ? (
        <p className="empty">暂无可显示的登记。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>编号</th>
                <th>{role === "finance" ? "类型 / 金额" : "类别 / 状态"}</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="mono">
                    {row.id}
                    {role === "support" && row.service_id && (
                      <small>关联 {row.service_id}</small>
                    )}
                  </td>
                  <td>
                    {role === "support" ? (
                      <>
                        {categories[row.category]}
                        <small>{states[row.status]}</small>
                      </>
                    ) : role === "finance" ? (
                      <>
                        {row.reverses
                          ? "冲销"
                          : {
                              income: "收入",
                              expense: "支出",
                              refund: "历史退款",
                            }[row.kind]}
                        <strong>{money(row.amount_fen)}</strong>
                      </>
                    ) : (
                      <>
                        {states[row.status]}
                        <small>已尝试 {row.attempts} / 3 次</small>
                      </>
                    )}
                  </td>
                  <td>{date(row.updated_at || row.created_at)}</td>
                  <td>
                    {role === "support" ? (
                      <div className="row-actions">
                        {row.service_id && (
                          <button
                            disabled={busy}
                            onClick={() => onStatus(row.service_id)}
                          >
                            查询交付进度
                          </button>
                        )}
                        {(moves[row.status] || []).map((status) => (
                          <button
                            key={status}
                            disabled={busy}
                            onClick={() =>
                              action("move", { id: row.id, status })
                            }
                          >
                            {states[status]}
                          </button>
                        ))}
                      </div>
                    ) : role === "finance" ? (
                      <Confirm
                        label="冲销"
                        disabled={
                          busy || !!row.reverses || reversed.has(row.id)
                        }
                        onConfirm={() => action("reverse", { id: row.id })}
                      />
                    ) : (
                      <DeliveryAction row={row} action={action} busy={busy} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function DeliveryAction({ row, action, busy }) {
  const [digest, setDigest] = useState("");
  if (
    ["ready", "failed"].includes(row.status) ||
    (row.status === "processing" && row.lease_until * 1000 <= Date.now())
  )
    return (
      <button disabled={busy} onClick={() => action("start", { id: row.id })}>
        {row.status === "ready" ? "开始执行" : "重试原服务"}
      </button>
    );
  if (row.status !== "processing")
    return (
      <span className="small muted">
        {row.status === "delivered" ? "结果已固定" : "等待人工核查"}
      </span>
    );
  return (
    <div className="delivery-actions">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action("complete", {
            id: row.id,
            attempt_token: row.attempt_token,
            artifact_sha256: digest,
          });
        }}
      >
        <input
          aria-label="报告 SHA-256"
          value={digest}
          onChange={(e) => setDigest(e.target.value)}
          pattern="[a-f0-9]{64}"
          placeholder="报告 SHA-256"
          required
        />
        <button disabled={busy}>登记完成</button>
      </form>
      <Confirm
        label="登记失败"
        disabled={busy}
        onConfirm={() =>
          action("fail", {
            id: row.id,
            attempt_token: row.attempt_token,
            reason: "generation_failed",
          })
        }
      />
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
