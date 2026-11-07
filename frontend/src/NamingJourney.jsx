import React from 'react';
import {ArrowRight, Check, Compass} from 'lucide-react';
import {BrandMark} from './ui/CelestialArt.jsx';
import {birthGuide, identityGuide} from './journey-state.js';

export function JourneyWelcome({draft, step, onContinue}) {
  const identity = identityGuide(draft || {}), basis = birthGuide(draft || {});
  return <div className="empty-result journey-welcome" aria-label="起名旅程引导">
    <BrandMark/>
    <div><p className="eyebrow">{step === 0 ? '01 / 先认识起名对象' : '02 / 确定出生依据'}</p>
      <h3>{step === 0 ? identity.ready ? identity.title : '先为这份心意，确定一个方向。' : basis.title}</h3>
      <p>{step === 0 ? identity.ready ? identity.note : '选好起名场景，填写姓氏或现用姓名。性别可以保持未知。' : basis.ready ? basis.summary : '预产期填预计日期；已出生与改名按真实出生日期和准确时间填写。'}</p>
      {step === 1 && basis.ready && <p className="journey-reference">{basis.note}</p>}
    </div>
    <ol className="journey-outlook"><li><span>01</span>看懂起名方向</li><li><span>02</span>读懂名字来由</li><li><span>03</span>留下心仪备选</li></ol>
    <button type="button" className="secondary" onClick={onContinue}>{step === 0 ? '继续填写起名对象' : basis.ready ? '返回确认并生成' : '继续填写出生信息'}<ArrowRight size={15}/></button>
    <small>两步填写 · 默认10个备选 · 名字详情免费</small>
  </div>;
}

export function NamingDirection({data, first, count, children, progress}) {
  const basis = birthGuide(data), fit = first?.details?.fit;
  const direction = fit?.mode === 'none' ? '读音、风格与心意' : fit?.direction ? `${fit.direction}为首选方向${fit.secondary?.length ? ` · ${fit.secondary.join('、')}为辅助` : ''}` : '综合出处、读音与心意';
  return <section className="naming-direction" aria-label="本次起名方向">
    <div className="direction-heading"><Compass size={20}/><div><p className="eyebrow">从出生依据，到名字来由</p><h3>{data.purpose === 'rename' ? '你的改名方向' : '你的起名方向'}</h3></div><span>{count}个备选</span></div>
    <ol className="result-journey" aria-label="选名进度">{['看方向','读名字','留备选'].map((label,index)=><li key={label} aria-current={progress===index?'step':undefined}><i>{index < progress ? <Check size={11}/> : index+1}</i>{label}</li>)}</ol>
    <div className="direction-facts"><article><small>出生依据</small><strong>{data.mode === 'born' ? '真实出生时刻' : '预产期参考'}</strong><p>{basis.summary}</p></article><article><small>选字方向</small><strong>{fit ? direction : '从名字寓意与读音开始'}</strong><p>{fit?.label || '打开名字详情，了解现有资料。'}</p></article><article><small>逐名比较</small><strong>出处 · 读音 · 寓意</strong><p>每个名字都有自己的来由与取舍，结合日常称呼来选择。</p></article></div>
    {fit && <details className="direction-basis"><summary>为什么采用这个选字方向？</summary><p>{fit.basis || fit.explanation}</p><p>{first.details.birthplace.explanation}</p></details>}
    {data.mode !== 'born' && <p className="direction-reference">{basis.note}</p>}
    {data.purpose === 'rename' && <p className="direction-reference">已先分析现名「{data.currentName}」。本组保留姓氏、排除现用全名，出生依据不随改名变化。</p>}
    {children}
  </section>;
}
