import {Resvg} from '@resvg/resvg-js';
import path from 'node:path';
import type {GenericReportData} from '@/lib/omr-report-types';
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function placementSummaryPng(report:GenericReportData,schedule:string){
  const cells=[{title:'학생명',value:report.student.name,width:150,color:'#d8ffbc'},{title:'학교',value:report.student.school,width:180,color:'#d8ffbc'},{title:'총점',value:String(report.score.raw),width:90,color:'#91f47c'},...report.areas.map(a=>({title:a.area,value:`${a.earned}/${a.possible}${a.estimated?'*':''}`,width:112,color:'#f3b9fb'})),{title:'선호 요일',value:schedule,width:145,color:'#ffffff'}];
  const width=cells.reduce((n,c)=>n+c.width,0)+24,height=172;
  let x=12;const table=cells.map(c=>{const out=`<rect x="${x}" y="53" width="${c.width}" height="44" fill="#ffcf00" stroke="#25332e"/><rect x="${x}" y="97" width="${c.width}" height="52" fill="${c.color}" stroke="#25332e"/><text x="${x+c.width/2}" y="81" font-size="18" font-weight="700" text-anchor="middle">${esc(c.title)}</text><text x="${x+c.width/2}" y="129" font-size="${String(c.value).length>15?14:19}" text-anchor="middle">${esc(c.value)}</text>`;x+=c.width;return out;}).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><g font-family="NanumGothic" fill="#172e24"><text x="12" y="29" font-size="20" font-weight="700">반배정 요청</text><text x="${width-12}" y="29" font-size="15" text-anchor="end">${esc(report.examTitle)} · ${esc(report.examDate??'응시일 미확인')}</text>${table}</g></svg>`;
  return new Resvg(svg,{font:{fontFiles:[path.join(process.cwd(),'public/fonts/NanumGothic-Regular.ttf')],loadSystemFonts:false,defaultFontFamily:'NanumGothic'}}).render().asPng();
}
