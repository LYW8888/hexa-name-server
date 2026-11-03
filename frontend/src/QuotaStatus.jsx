import React from 'react';
import {RefreshCw} from 'lucide-react';

export default function QuotaStatus({quota}){
  const {data,error,refreshing}=quota;
  return <section id="trialQuota" className={`quota-status${error?' quota-stale':''}`} aria-label="免费报告体验名额" aria-busy={refreshing}>
    <div className="quota-title"><span className="quota-live"/><b>{!data?'完整报告内测':!data.enabled?'内测已暂停':data.remaining?'免费完整报告内测':'本轮名额已用尽'}</b><button type="button" onClick={quota.refresh} disabled={refreshing} aria-label="刷新体验名额"><RefreshCw size={13}/></button></div>
    <div className="quota-values" aria-live="polite"><div><small>总名额</small><strong data-quota="total">{data?data.total:'—'}</strong></div><i/><div><small>已使用</small><strong data-quota="used">{data?data.used:'—'}</strong></div><i/><div><small>剩余</small><strong data-quota="remaining">{data?data.remaining:'—'}</strong></div></div>
    <p>{error||(refreshing&&!data?'正在读取真实名额…':'按完整报告份数计次，重复查看不扣次。')}</p>
  </section>;
}
