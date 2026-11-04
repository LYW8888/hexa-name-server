import React,{useId} from 'react';

// Decorative sky and ink-wash horizon, never a calculated star or birth chart.
export default function DreamSky(){
  const id=useId().replace(/[^a-zA-Z0-9]/g,'');
  const stars=Array.from({length:58},(_,i)=>[32+(i*173)%1372,92+(i*113)%740,i%7===0?2:1]);
  return <svg className="dream-sky" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMin slice" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}moon`}><stop stopColor="#fffdf8"/><stop offset=".5" stopColor="#faf0ff" stopOpacity=".8"/><stop offset="1" stopColor="#d8c6ed" stopOpacity="0"/></radialGradient>
      <linearGradient id={`${id}mountain`} x1="600" y1="700" x2="620" y2="1000" gradientUnits="userSpaceOnUse"><stop stopColor="#9eb7d2" stopOpacity=".13"/><stop offset="1" stopColor="#e4def2" stopOpacity="0"/></linearGradient>
    </defs>
    <g className="dream-sky-stars">{stars.map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill={i%3===0?'#ae9ac9':'#a3bfd3'} opacity={i%7===0?'.65':'.4'}/>)}</g>
    <g stroke="#b4a8d1" strokeWidth=".8" opacity=".36"><path d="m42 156 89-27 61 56 62-16m878 274 76-45 47 18 89-59m-1173 244 62 38 82-14"/>
      <circle cx="131" cy="129" r="4"/><circle cx="192" cy="185" r="3"/><circle cx="1208" cy="398" r="4"/>
    </g>
    <g className="dream-sky-moon"><circle cx="1235" cy="150" r="76" fill={`url(#${id}moon)`}/><path d="M1245 123a27 27 0 1 0 11 45 26 26 0 0 1-11-45Z" fill="#fffdfa" stroke="#c7b4d7" strokeWidth=".6"/></g>
    <g stroke="#b9a3cd" strokeWidth=".7" opacity=".5"><path d="m306 107 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm1018 426 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"/></g>
    <path d="M-30 838 92 774 168 812 284 714 352 766 413 736 529 834 658 770 756 812 872 704 958 767 1044 742 1185 840 1309 765 1460 830v170H-30Z" fill={`url(#${id}mountain)`}/>
    <path d="m-30 838 122-64 76 38 116-98 68 52 61-30 116 98 129-64 98 42 116-108 86 63 86-25 141 98 124-75 151 65" stroke="#b9b4ce" strokeWidth=".7" opacity=".2"/>
    <path d="M-40 890c192-61 271-29 429-1s227-29 353-6 217 47 353 4 240-9 385 20" stroke="#c3b8d6" strokeWidth=".8" opacity=".3"/>
  </svg>;
}
