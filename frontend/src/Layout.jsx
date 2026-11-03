import React, { useState } from "react";
import {Button, Dialog, IconButton} from "@radix-ui/themes";
import {ArrowDown, ArrowUpRight, Baby, CalendarDays, Check, FileText, Heart, Menu, Orbit, Sparkles, UserRound} from "lucide-react";
import CelestialArt, { BrandMark } from './ui/CelestialArt.jsx';

export function Header({ count, onSaved, onAccount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [["#form","开始起名"],["#results","名字提案"],["#reportRequest","完整报告"],["#account","我的服务"],["#keepsake","心愿卡"],["#method","命名方法"]];
  return <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
    <header className="site-header">
      <a className="brand" href="#top"><BrandMark/><span>序名<small>ORIGIN & NAME</small></span></a>
      <nav aria-label="主导航">
        <a href="#results">名字提案</a><a href="#method">命名方法</a><a href="#reportRequest">完整报告</a>
        <Button variant="ghost" color="gray" className="customer-entry" type="button" onClick={onAccount}>我的服务</Button>
        <Button id="savedButton" variant="soft" color="iris" type="button" onClick={onSaved}><Heart size={16} aria-hidden="true"/>收藏 <i id="savedCount">{count}</i></Button>
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
export function Hero({ onBegin, activeScenario = 'due_date', busy = false }) {
  return <>
    <section className="hero celestial-hero" aria-label="序名 · 星际东方命名">
      <div className="hero-nebula" aria-hidden="true"/>
      <div className="wrap celestial-hero-inner">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="live-dot"/><span>东方文脉 · 每一个新的开始</span><span className="kicker-line"/></div>
          <h1>以时光为序，<br/><span>予人生以<em>名。</em></span></h1>
          <p className="lede">让古籍里的文字之美，遇见你的出生时光。<br className="desktop-break"/>一个名字，承载一份独属于家人的心意。</p>
          <div className="hero-actions">
            <Button size="4" className="primary" asChild><a href="#form" onClick={e=>{if(onBegin){e.preventDefault();onBegin();}}}>开始探索名字<ArrowUpRight size={18}/></a></Button>
            <a className="under" href="#method">了解命名方法<ArrowDown size={15}/></a>
          </div>
          <div className="hero-meta"><span><Check size={13}/>免费名字提案</span><span><Check size={13}/>无需注册</span><span><Check size={13}/>完整报告人工交付</span></div>
        </div>
        <div className="hero-artwork" aria-label="东方字形与星际轨道装饰">
          <CelestialArt/>
          <div className="artwork-caption"><span>一字一世界</span><i/><span>一名一新生</span></div>
          <div className="artwork-annotation"><span>天地之间，文字有光。</span><small>ORIGIN · NAME · POSSIBILITY</small></div>
        </div>
        <div className="hero-start-panel">
          <div className="start-panel-heading"><Orbit size={18}/><span>从你的此刻，开始</span><small>选择起名场景</small></div>
          <div className="hero-scenarios" role="group" aria-label="快捷选择起名场景">
            {[["due_date","预产期起名","为即将到来的新生",CalendarDays],["born","已出生起名","从真实出生时光出发",Baby],["rename","改名","先了解现名，再遇新名",UserRound]].map(([value,title,hint,Icon])=><button type="button" key={value} className="hero-scenario" data-scenario={value} aria-label={title} aria-pressed={activeScenario===value} disabled={busy} onClick={()=>onBegin?.(value)}><span className="scenario-icon"><Icon size={21}/></span><span><b>{title}</b><small>{hint}</small></span><ArrowUpRight size={17}/></button>)}
          </div>
        </div>
        <div className="hero-bottom"><span>让传统的智慧，抵达当下的生活。</span><a href="#form" aria-label="前往起名工作区"><ArrowDown size={16}/></a><small>SCROLL TO EXPLORE</small></div>
      </div>
    </section>
    <section className="service-strip wrap" aria-label="起名服务流程">
      {[["01","留下出生时光",CalendarDays],["02","遇见心动名字",Sparkles],["03","读懂完整依据",FileText]].map(([n,title,Icon])=><div key={n}><small>{n}</small><Icon size={16}/><span>{title}</span></div>)}
    </section>
  </>;
}
export function Plans({ product, toast }) {
  const plans = product?.plans || [];
  return (
    <section className="pricing" id="pricing">
      <div className="wrap">
        <p className="eyebrow">命名服务 / YOUR NEXT CHAPTER</p>
        <h2>
          从一个名字，
          <br />
          到一份完整的心意。
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
        <p className="eyebrow">命名方法 / THE WAY WE NAME</p>
        <h2>
          东方的来处，
          <br />
          当下的选择。
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
