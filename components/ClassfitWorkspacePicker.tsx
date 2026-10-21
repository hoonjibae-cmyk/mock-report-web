'use client';
import {useEffect,useState} from 'react';
export default function ClassfitWorkspacePicker({examId,initialId='',disabled=false}:{examId?:string;initialId?:string;disabled?:boolean}){
  const [options,setOptions]=useState<Array<{id:string;title:string}>>([]),[selected,setSelected]=useState(initialId),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{const controller=new AbortController();
    fetch('/api/admin/omr/classfit-workspaces',{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(!controller.signal.aborted)setOptions(data.workspaces);}).catch(error=>{if(!controller.signal.aborted)setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[]);
  async function save(){setSaving(true);setError('');setMessage('');try{
    const response=await fetch(`/api/admin/omr/exams/${examId}/classfit-workspace`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId:selected})}),data=await response.json();
    if(!response.ok)throw Error(data.error);setMessage(data.syncPending?'회차를 저장했습니다. 기존 요청은 자동 반영을 재시도합니다.':'회차를 저장하고 기존 반배정 요청을 반영했습니다.');
  }catch(error){setError(error instanceof Error?error.message:'회차 저장 실패');}finally{setSaving(false);}}
  return <div><label><span>반편성 회차 *</span><select name="classfitWorkspaceId" required value={selected} disabled={disabled||loading||saving} onChange={event=>{setSelected(event.target.value);setMessage('');}}><option value="">{loading?'회차 목록 불러오는 중…':'회차를 선택하세요'}</option>{options.map(option=><option key={option.id} value={option.id}>{option.title}</option>)}</select><small className="hint">반배정 요청을 보내면 선택한 클래스핏 회차에 학생·성적·선호 요일이 자동 반영됩니다.</small></label>
    {error&&<p className="form-error" role="alert">{error}</p>}{!loading&&!error&&!options.length&&<p className="hint">클래스핏에서 회차를 먼저 만들어 주세요.</p>}
    {examId&&<button type="button" className="button secondary" disabled={disabled||saving||!selected} onClick={save}>{saving?'저장 중…':'반편성 회차 저장'}</button>}{message&&<p role="status">{message}</p>}
  </div>;
}
