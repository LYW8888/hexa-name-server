import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header, Hero, Plans, Method, Footer } from './Layout.jsx';
import NamingForm from './NamingForm.jsx';
import Results from './Results.jsx';
import Keepsake from './Keepsake.jsx';
import CustomerArea from './CustomerArea.jsx';
import { copyText, friendlyError, downloadReportFile } from './utils.js';

const DEFAULT_STATUS='完成信息后，这里会出现可比较的名字方向。';
function stored() {
  let names=[],details=Object.create(null);
  try { const value=JSON.parse(localStorage.getItem('序名收藏') || '[]'); names=Array.isArray(value) ? [...new Set(value.filter(x=>typeof x==='string'))] : []; } catch {}
  try { const value=JSON.parse(localStorage.getItem('序名收藏详情') || '{}'); if(value && typeof value==='object' && !Array.isArray(value)) for(const name of names){const item=value[name];if(item && typeof item.pinyin==='string' && typeof item.meaning==='string')details[name]={pinyin:item.pinyin,meaning:item.meaning,source_status:item.source_status};} }catch{}
  return {names,details};
}
function behavior(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';}
function scroll(id){requestAnimationFrame(()=>document.querySelector(id)?.scrollIntoView({behavior:behavior(),block:'start'}));}
async function requestAnalysis(data){
  try{const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const payload=await response.json();if(!response.ok)throw new Error(payload.error || '分析请求未通过校验');const chart=payload.analysis?.bazi;if(!chart || !Array.isArray(chart.pillars) || chart.pillars.length!==4 || !chart.day_master || !chart.element_counts || !Array.isArray(chart.conventions) || !chart.source || !Array.isArray(payload.candidates))throw new Error('服务未返回完整方案，请重试。');return payload;}catch(error){if(error instanceof TypeError)throw new Error('无法连接排盘服务，请检查网络后重试。');throw error;}
}
export default function App(){
  const [favorite,setFavorite]=useState(stored), [savedOpen,setSavedOpen]=useState(false), [selection,setSelection]=useState(null);
  const [counts,setCounts]=useState({}), [product,setProduct]=useState(null), [message,setMessage]=useState('');
  const [result,setResult]=useState(null), [status,setStatus]=useState(DEFAULT_STATUS), [busy,setBusy]=useState(false), [notice,setNotice]=useState(null);
  const timer=useRef(null);
  const toast=useCallback((text,type='success')=>{window.clearTimeout(timer.current);setNotice({text,type});timer.current=window.setTimeout(()=>setNotice(null),3200);},[]);
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  useEffect(()=>{
    let active=true;
    fetch('/api/name-counts').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{if(active)setCounts(data.counts || {});}).catch(()=>{});
    fetch('/api/product').then(r=>{if(!r.ok)throw new Error();return r.json();}).catch(()=>fetch('/data/product.json').then(r=>r.json())).then(data=>{if(active)setProduct(data);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  function persist(next){
    setFavorite(next);
    try{localStorage.setItem('序名收藏',JSON.stringify(next.names));localStorage.setItem('序名收藏详情',JSON.stringify(next.details));return true;}catch{toast('当前浏览器无法保存收藏，本次收藏仅在页面打开期间有效。','info');return false;}
  }
  function save(item){
    const exists=favorite.names.includes(item.fullName), names=exists ? favorite.names.filter(x=>x!==item.fullName) : [...favorite.names,item.fullName], details={...favorite.details};
    if(exists)delete details[item.fullName];else details[item.fullName]={pinyin:item.pinyin,meaning:item.meaning,source_status:item.source_status};
    if(persist({names,details}))toast(exists ? `已取消收藏${item.fullName}` : `已收藏${item.fullName}`);
  }
  function remove(name){const details={...favorite.details};delete details[name];if(persist({names:favorite.names.filter(x=>x!==name),details}))toast('已取消收藏。');}
  function clear(){if(persist({names:[],details:{}}))toast('本地收藏已清除。');}
  async function copy(name){try{if(!await copyText(name))throw new Error();toast(`已复制${name}，可以发给家人讨论。`);}catch{toast('复制失败，请长按名字手动复制。','info');}}
  async function generate(data, isRegenerate=false){
    if(busy)return;
    setBusy(true);setMessage('');
    if(!isRegenerate){setResult(null);setStatus('正在生成方案…');}
    try{
      const payload=await requestAnalysis(data), candidates=window.NameEngine.candidates(data,payload.analysis,payload.candidates);
      setResult({data,analysis:payload.analysis,candidates});
      const count=candidates.length, requested=Number(data.candidateCount || 3);
      const prefix=isRegenerate ? `已按第 ${data.variant} 轮重新整理 ${count} 个方案。` : `已生成 ${count} 个方向，可展开卡片查看演示意象及资料状态。`;
      setStatus(count ? `${prefix}${count < requested ? `当前字数和避用字条件下，演示字库仅匹配 ${count} 个。` : ''}` : '四柱已计算，当前条件下没有符合要求的候选。');
      if(!isRegenerate)scroll('#results');
      toast(count ? (isRegenerate ? '已重新整理候选方向。' : '名字方案已生成，先收藏喜欢的方向。') : '请调整避用字或名字字数后重试。',count && !isRegenerate ? 'success' : 'info');
    }catch(error){
      if(isRegenerate)toast(friendlyError(error.message || ''),'info');
      else{setResult(null);setStatus('暂时无法生成方案。');setMessage(friendlyError(error.message || ''));scroll('#formMessage');}
    }finally{setBusy(false);}
  }
  function regenerate(){if(result?.analysis?.bazi)generate({...result.data,variant:(Number(result.data.variant)+1)%100001},true);else{scroll('#form');toast('先完成上方信息，就能生成名字方案。','info');}}
  function openKeepsake(name){setSelection({name});scroll('#keepsake');}
  function showSaved(){setSavedOpen(true);scroll('#savedPanel');}
  return <><Header count={favorite.names.length} onSaved={showSaved} onAccount={()=>scroll('#account')}/><main id="top"><Hero/><NamingForm onGenerate={generate} busy={busy} counts={counts} message={message} setMessage={setMessage} toast={toast}/><Results data={result?.data} analysis={result?.analysis} candidates={result?.candidates || []} status={status} busy={busy} saved={favorite.names} details={favorite.details} savedOpen={savedOpen} onCloseSaved={()=>setSavedOpen(false)} onRemove={remove} onRegenerate={regenerate} onDownload={()=>downloadReportFile(result.data,result.analysis,result.candidates,toast)} onCopy={copy} onSave={save} onKeepsake={openKeepsake}/><CustomerArea result={result} toast={toast}/><Keepsake selection={selection} toast={toast}/><Plans product={product} toast={toast}/><Method/></main><Footer clear={clear}/><div id="toast" className={`toast ${notice?.type || ''}`} role="status" aria-live="polite" hidden={!notice}>{notice?.text}</div></>;
}
