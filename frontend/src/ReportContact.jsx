import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { copyText } from "./utils.js";

export default function ReportContact({ result, contact, toast }) {
  const [available, setAvailable] = useState(false), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [receipt, setReceipt] = useState(null);
  const entries = useRef(new WeakMap()), submitting = useRef(false), activeResult=useRef(result);
  activeResult.current=result;
  useEffect(() => {
    fetch('/api/report-service', {cache:'no-store'}).then(r => r.ok ? r.json() : null).then(x => setAvailable(!!x?.available)).catch(() => {});
  }, []);
  useLayoutEffect(() => {
    setConsent(false); setMessage("");
    if (result && !entries.current.has(result)) entries.current.set(result, {key:globalThis.crypto?.randomUUID?.()});
    setReceipt(result ? entries.current.get(result)?.receipt || null : null);
  }, [result]);
  async function copy(value, label) {
    try { if (!await copyText(value)) throw Error(); toast(`${label}已复制。`); }
    catch { toast('复制未完成，请长按文字复制。','info'); }
  }
  async function submit() {
    if (submitting.current || !result || !consent) return;
    const entry = entries.current.get(result);
    if (!entry?.key) return setMessage('请通过安全连接提交，或直接联系经营者。');
    submitting.current = true; setBusy(true); setMessage("");
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),25000);
    try {
      const response = await fetch('/api/report-requests', {method:'POST', cache:'no-store', signal:controller.signal, headers:{'Content-Type':'application/json'},
        body:JSON.stringify({request_key:entry.key, input:result.data, consent:true, expected_names:result.candidates.map(x=>x.fullName)})});
      const data = await response.json().catch(()=>({error:'登记暂时不可用，请直接联系经营者。'}));
      if (!response.ok) throw Error(data.error || '登记未完成，请稍后重试。');
      if (typeof data.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) throw Error('登记未完成，请稍后重试。');
      entry.receipt = data;if(activeResult.current===result){setReceipt(data);setConsent(false);}
    } catch (error) {if(activeResult.current===result)setMessage(error.name==='AbortError'?'登记响应超时，资料仍保留，请重试或直接联系经营者。':error.message || '连接失败，资料仍保留，请重试或直接联系经营者。');}
    finally {clearTimeout(timer);submitting.current=false;setBusy(false);}
  }
  return <section id="reportRequest" className="report-contact" aria-label="联系获取完整报告">
    <div className="report-contact-heading"><p className="eyebrow">BEYOND THE NAME</p><h3>喜欢这个名字，也想了解它的依据？</h3>
      <p>免费提供名字提案。完整现名分析、四柱排盘、五行喜用、古籍出处与选名说明，由经营者核对后人工交付。</p></div>
    <div className="contact-channels">
      {contact?.wechat && <div><span>微信</span><b>{contact.wechat}</b><button type="button" className="secondary" onClick={()=>copy(contact.wechat,'微信号')}>复制微信号</button></div>}
      {contact?.qq && <div><span>QQ</span><b>{contact.qq}</b><button type="button" className="secondary" onClick={()=>copy(contact.qq,'QQ号')}>复制QQ号</button></div>}
    </div>
    {receipt ? <div className="report-receipt" role="status"><b>资料已登记，请联系经营者并提供申请编号</b><code>{receipt.id}</code>
      <button type="button" className="primary" onClick={()=>copy(`序名完整报告申请\n申请编号：${receipt.id}\n名字提案：${result.candidates.map(x=>x.fullName).join('、')}`,'咨询信息')}>复制申请编号与名字</button>
      <p>登记不代表已经购买。请通过上方渠道确认报告范围、费用与交付时间；完整报告由经营者发送。</p></div>
      : result?.candidates?.length && available ? <div className="report-application">
        <label className="report-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} />
          <span>我同意将本次出生资料、命名偏好和名字提案提交给经营者，用于整理和人工交付报告，保留30天。</span></label>
        <button type="button" className="primary" disabled={!consent || busy} onClick={submit}>{busy?'正在登记…':'登记资料，获取申请编号'}</button>
        <small>先登记，再通过微信或QQ联系；不会自动扣费。</small>
      </div> : <p className="contact-direct">{result?.candidates?.length ? '可直接通过微信或QQ联系经营者，确认完整报告的内容、费用与交付时间。' : '先免费生成名字提案，也可以直接联系经营者说明需求。'}</p>}
    {message && <p className="form-message error" role="alert">{message}</p>}
  </section>;
}
