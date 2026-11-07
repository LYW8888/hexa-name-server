import React, { useState } from "react";
import {Button, Dialog, IconButton} from "@radix-ui/themes";
import {ArrowUpRight, Check, Heart, Menu} from "lucide-react";
import { BrandMark } from './ui/CelestialArt.jsx';

export function Header({ count, onSaved, onAccount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [["#form","开始起名"],["#results","名字提案"],["#trialQuota","体验名额"],["#account","我的服务"],["#keepsake","心愿卡"],["#method","命名方法"]];
  return <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
    <header className="site-header">
      <a className="brand" href="#top"><BrandMark/><span>序名<small>ORIGIN & NAME</small></span></a>
      <nav aria-label="主导航">
        <a href="#results">名字提案</a><a href="#method">命名方法</a><a href="#trialQuota">体验名额</a>
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
export function Hero() {
  return <section className="workspace-welcome landscape-banner" aria-label="序名 · 月白青黛">
    <div className="welcome-copy"><p className="eyebrow">山河入梦 · 字里有光</p><h1>以东方心意，<span>予一生好名。</span></h1><p>从出生时光出发，把山河文脉写进名字。</p><div className="welcome-notes"><span><Check size={13}/>无需注册</span><span><Check size={13}/>名字提案免费</span><span><Check size={13}/>反馈自愿</span></div></div>
  </section>;
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
              按字数和避用字筛选，结合五行、读音、风格与心意用字整理名字。逐名免费查看出处、音韵与选名理由；完整四柱和旺衰取用可在内测报告中查看。
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
