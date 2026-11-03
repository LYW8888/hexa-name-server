import React, { useEffect, useState } from 'react';
import { Badge, Button, Card } from '@radix-ui/themes';
import { ArrowUpRight, Copy, Heart, Layers2, RefreshCw } from 'lucide-react';
import { BrandMark } from './ui/CelestialArt.jsx';
import { workflowLabel } from './form-state.js';

export default function ProposalResults({data, analysis, candidates, status, busy, saved, dirty, onApply, onEdit,
  groupIndex, comparisonKey, hasPrevious, hasNext, onPrevious, onRegenerate, onCopy, onSave, onKeepsake, onSaved}) {
  const [selected, setSelected]=useState([]);
  useEffect(()=>setSelected([]),[comparisonKey]);
  function compare(item) {
    setSelected(previous=>previous.some(x=>x.fullName===item.fullName) ? previous.filter(x=>x.fullName!==item.fullName) : previous.length<3 ? [...previous,item] : previous);
  }
  return <section id="results" className="results-section wrap public-proposals" aria-label="免费名字提案">
    <div className="section-heading"><div><p className="eyebrow"><span>02</span> 命名结果 / YOUR SHORTLIST</p><h2>你的名字提案</h2></div><Button type="button" variant="outline" color="gray" className="secondary" disabled={busy || !analysis || !hasNext} onClick={onRegenerate}><RefreshCw size={15}/>换一组名字</Button></div>
    <p id="resultStatus" className="results-status" role="status">{status}</p>
    {dirty && <section className="draft-notice" aria-label="尚未应用的修改"><div><b>填写内容已修改</b><p>当前仍是上一份提案，请应用修改后再申请报告。</p></div><button type="button" className="primary" disabled={busy} onClick={onApply}>应用修改并生成</button></section>}
    {analysis && <div id="summary" className="proposal-context"><strong>{data.surname} · {workflowLabel(data)}</strong><span>第{groupIndex+1}组 · {data.length || 2}字名 · 免费提案</span><button type="button" className="edit-context" onClick={()=>onEdit(1)}>修改出生信息</button></div>}
    <div id="cards" className="cards">
      {candidates.map((item,index)=><Card asChild key={item.fullName}><article className="card proposal-card" tabIndex={-1}>
        <div className="proposal-card-top"><span>名字提案 / {String(index+1).padStart(2,'0')}</span><Badge color="iris" variant="soft" className="proposal-free">免费</Badge></div>
        <div className="name-specimen"><span className="specimen-glyph" aria-hidden="true">{[...item.fullName].at(-1)}</span><h3>{item.fullName}</h3><p className="pinyin">{item.pinyin}</p></div><p className="meaning"><small>一份心意</small>{item.meaning}</p>
        <div className="proposal-actions"><Button type="button" size="1" variant={saved.includes(item.fullName)?'solid':'soft'} color="iris" className="save" aria-pressed={saved.includes(item.fullName)} onClick={()=>onSave(item)}><Heart size={14}/>{saved.includes(item.fullName)?'已收藏':'收藏'}</Button><Button type="button" size="1" variant="ghost" color="gray" onClick={()=>onCopy(item.fullName)}><Copy size={14}/>复制名字</Button>
          <Button type="button" size="1" variant="ghost" color="gray" className="compare-name" aria-pressed={selected.some(x=>x.fullName===item.fullName)} disabled={selected.length>=3 && !selected.some(x=>x.fullName===item.fullName)} onClick={()=>compare(item)}><Layers2 size={13}/>加入比较</Button><Button type="button" size="1" variant="ghost" color="gray" className="make-keepsake" onClick={()=>onKeepsake(item.fullName)}>名字卡</Button></div>
      </article></Card>)}
      {analysis && !candidates.length && <div className="empty-result"><p>当前条件{data.requiredChars?`（必用字：${data.requiredChars}）`:''}下没有匹配的名字，请调整设置后重试。</p><button type="button" className="secondary" onClick={()=>onEdit(2,'requiredChars')}>调整必用字或避讳</button><button type="button" className="secondary" onClick={()=>onEdit(2,'numerologyMode')}>调整数理筛选</button></div>}
      {!analysis && <div className="empty-result"><BrandMark/><div><h3>下一个好名字，正在等你。</h3><p>填好基本信息，先免费探索名字、读音与寓意。</p></div><a href="#form" className="secondary">前往起名<ArrowUpRight size={15}/></a></div>}
    </div>
    {!!selected.length && <section id="candidateComparison" className="proposal-comparison" aria-label="名字比较"><div className="comparison-heading"><h3>放在一起，读一读 <small>已选 {selected.length}/3</small></h3><button type="button" onClick={()=>setSelected([])}>清空比较</button></div><div className="proposal-compare-grid">
      {selected.map(item=><article key={item.fullName}><h4>{item.fullName}</h4><p>{item.pinyin}</p><p>{item.meaning}</p><button type="button" onClick={()=>compare(item)}>移除{item.fullName}</button></article>)}
    </div></section>}
    {analysis && <div className="proposal-footer"><div><button id="previousGroup" type="button" className="secondary" disabled={busy || !hasPrevious} onClick={onPrevious}>上一组</button><button id="regenerate" type="button" className="secondary" disabled={busy || !hasNext} onClick={onRegenerate}>下一组</button><button type="button" className="secondary" onClick={()=>onEdit(2)}>调整偏好</button><button type="button" className="secondary" onClick={onSaved}>查看收藏</button></div></div>}
    <p className="proposal-scope">先比较姓名、读音与寓意。想了解四柱、五行与逐名依据，可在下方免费体验完整报告。</p>
  </section>;
}
