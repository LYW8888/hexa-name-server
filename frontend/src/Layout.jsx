import React, { useState } from "react";

export function Header({ count, onSaved, onAccount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    ["#form", "开始起名"],
    ["#account", "我的服务"],
    ["#results", "名字方案"],
    ["#keepsake", "心愿卡"],
    ["#method", "命名方法"],
    ["#pricing", "产品方案"],
  ];
  return (
    <header
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          document.getElementById("mobileMenuButton")?.focus();
        }
      }}
    >
      <a className="brand" href="#top">
        <b>序</b>
        <span>
          序名<small>ORIGIN &amp; NAME</small>
        </span>
      </a>
      <nav aria-label="主导航">
        <a href="#method">命名方法</a>
        <a href="#results">名字方案</a>
        <a href="#keepsake">心愿卡</a>
        <a href="#pricing">产品方案</a>
        <button
          className="customer-entry"
          type="button"
          onClick={() => {
            setMenuOpen(false);
            onAccount();
          }}
        >
          我的服务
        </button>
        <button
          id="savedButton"
          type="button"
          onClick={() => {
            setMenuOpen(false);
            onSaved();
          }}
        >
          收藏 <i id="savedCount">{count}</i>
        </button>
        <button
          id="mobileMenuButton"
          className="mobile-menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobileMenu"
          aria-label={menuOpen ? "关闭导航菜单" : "打开导航菜单"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
      </nav>
      <div id="mobileMenu" className="mobile-menu" hidden={!menuOpen}>
        {links.map(([href, label], index) => (
          <a href={href} key={href} onClick={() => setMenuOpen(false)}>
            <span>
              <small>0{index + 1}</small>
              {label}
            </span>
            <span aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </header>
  );
}
export function Hero({ onBegin }) {
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">
            <span>序名 · ORIGIN &amp; NAME</span> NAMING FOR A NEW BEGINNING
          </p>
          <h1>
            名字，
            <br />
            <em>是给未来的</em>
            <br />
            第一份心意。
          </h1>
          <p className="lede">
            结合出生时光、姓氏与家庭心意，先免费看看名字提案；完整依据与分析报告，联系经营者获取。
          </p>
          <div className="hero-actions">
            <a
              className="primary"
              href="#form"
              onClick={(e) => {
                if (onBegin) {
                  e.preventDefault();
                  onBegin();
                }
              }}
            >
              开始探索名字 <span aria-hidden="true">↗</span>
            </a>
            <a className="under" href="#method">
              了解命名方法 <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero-meta">
            <span>预产期 / 出生信息</span>
            <span>多种名字字数</span>
            <span>本地收藏</span>
          </div>
          <small className="note">传统文化参考 · 经典依据 · 心意选名</small>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-heading">
            <span>THE ORIGIN OF A NAME</span>
            <span>时光 · 姓氏 · 心意</span>
          </div>
          <div className="orb">
            <i className="orbit-dot orbit-dot-one" />
            <i className="orbit-dot orbit-dot-two" />
            <div className="seal">
              序<small>名</small>
            </div>
            <span className="north">时 · 光</span>
            <span className="east">姓 · 氏</span>
            <span className="south">心 · 意</span>
            <span className="west">名 · 字</span>
          </div>
          <div className="visual-footer">
            <span>TRADITION / CONTEMPORARY</span>
            <span>01 — 04</span>
          </div>
        </div>
      </section>
      <section className="trust wrap">
        <div>
          ◌ <b>规则可解释</b>
          <small>名字提案免费 · 完整报告人工交付</small>
        </div>
        <div>
          ⌁ <b>信息有分寸</b>
          <small>出生资料不自动保存</small>
        </div>
        <div>
          ✦ <b>名字有温度</b>
          <small>兼顾寓意、读写与日常使用</small>
        </div>
      </section>
    </>
  );
}
export function Plans({ product, toast }) {
  const plans = product?.plans || [];
  return (
    <section className="pricing" id="pricing">
      <div className="wrap">
        <p className="eyebrow">CHOOSE YOUR NEXT STEP</p>
        <h2>
          先体验现有功能，
          <br />
          陪家人慢慢比较每个名字。
        </h2>
        <p className="pricing-lede">
          名字提案免费查看。想了解完整出生依据和逐名分析，可以联系经营者获取报告。
        </p>
        <div id="planGrid" className="plan-grid">
          {plans.map((plan, index) => (
            <article
              key={plan.id}
              className={`plan ${index === 1 ? "featured" : ""}`}
            >
              {index === 1 && <span className="plan-badge">人工交付</span>}
              <h3>{plan.name}</h3>
              <div className="plan-price">{plan.price}</div>
              <p>{plan.description}</p>
              <ul>
                {(plan.benefits || []).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <button
                className={`${index === 0 ? "secondary" : "primary"} plan-action`}
                type="button"
                data-plan={plan.id}
                onClick={() => document.getElementById(plan.id === 'free' ? 'form' : 'reportRequest')?.scrollIntoView({block:'start'})}
              >
                {index === 0 ? "免费起名" : "联系获取报告"}
              </button>
            </article>
          ))}
        </div>
        <p className="pricing-note">
          名字提案免费；完整报告的内容、费用与交付时间请通过微信或QQ确认。
        </p>
        {product?.service_policy && (
          <section className="service-policy" aria-label="单次服务机制">
            <p className="eyebrow">单次服务 · 人工交付</p>
            <h3>{product.service_policy.title}</h3>
            <div className="service-policy-grid">
              {product.service_policy.items.map((item, index) => (
                <article key={item.title}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
            <p className="service-scope">{product.service_policy.scope_note}</p>
            <p className="service-exception">
              {product.service_policy.exception_note}
            </p>
          </section>
        )}
      </div>
    </section>
  );
}
export function Method() {
  return (
    <section className="method" id="method">
      <div className="wrap">
        <p className="eyebrow">A CLEARER WAY TO NAME</p>
        <h2>
          让传统成为线索，
          <br />
          让选择回到你手中。
        </h2>
        <div className="method-grid">
          <article>
            <b>01</b>
            <h3>梳理出生时光</h3>
            <p>
              按民用时钟或真太阳时整理出生依据，用于选名；完整四柱与生克分析在报告中说明，预产期仅作参考。
            </p>
          </article>
          <article>
            <b>02</b>
            <h3>聆听家庭心意</h3>
            <p>
              按字数和避用字筛选，结合五行、读音、风格与心意用字整理名字。免费查看提案，出处与选名依据由经营者通过完整报告说明。
            </p>
          </article>
          <article>
            <b>03</b>
            <h3>比较每个可能</h3>
            <p>从读音、字形、寓意和传统解释中，留下适合日常使用的名字。</p>
          </article>
        </div>
      </div>
    </section>
  );
}
export function Footer({ clear }) {
  return (
    <footer className="wrap">
      <span>序名 · ORIGIN &amp; NAME</span>
      <span>
        传统文化参考工具 ·{" "}
        <button
          id="clearData"
          className="footer-button"
          type="button"
          onClick={clear}
        >
          清除本地收藏
        </button>
      </span>
    </footer>
  );
}
