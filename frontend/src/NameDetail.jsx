import React from 'react';
import {Button, Dialog, IconButton} from '@radix-ui/themes';
import {ArrowLeft, BookOpen, Check, Heart, MapPin, Sparkles, X} from 'lucide-react';
import {workflowLabel} from './form-state.js';

const relationLabels={'同类':'与日主同类','生我':'生扶日主','我生':'日主所生','我克':'日主所克','克我':'制约日主'};

export function NameExplanation({detail, name, prefix="nameDetail"}) {
  if (!detail) return <p className="detail-unavailable">这份提案来自早期版本，尚无逐名详情。重新生成后即可查看当前出处和选名说明。</p>;
  const source=detail.source, glyphs=detail.characters || [];
  return <div className="name-explanation">
    <section id={`${prefix}Benefits`} className="detail-section"><p className="eyebrow">01 / WHY THIS NAME</p><h3>为什么推荐{name}</h3>
      <div className="name-benefits">{detail.benefits.map(item=><article key={item.id}><Check size={16}/><div><h4>{item.title}</h4><p>{item.text}</p></div></article>)}</div>
      {!!detail.considerations?.length&&<details className="name-considerations"><summary>选择时，也看看这些取舍</summary>{detail.considerations.map(item=><p key={item.id}><b>{item.title}：</b>{item.text}</p>)}</details>}
    </section>
    <section id={`${prefix}Sources`} className="detail-section"><p className="eyebrow">02 / WORDS WITH ROOTS</p><h3>出处，写清每一处来由</h3><p className="detail-source-kind"><BookOpen size={15}/>{source.label}</p><p>{source.summary}</p>
      {source.citations.map((citation,index)=><figure className="name-citation" key={`${citation.source_id}:${citation.line}:${index}`}>
        <figcaption><b>《{citation.work}》</b><span>{citation.chapter}</span><small>取字：{citation.selected_characters.join('、')}</small></figcaption>
        <blockquote>{citation.quote}</blockquote><p>{source.verification}</p>
        <details><summary>录文版本与核对位置</summary><p>{citation.version_label} · 第{citation.line}行（本项目录文行号）</p><p className="source-hash">SHA-256：{citation.sha256}</p></details>
      </figure>)}
      {!source.citations.length&&<div className="source-meaning-note"><p>{source.verification}</p><p>这个名字的价值主要在字义、音韵与家庭心意，可结合下方逐字说明判断是否喜欢。</p></div>}
      <div className="detail-character-grid">{glyphs.map(glyph=><article key={glyph.char}><strong>{glyph.char}</strong><p>{glyph.meaning || '结合所列原句取意'}</p><dl><div><dt>字形五行</dt><dd>{glyph.element || '本规则未归类'}</dd></div><div><dt>部首</dt><dd>{glyph.radical || '未记录'}</dd></div><div><dt>康熙笔画</dt><dd>{glyph.kangxi_strokes ?? '未确定'}</dd></div></dl></article>)}</div>
    </section>
    <section id={`${prefix}Fit`} className="detail-section"><p className="eyebrow">03 / THE PERSONAL FIT</p><h3>怎样契合本次出生信息</h3><div className="name-fit-direction"><Sparkles size={19}/><div><b>{detail.fit.label}</b><p>{detail.fit.explanation}</p></div></div><p>{detail.fit.basis}</p>
      <div className="name-day-relations">{glyphs.filter(g=>g.day_master_relation).map(g=><span key={g.char}>{g.char} · {relationLabels[g.day_master_relation] || g.day_master_relation}</span>)}</div><p className="detail-reference-note">{detail.reference_note}</p>
    </section>
    <section id={`${prefix}Elements`} className="detail-section"><p className="eyebrow">04 / THE FIVE ELEMENTS</p><h3>相生相克，具体怎么理解</h3><p>相生指生助，相克指制约。传统取用会结合日主旺衰考虑生扶、泄耗与制约，相克本身不等于坏名字。</p>
      {detail.elements.pairs.map((pair,index)=><div className={`name-element-pair ${pair.kind}`} key={index}><div><strong>{pair.from}</strong><small>{glyphs.find(g=>g.char===pair.from)?.element || '未归类'}</small></div><p><b>{pair.label}</b><span>{pair.text}</span></p><div><strong>{pair.to}</strong><small>{glyphs.find(g=>g.char===pair.to)?.element || '未归类'}</small></div></div>)}
      {!detail.elements.pairs.length&&<p>这是一字名，没有两个名字用字之间的生克关系；可看该字与选字方向的契合。</p>}
      <div className="name-element-cycles"><p><b>相生</b>{detail.elements.generation_cycle}</p><p><b>相克</b>{detail.elements.control_cycle}</p></div><p>{detail.elements.method}</p><details><summary>生克怎样参与本次排序</summary><p>{detail.elements.usage}</p></details>
    </section>
    <section id={`${prefix}Place`} className="detail-section"><p className="eyebrow">05 / TIME & PLACE</p><h3><MapPin size={20}/>出生地为什么有用</h3><p>{detail.birthplace.explanation}</p><p className="detail-reference-note">{detail.birthplace.note}</p><p>读音参考：{detail.reading.pinyin}{detail.reading.tone_pattern?` · ${detail.reading.tone_pattern}`:''}。{detail.reading.note}</p></section>
  </div>;
}

export default function NameDetail({item, data, saved, onSave, onClose, returnFocus}) {
  function jump(id){document.getElementById(id)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
  return <Dialog.Root open={!!item} onOpenChange={open=>{if(!open)onClose();}}><Dialog.Content className="name-detail-dialog" maxWidth="960px" onCloseAutoFocus={event=>{event.preventDefault();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else document.getElementById('results')?.focus({preventScroll:true});}}>
    {item&&<div className="product-theme name-detail-content"><header className="name-detail-heading"><div><p className="eyebrow">序名 · {workflowLabel(data)} · 名字详情</p><Dialog.Title>{item.fullName}<small>{item.pinyin}</small></Dialog.Title><Dialog.Description>免费查看出处、选名理由与本次契合说明。</Dialog.Description></div><Dialog.Close><IconButton variant="ghost" aria-label="关闭名字详情"><X size={20}/></IconButton></Dialog.Close></header>
      <nav className="name-detail-nav" aria-label="名字详情章节"><div className="name-detail-nav-sections">{[['nameDetailBenefits','推荐理由'],['nameDetailSources','古籍出处'],['nameDetailFit','出生契合'],['nameDetailElements','五行生克'],['nameDetailPlace','出生地']].map(([id,label])=><button type="button" key={id} onClick={()=>jump(id)}>{label}</button>)}</div><Dialog.Close><button type="button" className="detail-return" aria-label="返回备选列表"><ArrowLeft size={15}/>返回</button></Dialog.Close></nav>
      <NameExplanation detail={item.details} name={item.fullName}/>
      <footer className="name-detail-footer"><Dialog.Close><Button variant="outline"><ArrowLeft size={15}/>返回备选名字</Button></Dialog.Close><Button className="primary" aria-pressed={saved} onClick={()=>onSave(item)}><Heart size={16}/>{saved?'已收藏此名':'收藏这个名字'}</Button></footer>
    </div>}
  </Dialog.Content></Dialog.Root>;
}
