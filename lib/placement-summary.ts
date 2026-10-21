import {Resvg} from '@resvg/resvg-js';
import path from 'node:path';
import type {GenericReportData} from '@/lib/omr-report-types';
// 영역 순서(과목별 · 하→중→상)는 성적표 화면과 같은 곳에서 정한다
import {PLACEMENT_SUBJECTS as SUBJECTS,areaParts,orderedPlacementAreas,type PlacementArea as Area} from '@/lib/placement-areas';
export {orderedPlacementAreas};

const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
// Fit long labels inside their allocated space without discarding text.
function text(x:number,y:number,value:unknown,size:number,color:string,width?:number,weight=400){
  const label=String(value??'');
  const units=[...label].reduce((n,c)=>n+(/[\u0000-\u007f]/.test(c)?0.57:1),0);
  const fit=width&&units*size>width?` textLength="${width}" lengthAdjust="spacingAndGlyphs"`:'';
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}"${fit}>${esc(label)}</text>`;
}
export function placementSummarySvg(report:GenericReportData,schedule:string){
  const groups:{name:string;areas:Area[]}[]=SUBJECTS.map(name=>({name,areas:[]}));
  for(const area of orderedPlacementAreas(report.areas)){
    const subject=areaParts(area.area).subject;
    let group=groups.find(g=>g.name===subject);
    if(!group){group={name:subject,areas:[]};groups.push(group);}
    group.areas.push(area);
  }
  let y=252;
  const colors=['#0f766e','#2563eb','#7c3aed','#b45309'];
  const cards:string[]=[];
  for(let start=0;start<groups.length;start+=4){
    const row=groups.slice(start,start+4);
    const height=78+Math.max(1,...row.map(g=>g.areas.length))*56;
    row.forEach((group,index)=>{
      const x=40+index*234,color=colors[index];
      cards.push(`<rect x="${x}" y="${y}" width="218" height="${height}" rx="16" fill="white" stroke="#e2e8f0"/>`);
      cards.push(`<rect x="${x+18}" y="${y+23}" width="4" height="22" rx="2" fill="${color}"/>`);
      cards.push(text(x+32,y+41,group.name,21,'#182b42',168,700));
      if(!group.areas.length)cards.push(text(x+18,y+96,'점수 없음',16,'#64748b'));
      group.areas.forEach((area,i)=>{
        const top=y+76+i*56,tier=areaParts(area.area).tier;
        cards.push(text(x+18,top+16,tier||'득점',16,'#64748b',50));
        cards.push(text(x+78,top+16,`${area.earned} / ${area.possible}${area.estimated?'*':''}`,20,'#182b42',122,700));
        const ratio=Number.isFinite(area.earned)&&Number.isFinite(area.possible)&&area.possible>0?Math.max(0,Math.min(1,area.earned/area.possible)):0;
        cards.push(`<rect x="${x+18}" y="${top+29}" width="182" height="5" rx="2.5" fill="#edf2f7"/>`);
        if(ratio>0)cards.push(`<rect x="${x+18}" y="${top+29}" width="${182*ratio}" height="5" rx="2.5" fill="${color}"/>`);
      });
    });
    y+=height+16;
  }
  const height=y+48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}">
    <rect width="1000" height="${height}" rx="24" fill="#f3f6fa"/>
    <g font-family="NanumGothic">
      <path d="M24 0H976Q1000 0 1000 24V104H0V24Q0 0 24 0" fill="#142d43"/>
      ${text(40,44,'반배정 요청',27,'#ffffff',300,700)}
      ${text(40,77,report.examTitle,16,'#c8d6e3',730)}
      ${text(802,44,'CLASSFIT',16,'#85e0cf',158,700)}
      ${text(802,77,report.examDate||'응시일 미확인',15,'#c8d6e3',158)}
      <rect x="40" y="128" width="920" height="104" rx="16" fill="white"/>
      ${text(62,157,'학생 정보',13,'#64748b')}
      ${text(62,193,report.student.name,27,'#182b42',205,700)}
      ${text(292,192,report.student.school||'학교 미입력',19,'#526579',220)}
      <path d="M544 150V210M744 150V210" stroke="#e2e8f0"/>
      ${text(568,157,'총점',13,'#64748b')}
      ${text(568,199,report.score.raw,36,'#0f766e',88,700)}
      ${text(662,197,`/ ${report.score.max}`,17,'#64748b',62)}
      ${text(772,157,'선호 요일',13,'#64748b')}
      ${text(772,196,schedule||'미입력',26,'#182b42',165,700)}
      ${cards.join('')}
      ${text(40,y+23,report.areas.some(a=>a.estimated)?'영역별 득점 / 배점     ·     * 평균 대체 점수':'영역별 득점 / 배점',13,'#64748b',740)}
    </g>
  </svg>`;
}
export function placementSummaryPng(report:GenericReportData,schedule:string){
  return new Resvg(placementSummarySvg(report,schedule),{font:{fontFiles:[path.join(process.cwd(),'public/fonts/NanumGothic-Regular.ttf')],loadSystemFonts:false,defaultFontFamily:'NanumGothic'}}).render().asPng();
}
