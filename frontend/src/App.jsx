import React, { useCallback, useEffect, useRef, useState } from "react";
import { Header, Hero, Plans, Method, Footer } from "./Layout.jsx";
import NamingForm from "./NamingForm.jsx";
import Results from "./Results.jsx";
import Keepsake from "./Keepsake.jsx";
import CustomerArea from "./CustomerArea.jsx";
import SavedNames from "./SavedNames.jsx";
import { requestKey, workflowId } from "./form-state.js";
import { requestAnalysis } from "./analysis.js";
import { copyText, friendlyError, downloadReportFile } from "./utils.js";

const DEFAULT_STATUS = "完成信息后，这里会出现可比较的名字方向。";
function stored() {
  let names = [],
    details = Object.create(null);
  try {
    const value = JSON.parse(localStorage.getItem("序名收藏") || "[]");
    names = Array.isArray(value)
      ? [...new Set(value.filter((x) => typeof x === "string"))]
      : [];
  } catch {}
  try {
    const value = JSON.parse(localStorage.getItem("序名收藏详情") || "{}");
    if (value && typeof value === "object" && !Array.isArray(value))
      for (const name of names) {
        const item = value[name];
        if (
          item &&
          typeof item.pinyin === "string" &&
          typeof item.meaning === "string"
        )
          details[name] = {
            pinyin: item.pinyin,
            meaning: item.meaning,
            source_status: item.source_status,
          };
      }
  } catch {}
  return { names, details };
}
function behavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
function scroll(id) {
  requestAnimationFrame(() =>
    document
      .querySelector(id)
      ?.scrollIntoView({ behavior: behavior(), block: "start" }),
  );
}
export default function App() {
  const [favorite, setFavorite] = useState(stored),
    [savedOpen, setSavedOpen] = useState(false),
    [selection, setSelection] = useState(null);
  const [counts, setCounts] = useState({}),
    [product, setProduct] = useState(null),
    [message, setMessage] = useState("");
  const [session, setSession] = useState({ pages: [], index: 0, id: 0 }),
    [draft, setDraft] = useState(null),
    [status, setStatus] = useState(DEFAULT_STATUS),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(null);
  const storedResult = session.pages[session.index] || null;
  const sameContext = !draft || !storedResult || (workflowId(draft) === workflowId(storedResult.data) && draft.surname === storedResult.data.surname && (draft.purpose !== "rename" || draft.currentName?.trim() === storedResult.data.currentName?.trim()));
  const result = sameContext ? storedResult : null;
  const dirty = !!(
    result &&
    draft &&
    requestKey(draft) !== requestKey(result.data)
  );
  const timer = useRef(null),
    inFlight = useRef(false),
    formController = useRef(null),
    undoFavorite = useRef(null);
  const toast = useCallback((text, type = "success") => {
    window.clearTimeout(timer.current);
    setNotice({ text, type });
    timer.current = window.setTimeout(() => setNotice(null), 3200);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    let active = true;
    fetch("/api/name-counts")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (active) setCounts(data.counts || {});
      })
      .catch(() => {});
    fetch("/api/product")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .catch(() => fetch("/data/product.json").then((r) => r.json()))
      .then((data) => {
        if (active) setProduct(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  function persist(next) {
    setFavorite(next);
    try {
      localStorage.setItem("序名收藏", JSON.stringify(next.names));
      localStorage.setItem("序名收藏详情", JSON.stringify(next.details));
      return true;
    } catch {
      toast("当前浏览器无法保存收藏，本次收藏仅在页面打开期间有效。", "info");
      return false;
    }
  }
  function save(item) {
    const exists = favorite.names.includes(item.fullName),
      names = exists
        ? favorite.names.filter((x) => x !== item.fullName)
        : [...favorite.names, item.fullName],
      details = { ...favorite.details };
    if (exists) delete details[item.fullName];
    else
      details[item.fullName] = {
        pinyin: item.pinyin,
        meaning: item.meaning,
        source_status: item.source_status,
      };
    if (persist({ names, details }))
      toast(exists ? `已取消收藏${item.fullName}` : `已收藏${item.fullName}`);
  }
  function remove(name) {
    const details = { ...favorite.details };
    delete details[name];
    if (persist({ names: favorite.names.filter((x) => x !== name), details }))
      toast("已取消收藏。");
  }
  function clear() {
    if (!favorite.names.length) {
      toast("目前没有本机收藏。", "info");
      return;
    }
    undoFavorite.current = favorite;
    if (persist({ names: [], details: {} })) {
      window.clearTimeout(timer.current);
      setNotice({ text: "本机收藏已清空。", type: "info", undo: true });
      timer.current = window.setTimeout(() => {
        setNotice(null);
        undoFavorite.current = null;
      }, 10000);
    }
  }
  function undoClear() {
    if (undoFavorite.current) {
      persist(undoFavorite.current);
      undoFavorite.current = null;
      toast("本机收藏已恢复。");
    }
  }
  async function copyFavorites() {
    const text = favorite.names
      .map(
        (name, index) =>
          `${index + 1}. ${name}${favorite.details[name]?.pinyin ? " · " + favorite.details[name].pinyin : ""}${favorite.details[name]?.meaning ? "\n" + favorite.details[name].meaning : ""}`,
      )
      .join("\n\n");
    try {
      if (!(await copyText(text))) throw Error();
      toast("收藏清单已复制，可以发给家人讨论。");
    } catch {
      toast("复制失败，可逐个复制名字。", "info");
    }
  }
  async function copy(name) {
    try {
      if (!(await copyText(name))) throw new Error();
      toast(`已复制${name}，可以发给家人讨论。`);
    } catch {
      toast("复制失败，请长按名字手动复制。", "info");
    }
  }
  async function generate(data, isRegenerate = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    if (!isRegenerate)
      setStatus(result ? "正在应用修改，上一份方案仍保留。" : "正在生成方案…");
    try {
      const payload = await requestAnalysis(data),
        candidates = window.NameEngine.candidates(
          data,
          payload.analysis,
          payload.candidates,
        );
      const page = { data, analysis: payload.analysis, candidates };
      setSession((previous) =>
        isRegenerate
          ? {
              ...previous,
              pages: [...previous.pages, page],
              index: previous.pages.length,
            }
          : { pages: [page], index: 0, id: previous.id + 1 },
      );
      const count = candidates.length,
        requested = Number(data.candidateCount || 3);
      const prefix = isRegenerate
        ? `已换到第 ${Number(data.variant) + 1} 组，共 ${count} 个名字。`
        : `已生成 ${count} 个方向，可加入比较，或展开卡片查看选字依据。`;
      setStatus(
        count
          ? `${prefix}${count < requested ? `当前字数和避用字条件下，当前字库仅匹配 ${count} 个。` : ""}`
          : "四柱已计算，当前条件下没有符合要求的候选。",
      );
      if (!isRegenerate) scroll("#results");
      toast(
        count
          ? isRegenerate
            ? "已重新整理候选方向。"
            : data.purpose === "rename" ? "改名方案已生成，可查看与现名的变化。" : "名字方案已生成，先收藏喜欢的方向。"
          : "请调整避用字或名字字数后重试。",
        count && !isRegenerate ? "success" : "info",
      );
    } catch (error) {
      if (isRegenerate) {
        const text = friendlyError(error.message || "");
        setStatus(`重新生成未完成：${text} 当前仍展示上一份方案。`);
        toast(text, "info");
      } else {
        setStatus(
          result?.candidates?.length
            ? "本次修改未能生成，上一份方案仍可查看、收藏和下载。"
            : "暂时无法生成方案。",
        );
        setMessage(friendlyError(error.message || ""));
        scroll("#formMessage");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function regenerate() {
    if (!result?.analysis?.bazi) {
      formController.current?.resume();
      toast("先完成信息，就能生成名字方案。", "info");
      return;
    }
    if (session.index + 1 < session.pages.length) {
      const index = session.index + 1;
      setSession({ ...session, index });
      setStatus(`正在查看第 ${index + 1} 组候选，条件保持不变。`);
      return;
    }
    const size = Number(result.analysis.candidate_count) || 1;
    const pages = Math.ceil(
      (Number(result.analysis.available_candidate_count) || 0) / size,
    );
    if (session.index + 1 >= pages) {
      toast("这一条件下的候选已看完，可以调整偏好探索其他方向。", "info");
      return;
    }
    generate(
      { ...result.data, variant: Number(result.data.variant || 0) + 1 },
      true,
    );
  }
  function previousGroup() {
    if (inFlight.current || session.index <= 0) return;
    const index = session.index - 1;
    setSession({ ...session, index });
    setStatus(`已返回第 ${index + 1} 组候选，原来的名字仍在这里。`);
  }
  function edit(index, field) {
    formController.current?.openStep(index, field);
  }
  function openKeepsake(name) {
    setSavedOpen(false);
    setSelection({ name });
    scroll("#keepsake");
  }
  function showSaved() {
    setSavedOpen(true);
  }
  function locateSaved(name) {
    const index = session.pages.findIndex((page) =>
      page.candidates.some((item) => item.fullName === name),
    );
    if (index < 0) return;
    setSession({ ...session, index });
    setSavedOpen(false);
    setStatus(`已回到第 ${index + 1} 组候选。`);
    requestAnimationFrame(() => {
      const card = [...document.querySelectorAll("#cards .card")].find(
        (el) => el.querySelector("h3")?.textContent === name,
      );
      card?.focus({ preventScroll: true });
      card?.scrollIntoView({ behavior: behavior(), block: "center" });
    });
  }
  return (
    <>
      <Header
        count={favorite.names.length}
        onSaved={showSaved}
        onAccount={() => scroll("#account")}
      />
      <main id="top">
        <Hero onBegin={() => formController.current?.resume()} />
        <NamingForm
          ref={formController}
          onDraftChange={setDraft}
          onGenerate={generate}
          busy={busy}
          counts={counts}
          message={message}
          setMessage={setMessage}
          toast={toast}
        />
        <Results
          data={result?.data}
          analysis={result?.analysis}
          candidates={result?.candidates || []}
          status={sameContext ? status : "已切换起名场景或姓名，请完成当前流程后生成对应方案。"}
          busy={busy}
          saved={favorite.names}
          onSaved={showSaved}
          comparisonKey={`${session.id}:${workflowId(draft || {})}:${sameContext}`}
          dirty={dirty}
          onApply={() => formController.current?.submit()}
          onEdit={edit}
          groupIndex={session.index}
          hasHistory={!!result && session.pages.length > 1}
          seenNames={
            new Set(
              (result ? session.pages : [])
                .slice(0, session.index)
                .flatMap((page) =>
                  page.candidates.map((item) => item.fullName),
                ),
            )
          }
          hasPrevious={!!result && session.index > 0}
          hasNext={
            (result && session.index + 1 < session.pages.length) ||
            (result &&
              session.index + 1 <
                Math.ceil(
                  result.analysis.available_candidate_count /
                    (result.analysis.candidate_count || 1),
                ))
          }
          onPrevious={previousGroup}
          onRegenerate={regenerate}
          onDownload={() =>
            downloadReportFile(
              result.data,
              result.analysis,
              result.candidates,
              toast,
            )
          }
          onCopy={copy}
          onSave={save}
          onKeepsake={openKeepsake}
        />
        <CustomerArea
          result={result}
          toast={toast}
          onSaved={showSaved}
          onDownload={() =>
            result &&
            downloadReportFile(
              result.data,
              result.analysis,
              result.candidates,
              toast,
            )
          }
        />
        <Keepsake selection={selection} toast={toast} />
        <Plans product={product} toast={toast} />
        <Method />
      </main>
      <Footer clear={clear} />
      <SavedNames
        open={savedOpen}
        names={favorite.names}
        details={favorite.details}
        onClose={() => setSavedOpen(false)}
        onRemove={remove}
        onCopy={copy}
        onCopyAll={copyFavorites}
        onKeepsake={openKeepsake}
        onClear={clear}
        onExplore={() => {
          setSavedOpen(false);
          result ? scroll("#results") : formController.current?.resume();
        }}
        onLocate={locateSaved}
        locatable={
          new Set(
            (result ? session.pages : []).flatMap((page) =>
              page.candidates.map((item) => item.fullName),
            ),
          )
        }
        notice={notice}
        onUndo={undoClear}
      />
      <div
        id="toast"
        className={`toast ${notice?.type || ""}`}
        role="status"
        aria-live="polite"
        hidden={!notice}
      >
        <span>{notice?.text}</span>
        {notice?.undo && (
          <button type="button" onClick={undoClear}>
            撤销
          </button>
        )}
      </div>
    </>
  );
}
