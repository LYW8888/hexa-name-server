import React, { useEffect, useRef, useState } from 'react';
import { copyText } from './utils.js';

export default function Keepsake({ selection, toast }) {
  const [name,setName] = useState(''), [wish,setWish] = useState('愿你心有光亮，行有方向。'), [error,setError] = useState('');
  const input=useRef(null), wishInput=useRef(null), canvas=useRef(null);
  const publicSite=window.Keepsake.siteURL(window.location.href);
  const recommendation=window.Keepsake.recommendationURL(window.location.href);
  useEffect(()=>{ if(selection) { setName(selection.name);setError('');input.current?.focus({preventScroll:true}); } },[selection]);
  useEffect(()=>{
    const state=window.Keepsake.validate(name,wish);
    function draw(){ if(canvas.current) window.Keepsake.draw(canvas.current,state.name,state.wish,publicSite); }
    draw(); let active=true;
    document.fonts?.ready.then(()=>{ if(active)draw(); }).catch(()=>{});
    return ()=>{active=false;};
  },[name,wish,publicSite]);
  function download() {
    const state=window.Keepsake.validate(name,wish);
    if(state.error){setError(state.error);(state.error.includes('祝愿') ? wishInput : input).current?.focus();return;}
    setError('');
    if(!window.Keepsake.draw(canvas.current,state.name,state.wish,publicSite) || typeof canvas.current.toBlob !== 'function') {toast('当前浏览器无法导出图片，请尝试其他浏览器。','info');return;}
    canvas.current.toBlob(blob=>{
      if(!blob){toast('图片生成失败，请稍后重试。','info');return;}
      const url=URL.createObjectURL(blob), link=document.createElement('a');
      const safe=state.name.replace(/[^\p{Script=Han}A-Za-z0-9_-]/gu,'').slice(0,24);
      link.href=url;link.download=`序名心愿卡-${safe || '名字'}.png`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),5000);
      toast('心愿卡已下载，分享前请确认图片内容。');
    },'image/png');
  }
  async function copy() { try {if(!await copyText(recommendation))throw new Error();toast('网站链接已复制，可以自行发给亲友。');}catch{toast('复制失败，请手动复制下方网站地址。','info');} }
  async function share() {try{await navigator.share({title:'序名 · 命名参考',text:'为家人寻找名字灵感。',url:recommendation});}catch(error){if(error.name !== 'AbortError')toast('分享未完成，可使用复制推荐链接。','info');}}
  const isLocal=['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
  const hint=!publicSite ? '当前页面没有可分享的网站地址；卡片仍可在本机制作。' : isLocal ? '当前是本机测试地址，亲友无法通过此地址访问；上线后可复制正式链接。链接只含固定来源参数，不含姓名和出生信息。' : '卡片在本机生成；推荐链接仅含固定来源参数，不含姓名或出生信息。站内尚未统计推荐数据。';
  return <section className="keepsake" id="keepsake"><div className="wrap keepsake-layout"><div className="keepsake-copy"><p className="eyebrow">A LITTLE GIFT FOR THE FUTURE</p><h2>把心意，<br/>留成一张名字卡。</h2><p>选一个喜欢的名字，写下一句祝愿。生成专属于家人的小卡片，留存或分享给亲友。</p><div className="keepsake-editor"><label>想写在卡片上的名字<input ref={input} id="keepsakeName" maxLength={24} autoComplete="off" placeholder="例如：林知衡" value={name} onChange={e=>{setName(e.target.value);setError('');}}/><small className="field-hint">可从名字方案中选择，也可以自行填写，最多 12 个字符。</small></label><label>想送上的一句话<textarea ref={wishInput} id="keepsakeWish" rows="2" maxLength={80} value={wish} onChange={e=>{setWish(e.target.value);setError('');}}/><small className="field-hint">最多 40 个字符；卡片不会自动包含出生资料。</small></label><p id="keepsakeMessage" className="keepsake-message" role="alert" hidden={!error}>{error}</p><div className="keepsake-actions"><button className="primary" type="button" id="downloadKeepsake" onClick={download}>下载心愿卡 <span aria-hidden="true">↓</span></button><button className="secondary" type="button" id="copySiteLink" disabled={!publicSite} onClick={copy}>复制推荐链接</button><button className="secondary" type="button" id="shareSite" hidden={!publicSite || typeof navigator.share !== 'function'} onClick={share}>分享网站 ↗</button></div><p className="keepsake-note" id="shareHint">{hint}</p><p className="keepsake-link" id="siteLink" aria-label="推荐链接">{recommendation}</p></div></div><div className="keepsake-preview"><div className="keepsake-preview-head"><span>YOUR NAME, YOUR WISH</span><span>实时预览</span></div><canvas ref={canvas} id="keepsakeCanvas" width="900" height="1120" role="img" aria-label={`名字心愿卡预览：${name || '尚未填写名字'}${wish ? `，祝愿：${wish}` : ''}`}/><p>可下载为图片，分享前请确认卡片上填写的内容。</p></div></div></section>;
}
