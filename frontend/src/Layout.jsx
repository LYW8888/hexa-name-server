import React from 'react';

export function Header({ count, onSaved }) {
  return <header><a className="brand" href="#top"><b>序</b><span>序名<small>ORIGIN &amp; NAME</small></span></a><nav><a href="#method">命名方法</a><a href="#results">名字方案</a><a href="#keepsake">心愿卡</a><a href="#pricing">产品方案</a><button id="savedButton" onClick={onSaved}>收藏 <i id="savedCount">{count}</i></button></nav></header>;
}
export function Hero() {
  return <><section className="hero wrap"><div className="hero-copy"><p className="eyebrow hero-eyebrow"><span>序名 · ORIGIN &amp; NAME</span> NAMING FOR A NEW BEGINNING</p><h1>名字，<br/><em>是给未来的</em><br/>第一份心意。</h1><p className="lede">以出生时光呈现四柱参考，结合姓氏与家庭心意，整理一份值得慢慢读的名字方案。</p><div className="hero-actions"><a className="primary" href="#form">开始探索名字 <span aria-hidden="true">↗</span></a><a className="under" href="#method">了解命名方法 <span aria-hidden="true">↓</span></a></div><div className="hero-meta"><span>预产期 / 出生信息</span><span>多种名字字数</span><span>本地收藏</span></div><small className="note">传统文化参考 · 候选资料仍在核验</small></div><div className="hero-visual" aria-hidden="true"><div className="visual-heading"><span>THE ORIGIN OF A NAME</span><span>时光 · 姓氏 · 心意</span></div><div className="orb"><i className="orbit-dot orbit-dot-one"/><i className="orbit-dot orbit-dot-two"/><div className="seal">序<small>名</small></div><span className="north">时 · 光</span><span className="east">姓 · 氏</span><span className="south">心 · 意</span><span className="west">名 · 字</span></div><div className="visual-footer"><span>TRADITION / CONTEMPORARY</span><span>01 — 04</span></div></div></section><section className="trust wrap"><div>◌ <b>规则可解释</b><small>展示演示规则与资料状态</small></div><div>⌁ <b>信息有分寸</b><small>出生资料可随时删除</small></div><div>✦ <b>名字有温度</b><small>兼顾寓意、读写与日常使用</small></div></section></>;
}
export function Plans({ product, toast }) {
  const plans = product?.plans || [];
  return <section className="pricing" id="pricing"><div className="wrap"><p className="eyebrow">CHOOSE YOUR NEXT STEP</p><h2>先体验现有功能，<br/>陪家人慢慢比较每个名字。</h2><p className="pricing-lede">序名把传统文化线索整理成可读的参考报告，帮助家人一起比较和讨论。</p><div id="planGrid" className="plan-grid">{plans.map((plan,index)=><article key={plan.id} className={`plan ${index === 1 ? 'featured' : ''}`}>{index === 1 && <span className="plan-badge">PLANNED</span>}<h3>{plan.name}</h3><div className="plan-price">{plan.price}</div><p>{plan.description}</p><ul>{(plan.benefits || []).map(b=><li key={b}>{b}</li>)}</ul><button className={`${index === 0 ? 'secondary' : 'primary'} plan-action`} type="button" data-plan={plan.id} onClick={()=>toast(plan.id === 'free' ? '免费预览已经在上方生成，可以先收藏喜欢的名字。' : (product.payment_status || '完整服务尚在规划，当前没有开通购买。'), plan.id === 'free' ? 'success' : 'info')}>{index === 0 ? '当前免费' : '了解方案'}</button></article>)}</div><p className="pricing-note">当前功能免费体验，付费服务尚在规划，未开放购买。</p></div></section>;
}
export function Method() {
 return <section className="method" id="method"><div className="wrap"><p className="eyebrow">A CLEARER WAY TO NAME</p><h2>让传统成为线索，<br/>让选择回到你手中。</h2><div className="method-grid"><article><b>01</b><h3>梳理出生时光</h3><p>依据日期、时间和所选时区计算四柱；预产期结果仅供参考。</p></article><article><b>02</b><h3>聆听家庭心意</h3><p>按姓氏、字数、避用字及部分文字偏好筛选；父母姓氏和出生地点暂不参与候选排序。</p></article><article><b>03</b><h3>比较每个可能</h3><p>从读音、字形、寓意和传统解释中，留下适合日常使用的名字。</p></article></div></div></section>;
}
export function Footer({clear}) {
 return <footer className="wrap"><span>序名 · ORIGIN &amp; NAME</span><span>传统文化参考工具 · <button id="clearData" className="footer-button" type="button" onClick={clear}>清除本地收藏</button></span></footer>;
}
