import React, { useState } from "react";
import {Badge, Button, Card, Dialog, IconButton} from "@radix-ui/themes";
import {ArrowDown, ArrowUpRight, CalendarDays, Check, FileText, Heart, Menu, Sparkles} from "lucide-react";

export function Header({ count, onSaved, onAccount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [["#form","开始起名"],["#results","名字提案"],["#reportRequest","完整报告"],["#account","我的服务"],["#keepsake","心愿卡"],["#method","命名方法"]];
  return <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
    <header className="site-header">
      <a className="brand" href="#top"><b>序</b><span>序名<small>ORIGIN & NAME</small></span></a>
      <nav aria-label="主导航">
        <a href="#results">名字提案</a><a href="#method">命名方法</a><a href="#reportRequest">完整报告</a>
        <Button variant="ghost" color="gray" className="customer-entry" type="button" onClick={onAccount}>我的服务</Button>
        <Button id="savedButton" variant="soft" color="jade" type="button" onClick={onSaved}><Heart size={16} aria-hidden="true"/>收藏 <i id="savedCount">{count}</i></Button>
        <Dialog.Trigger><IconButton id="mobileMenuButton" className="mobile-menu-button" variant="ghost" color="gray" aria-label={menuOpen?"关闭导航菜单":"打开导航菜单"}><Menu size={21}/></IconButton></Dialog.Trigger>
      </nav>
    </header>
    <Dialog.Content id="mobileMenu" className="product-mobile-nav" maxWidth="460px">
      <Dialog.Title>从一个名字，开始探索</Dialog.Title><Dialog.Description>选择你要前往的页面内容。</Dialog.Description>
      <div className="product-mobile-links">{links.map(([href,label],index)=><Dialog.Close asChild key={href}><a href={href}><small>0{index+1}</small>{label}<ArrowUpRight size={18}/></a></Dialog.Close>)}</div>
      <Dialog.Close><Button className="mobile-nav-close" variant="soft" color="gray">关闭导航</Button></Dialog.Close>
    </Dialog.Content>
  </Dialog.Root>;
}
export function Hero({ onBegin }) {
  return <>
    <section className="hero wrap atelier-hero">
      <div className="hero-copy">
        <Badge size="2" variant="soft" className="hero-badge"><span className="live-dot"/>新生儿起名 · 改名</Badge>
        <p className="eyebrow hero-eyebrow">A NAME. A NEW BEGINNING.</p>
        <h1>名字，<br/>是一生<span className="hero-title-mark">最初的</span><br/><em>礼物。</em></h1>
        <p className="lede">把出生时光、家族心意和文字之美，放进一个名字。先免费探索喜欢的方向，再读懂它背后的依据。</p>
        <div className="hero-actions">
          <Button size="4" className="primary" asChild><a href="#form" onClick={e=>{if(onBegin){e.preventDefault();onBegin();}}}>开始探索名字<ArrowUpRight size={18}/></a></Button>
          <a className="under" href="#method">了解命名方法<ArrowDown size={15}/></a>
        </div>
        <div className="hero-meta"><span><Check size={14}/>免费名字提案</span><span><Check size={14}/>无需注册</span><span><Check size={14}/>手机电脑皆可用</span></div>
      </div>
      <div className="hero-visual atelier-art" aria-label="序名东方文字艺术">
        <div className="visual-heading"><span>THE NAME ATELIER</span><span>序名 · 文字有光</span></div>
        <div className="orb" aria-hidden="true"><i className="orbit-dot orbit-dot-one"/><i className="orbit-dot orbit-dot-two"/><div className="seal">名<small>ORIGIN</small></div><span className="north">时光</span><span className="east">心意</span><span className="south">新生</span><span className="west">传承</span></div>
        <div className="art-name-note"><span>名字灵感 · 示例</span><strong>知序<span>景宁</span>予安</strong><small>每一个字，都藏着一份期待。</small></div>
        <div className="visual-footer"><span>CRAFTED WITH MEANING</span><Sparkles size={15}/></div>
      </div>
    </section>
    <section className="trust wrap atelier-trust" aria-label="起名服务流程">
      {[["01","留下出生时光","预产期、已出生与改名，清晰分开。",CalendarDays],["02","遇见心动的名字","免费比较姓名、读音和简短寓意。",Sparkles],["03","读懂完整的依据","联系经营者，获取核对后的完整报告。",FileText]].map(([n,title,note,Icon])=><Card asChild key={n}><article><div className="trust-card-top"><Icon size={20}/><span>{n}</span></div><b>{title}</b><small>{note}</small></article></Card>)}
    </section>
  </>;
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
