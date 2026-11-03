import React from 'react';
import {copyText} from './utils.js';
import {Copy,MessageCircle} from 'lucide-react';
export default function ReportContact({contact,toast}) {
  async function copy(value,label){try{if(!await copyText(value))throw Error();toast(`${label}已复制。`);}catch{toast('复制未完成，请长按文字复制。','info');}}
  return <section id="reportRequest" className="report-contact" aria-label="联系方式"><div><MessageCircle size={18}/><b>与序名聊聊</b><span>咨询与建议</span></div><div className="contact-channels">{[['微信',contact?.wechat,'微信号'],['QQ',contact?.qq,'QQ号']].filter(x=>x[1]).map(([label,value,title])=><div key={label}><span>{label}</span><b>{value}</b><button type="button" onClick={()=>copy(value,title)} aria-label={`复制${title}`}><Copy size={14}/>复制</button></div>)}</div></section>;
}
