import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card } from '@radix-ui/themes';
import { ArrowDown, ArrowRight, ArrowUpRight, Copy, Heart, Layers2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { workflowLabel } from './form-state.js';
import NameDetail from './NameDetail.jsx';
import {JourneyWelcome, NamingDirection} from './NamingJourney.jsx';

export default function ProposalResults({data, draft, formStep, analysis, candidates, journeyCandidates, status, busy, saved, dirty, onApply, onEdit,
  groupIndex, comparisonKey, hasPrevious, hasNext, reportAvailable, onPrevious, onRegenerate, onCopy, onSave, onKeepsake, onSaved}) {
  const [selected, setSelected]=useState([]);
  const [viewed, setViewed]=useState([]), [comparedKey,setComparedKey]=useState('');
  const [detail,setDetail]=useState(null),detailTrigger=useRef(null);
  useEffect(()=>{setSelected([]);setViewed([]);setComparedKey('');},[comparisonKey]);
  useEffect(()=>setDetail(null),[candidates]);
  function compare(item) {
    setSelected(previous=>previous.some(x=>x.fullName===item.fullName) ? previous.filter(x=>x.fullName!==item.fullName) : previous.length<3 ? [...previous,item] : previous);
  }
  function readDetail(item) {setViewed(previous=>previous.includes(item.fullName)?previous:[...previous,item.fullName]);setDetail(item);}
  function openDetail(item,event) { detailTrigger.current=event.currentTarget;readDetail(item); }
  const savedHere = journeyCandidates.filter(item=>saved.includes(item.fullName));
  const compareItems = selected.length >= 2 ? selected : savedHere.slice(0,3);
  const comparisonId = compareItems.map(item=>item.fullName).join('|');
  const compared = compareItems.length >= 2 && comparedKey === comparisonId;
  const unread = candidates.find(item=>!viewed.includes(item.fullName) && !saved.includes(item.fullName) && !selected.some(chosen=>chosen.fullName===item.fullName));
  const next = unread || candidates.find(item=>!saved.includes(item.fullName));
  const allOpened = candidates.length>0 && candidates.every(item=>viewed.includes(item.fullName));
  const detailIndex = candidates.findIndex(item=>item.fullName===detail?.fullName);
  const nextDetail = detailIndex < candidates.length-1 ? candidates[detailIndex+1] : null;
  function showComparison(items = selected) {
    setSelected(items);setComparedKey(items.map(item=>item.fullName).join('|'));
    requestAnimationFrame(()=>{const panel=document.getElementById('candidateComparison');panel?.focus({preventScroll:true});panel?.scrollIntoView({behavior:'instant',block:'start'});});
  }
  const guideTitle = compared ? '把备选带给家人，一起读一读' : compareItems.length>=2 ? `已有${compareItems.length}个名字可以比较` : savedHere.length ? `本次已留下${savedHere.length}个心仪名字` : viewed.length ? '已有初步印象，留下喜欢的名字' : '方向已整理好，先读懂一个名字';
  const guideText = compared ? '比较出处、读音和寓意后，复制名单与家人讨论。完整报告可按需查看。' : compareItems.length>=2 ? '把名字放在一起，比较读音、寓意与出处；最多同时比较3个。' : savedHere.length ? next ? '可以继续了解其他名字，再留一个备选作比较；也可以直接查看收藏。' : '本组名字已留作备选，可以打开收藏名单，与家人一起讨论。' : allOpened ? '本组名字详情都已打开，可以回看喜欢的名字并收藏，或调整偏好寻找其他方向。' : viewed.length ? '喜欢就点收藏；暂时没有心动的，继续了解下一个，或调整偏好。' : '先看推荐理由、古籍原句与本次契合，喜欢再收藏。';
  const guideAction = compared ? '复制备选给家人' : compareItems.length>=2 ? '比较备选名字' : !next ? '查看收藏名单' : !viewed.length && !savedHere.length ? '从第一个名字开始了解' : unread ? '继续了解下一个名字' : '回看名字详情';
  return <section id="results" className="results-section wrap public-proposals" aria-label="免费名字提案" tabIndex={-1}>
    <div className="section-heading"><div><p className="eyebrow"><span>02</span> 命名结果 / YOUR SHORTLIST</p><h2>你的名字提案</h2></div><Button type="button" variant="outline" color="gray" className="secondary" disabled={busy || !analysis || !hasNext} onClick={onRegenerate}><RefreshCw size={15}/>换一组名字</Button></div>
    <p id="resultStatus" className="results-status" role="status">{status}</p>
    {dirty && <section className="draft-notice" aria-label="尚未应用的修改"><div><b>填写内容已修改</b><p>当前仍是上一份提案，请应用修改后再申请报告。</p></div><button type="button" className="primary" disabled={busy} onClick={onApply}>应用修改并生成</button></section>}
    {analysis && <div id="summary" className="proposal-context"><strong>{data.surname} · {workflowLabel(data)}</strong><span>第{groupIndex+1}组 · {data.length || 2}字名 · 免费提案</span><button type="button" className="edit-context" onClick={()=>onEdit(1)}>修改出生信息</button></div>}
    {analysis && !!candidates.length && <NamingDirection data={data} first={candidates[0]} count={candidates.length} progress={savedHere.length || selected.length ? 2 : viewed.length ? 1 : 0}>
      {!dirty && <div className="selection-guide" aria-label="选名下一步"><div aria-live="polite"><strong>{guideTitle}</strong><p>{guideText}</p></div>
        <Button type="button" className="primary" disabled={busy} onClick={event=>compared ? onCopy(compareItems.map(item=>item.fullName).join('、')) : compareItems.length>=2 ? showComparison(compareItems) : next ? openDetail(next,event) : onSaved()}>{guideAction}<ArrowRight size={15}/></Button>
        <button type="button" className="journey-adjust" disabled={busy} onClick={()=>onEdit(2)}>暂时没心动？调整偏好</button>
      </div>}
    </NamingDirection>}
    {analysis && <nav className="proposal-shortcuts" aria-label="提案快捷操作">
      {reportAvailable && <a className="report-jump" href="#experienceReport">报告与反馈<ArrowDown size={14}/></a>}
      {!!selected.length && <a href="#candidateComparison" onClick={event=>{event.preventDefault();showComparison();}}>查看比较<span className="comparison-count" aria-label={`已选${selected.length}个名字`}>{selected.length}</span></a>}
      <button type="button" onClick={()=>onEdit(2)}><SlidersHorizontal size={14}/>调整条件</button>
    </nav>}
    <div id="cards" className="cards">
      {candidates.map((item,index)=><Card asChild key={item.fullName}><article className={`card proposal-card${saved.includes(item.fullName)?' is-saved':''}`} tabIndex={-1}>
        <div className="proposal-card-top"><span>名字提案 / {String(index+1).padStart(2,'0')}</span><Badge color="jade" variant="soft" className="proposal-free">免费</Badge></div>
        <div className="name-specimen"><span className="specimen-glyph" aria-hidden="true">{[...item.fullName].at(-1)}</span><h3>{item.fullName}</h3><p className="pinyin">{item.pinyin}</p></div><p className="meaning"><small>一份心意</small>{item.meaning}</p>
        <p className="proposal-source-preview">{item.details?.source.citations.length ? `${item.details.source.label} · ${[...new Set(item.details.source.citations.map(c=>`《${c.work}》`))].join('、')}` : '现代字义组合'}</p>
        <Button type="button" variant="outline" className="name-detail-entry" aria-label={`查看${item.fullName}的名字详情`} onClick={event=>openDetail(item,event)}>查看名字详情<ArrowUpRight size={15}/></Button>
        <div className="proposal-actions"><Button type="button" size="1" variant={saved.includes(item.fullName)?'solid':'soft'} color="jade" className="save" aria-pressed={saved.includes(item.fullName)} onClick={()=>onSave(item)}><Heart size={14}/>{saved.includes(item.fullName)?'已收藏':'收藏'}</Button><Button type="button" size="1" variant="ghost" color="gray" onClick={()=>onCopy(item.fullName)}><Copy size={14}/>复制名字</Button>
          <Button type="button" size="1" variant="ghost" color="gray" className="compare-name" aria-pressed={selected.some(x=>x.fullName===item.fullName)} disabled={selected.length>=3 && !selected.some(x=>x.fullName===item.fullName)} onClick={()=>compare(item)}><Layers2 size={13}/>加入比较</Button><Button type="button" size="1" variant="ghost" color="gray" className="make-keepsake" onClick={()=>onKeepsake(item.fullName)}>名字卡</Button></div>
      </article></Card>)}
      {analysis && !candidates.length && <div className="empty-result"><p>当前条件{data.requiredChars?`（必用字：${data.requiredChars}）`:''}下没有匹配的名字，请调整设置后重试。</p><button type="button" className="secondary" onClick={()=>onEdit(2,'requiredChars')}>调整必用字或避讳</button><button type="button" className="secondary" onClick={()=>onEdit(2,'numerologyMode')}>调整数理筛选</button></div>}
      {!analysis && <JourneyWelcome draft={draft} step={formStep} onContinue={()=>onEdit(formStep)}/>}
    </div>
    {!!selected.length && <section id="candidateComparison" className="proposal-comparison" aria-label="名字比较" tabIndex={-1}><div className="comparison-heading"><h3>放在一起，读一读 <small>已选 {selected.length}/3</small></h3><button type="button" onClick={()=>setSelected([])}>清空比较</button></div><div className="proposal-compare-grid">
      {selected.map(item=><article key={item.fullName}><h4>{item.fullName}</h4><p>{item.pinyin}</p><p>{item.meaning}</p><p className="comparison-source">出处：{item.details?.source.citations.length ? [...new Set(item.details.source.citations.map(c=>`《${c.work}》${c.chapter}`))].join('、') : '现代字义组合'}</p><button type="button" className="name-detail-entry" aria-label={`查看${item.fullName}的名字详情`} onClick={event=>openDetail(item,event)}>名字详情<ArrowUpRight size={13}/></button><button type="button" onClick={()=>compare(item)}>移除{item.fullName}</button></article>)}
    </div>{selected.length>=2 && <div className="comparison-next"><p>一起读一读全名，再看看哪个更贴近家庭心意。</p><Button type="button" className="primary" onClick={()=>onCopy(selected.map(item=>item.fullName).join('、'))}><Copy size={14}/>复制比较名单</Button></div>}</section>}
    {analysis && <div className="proposal-footer"><div><button id="previousGroup" type="button" className="secondary" disabled={busy || !hasPrevious} onClick={onPrevious}>上一组</button><button id="regenerate" type="button" className="secondary" disabled={busy || !hasNext} onClick={onRegenerate}>下一组</button><button type="button" className="secondary" onClick={()=>onEdit(2)}>调整偏好</button><button type="button" className="secondary" onClick={onSaved}>查看收藏</button></div></div>}
    <p className="proposal-scope">每个名字都可免费查看出处与选名说明。完整四柱、旺衰与排盘口径，可在下方体验报告中查看。</p>
    <NameDetail item={detail} data={data} saved={detail ? saved.includes(detail.fullName) : false} onSave={onSave} onClose={()=>setDetail(null)} returnFocus={detailTrigger.current} onNext={nextDetail ? ()=>readDetail(nextDetail) : undefined}/>
  </section>;
}
