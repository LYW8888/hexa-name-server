import React, { useEffect, useRef, useState } from "react";
const searchable = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
export default function SavedNames({
  open,
  names,
  details,
  onClose,
  onRemove,
  onCopy,
  onCopyAll,
  onKeepsake,
  onClear,
  onExplore,
  onLocate,
  locatable,
  notice,
  onUndo,
}) {
  const dialog = useRef(null),
    [query, setQuery] = useState("");
  useEffect(() => {
    const el = dialog.current,
      root = document.documentElement,
      previous = root.style.overflow;
    if (open) {
      setQuery("");
      if (!el.open) {
        el.showModal();
        el.querySelector("#closeSaved")?.focus({ preventScroll: true });
      }
      root.style.overflow = "hidden";
    } else if (el.open) el.close();
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);
  const filtered = names.filter((name) =>
    searchable(
      [name, details[name]?.pinyin, details[name]?.meaning].join(" "),
    ).includes(searchable(query).trim()),
  );
  return (
    <dialog
      ref={dialog}
      id="savedPanel"
      className="saved-dialog"
      aria-labelledby="savedTitle"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          onClose();
      }}
    >
      <div className="saved-dialog-content">
        <div className="saved-dialog-head">
          <div>
            <p className="eyebrow">YOUR SHORTLIST</p>
            <h2 id="savedTitle">
              本机收藏 <small>{names.length}</small>
            </h2>
          </div>
          <button
            id="closeSaved"
            className="secondary"
            type="button"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <p className="saved-scope">
          保存在当前浏览器，只记录名字、拼音和寓意。可复制给家人一起讨论。
        </p>
        {names.length > 0 && (
          <label className="saved-search">
            查找收藏
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入名字、拼音或寓意"
            />
          </label>
        )}
        {notice && (
          <p className="saved-feedback" role="status">
            {notice.text}{" "}
            {notice.undo && (
              <button type="button" onClick={onUndo}>
                撤销
              </button>
            )}
          </p>
        )}
        <div id="savedList" className="saved-list">
          {filtered.length ? (
            filtered.map((name) => (
              <article className="saved-item" key={name}>
                <div>
                  <b>{name}</b>
                  <small>{details[name]?.pinyin || "旧收藏仅记录名字"}</small>
                  {details[name]?.meaning && <p>{details[name].meaning}</p>}
                </div>
                <div className="saved-item-tools">
                  {locatable?.has(name) && (
                    <button type="button" onClick={() => onLocate(name)}>
                      查看方案
                    </button>
                  )}
                  <button type="button" onClick={() => onCopy(name)}>
                    复制
                  </button>
                  <button type="button" onClick={() => onKeepsake(name)}>
                    做心愿卡
                  </button>
                  <button
                    type="button"
                    className="remove-saved"
                    aria-label={`取消收藏 ${name}`}
                    onClick={() => onRemove(name)}
                  >
                    移除
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="saved-empty">
              <p>
                {names.length
                  ? "没有找到匹配的收藏。"
                  : "还没有收藏名字，喜欢的方向可以随时留在这里。"}
              </p>
              {names.length ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setQuery("")}
                >
                  查看全部收藏
                </button>
              ) : (
                <button className="primary" type="button" onClick={onExplore}>
                  去看看名字方案
                </button>
              )}
            </div>
          )}
        </div>
        {names.length > 0 && (
          <div className="saved-dialog-foot">
            <button type="button" className="primary" onClick={onCopyAll}>
              复制收藏清单
            </button>
            <button type="button" className="secondary" onClick={onClear}>
              清空本机收藏
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
