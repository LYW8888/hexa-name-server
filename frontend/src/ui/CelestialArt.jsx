import React, { useId } from 'react';

export function BrandMark() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="brand-mark">
    <path d="M20 2 24.5 15.5 38 20 24.5 24.5 20 38 15.5 24.5 2 20 15.5 15.5Z" stroke="currentColor" strokeWidth="1"/>
    <path d="m20 10 2.5 7.5L30 20l-7.5 2.5L20 30l-2.5-7.5L10 20l7.5-2.5Z" fill="currentColor"/>
    <path d="m7 7 6 6m14 14 6 6M33 7l-6 6M13 27l-6 6" stroke="currentColor" strokeWidth=".7" opacity=".45"/>
  </svg>;
}

// Decorative only. These stars and paths never represent a calculated chart.
export default function CelestialArt({ compact = false }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const stars = [[42,96,1],[93,251,1.4],[171,52,1],[259,143,1.6],[334,39,1],[430,109,1],[543,57,1.5],[618,189,1],[671,303,1.5],[590,433,1],[479,539,1.3],[245,515,1],[123,458,1.5],[41,368,1],[361,465,1.2],[605,309,.8],[510,215,.8],[187,335,.8],[317,245,1]];
  return <svg className={`celestial-art orb${compact ? ' celestial-art-compact' : ''}`} viewBox="0 0 720 600" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}halo`}><stop stopColor="#7d78db" stopOpacity=".23"/><stop offset=".52" stopColor="#4c5b9d" stopOpacity=".08"/><stop offset="1" stopColor="#10121d" stopOpacity="0"/></radialGradient>
      <linearGradient id={`${id}silver`} x1="247" y1="155" x2="464" y2="412" gradientUnits="userSpaceOnUse"><stop stopColor="#fffdf4"/><stop offset=".35" stopColor="#a9b1d5"/><stop offset=".58" stopColor="#eef0fc"/><stop offset=".79" stopColor="#626a8c"/><stop offset="1" stopColor="#b9a888"/></linearGradient>
      <linearGradient id={`${id}orbit`} x1="69" y1="440" x2="630" y2="146" gradientUnits="userSpaceOnUse"><stop stopColor="#ac9b7d" stopOpacity="0"/><stop offset=".38" stopColor="#aba3ee" stopOpacity=".45"/><stop offset=".7" stopColor="#e6e0cf" stopOpacity=".9"/><stop offset="1" stopColor="#757fba" stopOpacity="0"/></linearGradient>
      <linearGradient id={`${id}land`} x1="363" y1="432" x2="363" y2="599" gradientUnits="userSpaceOnUse"><stop stopColor="#b2b3da" stopOpacity=".13"/><stop offset="1" stopColor="#111521" stopOpacity="0"/></linearGradient>
      <filter id={`${id}glow`} x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <ellipse cx="381" cy="285" rx="315" ry="285" fill={`url(#${id}halo)`}/>
    <g className="celestial-stars" fill="#dadced">{stars.map(([cx,cy,r],i)=><circle key={i} cx={cx} cy={cy} r={r} opacity={i%3===0 ? '.85' : '.4'}/>)}</g>
    <g stroke="#8e92b6" strokeOpacity=".14" strokeWidth=".7">
      <circle cx="371" cy="278" r="205"/><circle cx="371" cy="278" r="166" strokeDasharray="1 9"/>
      <path d="M371 52v30m0 390v30M145 278h30m392 0h30"/>
    </g>
    <g className="celestial-orbits" stroke={`url(#${id}orbit)`}>
      <ellipse cx="370" cy="285" rx="308" ry="92" transform="rotate(-28 370 285)" strokeWidth="1"/>
      <ellipse cx="370" cy="285" rx="276" ry="134" transform="rotate(-28 370 285)" strokeWidth=".5" opacity=".45"/>
    </g>
    <g className="celestial-glyph" transform="translate(10 -5) rotate(-9 360 290)">
      <text x="360" y="391" textAnchor="middle" fontFamily="'Noto Serif CJK SC','Songti SC',serif" fontSize="268" fill="#535b7b" opacity=".3" transform="translate(5 5)">名</text>
      <text x="360" y="391" textAnchor="middle" fontFamily="'Noto Serif CJK SC','Songti SC',serif" fontSize="268" fill={`url(#${id}silver)`} stroke="#dad6ec" strokeWidth=".2">名</text>
    </g>
    <path d="M38 486c116 11 181-57 287-32s150 64 222 24 128-39 173-25v147H0V510Z" fill={`url(#${id}land)`}/>
    <path d="M-20 512c144 4 216-71 329-44s160 60 239 13 145-29 192-39" stroke={`url(#${id}orbit)`} strokeWidth=".6"/>
    <path d="M83 535c108-18 164-52 244-31s150 25 238-9 111-32 164-28" stroke="#a4a1c7" strokeOpacity=".1" strokeWidth=".6"/>
    <circle cx="577" cy="177" r="8" fill="#ced5ff" filter={`url(#${id}glow)`}/><circle cx="577" cy="177" r="2.7" fill="#f4f1e4"/>
    <path d="M577 165v24m-12-12h24" stroke="#e4dcca" strokeWidth=".6" opacity=".8"/>
  </svg>;
}
