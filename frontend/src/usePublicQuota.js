import {useCallback,useEffect,useRef,useState} from 'react';
import {mergeQuota,quotaSnapshot} from './quota-state.js';

export default function usePublicQuota(){
  const [data,setData]=useState(null),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(true);
  const current=useRef(null),epoch=useRef(0),controller=useRef(null),alive=useRef(true);
  const accept=useCallback(value=>{
    const next=mergeQuota(current.current,value);
    ++epoch.current;controller.current?.abort();current.current=next;
    if(alive.current){setData(next);setError('');setRefreshing(false);}
    return next;
  },[]);
  const refresh=useCallback(async()=>{
    const request=++epoch.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    if(alive.current)setRefreshing(true);
    const timer=setTimeout(()=>abort.abort(),5000);
    try{
      const response=await fetch('/api/beta-quota',{cache:'no-store',signal:abort.signal});
      if(!response.ok)throw Error('体验名额暂时无法读取，请稍后重试。');
      const snapshot=quotaSnapshot(await response.json());
      if(request!==epoch.current||!alive.current)return current.current;
      current.current=mergeQuota(current.current,snapshot);setData(current.current);setError('');return current.current;
    }catch(e){if(request===epoch.current&&alive.current)setError('名额信息待刷新，请重试。');return null;}
    finally{clearTimeout(timer);if(request===epoch.current&&alive.current)setRefreshing(false);}
  },[]);
  useEffect(()=>{
    alive.current=true;refresh();
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    const timer=setInterval(visible,20000);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
    return()=>{alive.current=false;++epoch.current;controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
  },[refresh]);
  return {data,error,refreshing,refresh,accept};
}
