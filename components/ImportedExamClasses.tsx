'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import MonthlyClassPicker from './MonthlyClassPicker';
import type {MonthlyClassSelection} from '@/lib/monthly-class-selection';

export default function ImportedExamClasses({id,classNames,canEdit}:{id:string;classNames:string[];canEdit:boolean}) {
  const router=useRouter();
  const [saved,setSaved]=useState(classNames),[selected,setSelected]=useState<string[]>([]);
  const [previous,setPrevious]=useState(classNames);
  const [selection,setSelection]=useState<MonthlyClassSelection|null>(null);
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[reload,setReload]=useState(0);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const savingRef=useRef(false);
  useEffect(()=>{setSaved(classNames);},[classNames]);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    setLoading(true);setSelection(null);setError('');
    void (async()=>{
      try{
        const response=await fetch(`/api/admin/omr/exams/${id}/classes`,{cache:'no-store',signal:controller.signal});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'반 목록을 불러오지 못했습니다.');
        if(controller.signal.aborted)return;
        setSaved(result.classNames);setPrevious(result.classNames);setSelection(result);
        const allowed=new Set(result.classOptions.map((c:{className:string})=>c.className));
        setSelected(result.classNames.filter((name:string)=>allowed.has(name)));
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'반 목록을 불러오지 못했습니다.');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    })();
    return()=>controller.abort();
  },[open,reload,id]);
  async function save(){
    if(savingRef.current||loading||!selection||selection.classesError||!selected.length)return;
    savingRef.current=true;setSaving(true);setError('');setMessage('');
    try{
      const response=await fetch(`/api/admin/omr/exams/${id}/classes`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({classNames:selected,previousClassNames:previous})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'응시반을 저장하지 못했습니다.');
      setSaved(result.classNames);setOpen(false);setMessage('응시반을 변경했습니다. 기존 답안·채점 결과·성적표는 유지됩니다.');router.refresh();
    }catch(e){setError(e instanceof Error?e.message:'응시반을 저장하지 못했습니다.');}
    finally{savingRef.current=false;setSaving(false);}
  }
  return <section className="panel no-print" aria-label="연동 시험 응시반">
    <div className="section-heading wrap"><div><h2>시험을 치르는 반</h2><p><strong>{saved.length?saved.join(', '):'응시반 미지정'}</strong></p></div>{canEdit&&!open&&<button type="button" className="button secondary" onClick={()=>{setOpen(true);setMessage('');}}>응시반 변경</button>}</div>
    <p className="hint">응시반만 변경합니다. 시험 ID·스캔 답안·정답·배점·채점 결과·기존 성적표·코멘트는 그대로 유지됩니다. 명단·미응시 확인은 변경한 반을 기준으로 조회합니다. 이미 발급한 성적표의 반 표기·평균은 자동으로 바꾸지 않으며, 필요하면 성적표 생성 화면에서 갱신하세요.</p>
    {open&&<>
      {loading&&<p role="status">실제 반 목록을 불러오고 있습니다…</p>}
      {selection&&<MonthlyClassPicker {...selection} selected={selected} disabled={saving||loading} requireSelection onToggle={(name,on)=>setSelected(current=>on?[...new Set([...current,name])]:current.filter(c=>c!==name))}/>}
      {selection&&saved.some(name=>!selection.classOptions.some(c=>c.className===name))&&<p className="hint">기존 반 중 현재 목록에 없는 이름이 있습니다. 실제 응시반을 다시 선택해 주세요.</p>}
      <div className="import-links"><button type="button" className="button primary" disabled={saving||loading||!selection||!!selection.classesError||!selected.length} onClick={save}>{saving?'응시반 저장 중…':'응시반 저장'}</button><button type="button" className="button secondary" disabled={saving||loading} onClick={()=>setReload(n=>n+1)}>반 목록 다시 불러오기</button><button type="button" className="button ghost" disabled={saving} onClick={()=>{setOpen(false);setError('');}}>취소</button></div>
    </>}
    {error&&<p className="form-error block" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
