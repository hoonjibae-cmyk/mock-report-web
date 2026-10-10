'use client';
import {useEffect,useState} from 'react';
import type {SourceSnapshot,PointMode} from '@/lib/exam-generator-import';
import Link from 'next/link';
const STORAGE='yussam-exam-import-v1';
export default function ExamGeneratorImport(){
  const [snapshot,setSnapshot]=useState<SourceSnapshot|null>(null),[token,setToken]=useState('');
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[pointMode,setPointMode]=useState<PointMode|''>('');
  useEffect(()=>{
    const hash=new URLSearchParams(window.location.hash.slice(1));
    const incoming=hash.get('handoff');
    if(incoming){sessionStorage.setItem(STORAGE,incoming);window.history.replaceState(null,'',window.location.pathname);}
    const saved=incoming||sessionStorage.getItem(STORAGE)||'';setToken(saved);
    if(!saved){setError('시험지 앱에서 OMR 리포트로 이어가기를 눌러 주세요.');setBusy(false);return;}
    let cancelled=false;
    async function load(){
      try{
        const response=await fetch('/api/admin/omr/import-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:saved,action:'preview'})});
        if(response.status===401){window.location.assign('/login?next=%2Fexam-import');return;}
        const result=await response.json();if(!response.ok)throw new Error(result.error);
        if(!cancelled){setSnapshot(result.snapshot);setPointMode(result.snapshot.questions.every((q:{points:number|null})=>q.points!==null&&q.points>0)?'source':'');}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'시험지를 읽지 못했습니다.');}
      finally{if(!cancelled)setBusy(false);}
    }
    void load();return()=>{cancelled=true;};
  },[]);
  async function create(){
    if(busy||!pointMode)return;setBusy(true);setError('');
    try{
      const response=await fetch('/api/admin/omr/import-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'import',pointMode})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'가져오지 못했습니다.');
      sessionStorage.removeItem(STORAGE);window.location.assign(result.url);
    }catch(e){setError(e instanceof Error?e.message:'가져오지 못했습니다.');setBusy(false);}
  }
  const missing=snapshot?.questions.some(q=>q.points===null||q.points<=0);
  return <main className="exam-import-page"><header><p className="eyebrow">EXAM STUDIO → OMR REPORT</p><h1>월말평가 가져오기</h1><p>확정한 문항과 정답을 확인하고 OMR 출력·채점·리포트 작업을 이어가세요.</p></header>
    {error&&<p className="form-error block" role="alert">{error}</p>}
    {busy&&<p role="status" className="import-loading">{snapshot?'정답과 배점을 저장하고 있습니다…':'저장된 시험지를 확인하고 있습니다…'}</p>}
    {snapshot&&<section className="import-card"><div className="import-title"><h2>{snapshot.title}</h2><span>{snapshot.grade} · 저장본 v{snapshot.sourceVersion}</span></div>
      <p>{snapshot.className||'반 미지정'} · {snapshot.examDate||'응시일 미지정'} · 담임 {snapshot.teacher||'미지정'}</p>
      <div className="import-areas">{['듣기','문법','독해'].map(area=><span key={area}>{area} <strong>{snapshot.questions.filter(q=>q.area===area).length}문항</strong></span>)}</div>
      <fieldset disabled={busy}><legend>배점 방식</legend><label><input type="radio" name="points" value="source" disabled={!!missing} checked={pointMode==='source'} onChange={()=>setPointMode('source')}/> 시험지에서 설정한 배점 유지{missing?' (미설정·0점 문항 있음)':''}</label><label><input type="radio" name="points" value="equal" checked={pointMode==='equal'} onChange={()=>setPointMode('equal')}/> 전체 균등 배점 · 100점 만점</label></fieldset>
      {missing&&!pointMode&&<p className="import-note">원본에 배점이 없거나 0점인 문항이 있습니다. 균등 배점을 선택하거나 시험지 앱에서 배점을 설정한 뒤 다시 연동해 주세요.</p>}
      <div className="import-table"><table><thead><tr><th>번호</th><th>영역</th><th>유형</th><th>난이도</th><th>정답</th><th>배점</th></tr></thead><tbody>{snapshot.questions.map(q=><tr key={q.id}><td>{q.number}</td><td>{q.area}</td><td>{q.content}</td><td>{q.difficulty}</td><td>{'①②③④⑤'[q.answer-1]}</td><td>{pointMode==='equal'?(100/snapshot.questions.length).toFixed(2):q.points??'미설정'}</td></tr>)}</tbody></table></div>
      <p className="import-note">같은 내용은 기존 OMR 시험을 엽니다. 문항·정답·배점이 달라진 시험지는 새 OMR 시험으로 가져옵니다. 기존 채점 데이터는 유지됩니다.</p>
      <button className="button primary" disabled={busy||!pointMode} onClick={create}>{busy?'가져오는 중…':'가져오고 OMR 작업 시작'}</button>
    </section>}
    <nav className="import-links"><a href="https://exam.yussam.com/">시험지 앱으로 돌아가기 ↗</a><Link href="/admin/omr?type=monthly">OMR 월말평가 목록</Link></nav>
  </main>;
}
