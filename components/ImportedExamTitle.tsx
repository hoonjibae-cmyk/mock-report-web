"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';

export default function ImportedExamTitle({id,title,printTitle,canEdit}:{id:string;title:string;printTitle:string;canEdit:boolean}) {
  const router=useRouter();
  const [name,setName]=useState(title),[saved,setSaved]=useState(title),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function save(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
    try {
      const response=await fetch(`/api/admin/omr/exams/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:name})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'저장하지 못했습니다.');
      setName(result.title);setSaved(result.title);setMessage('OMR 이름을 저장했습니다. 인쇄 제목은 유지됩니다.');router.refresh();
    }catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{setBusy(false);}
  }
  return <section className="panel no-print imported-title-editor"><form onSubmit={save}>
    <label className="import-title-field"><span>OMR 시험 이름 (목록·새로 생성하는 성적표)</span><input value={name} maxLength={120} required disabled={!canEdit||busy} onChange={e=>{setName(e.target.value);setMessage('');}}/></label>
    <p className="hint">인쇄 제목: {printTitle}. 이 이름을 바꿔도 이그잼 원본과 문제지·OMR 답안지의 인쇄 제목은 바뀌지 않습니다. 이미 생성한 성적표는 유지됩니다.</p>
    {canEdit&&<button className="button secondary" disabled={busy||!name.trim()||name.trim()===saved} type="submit">{busy?'저장 중…':'OMR 이름 저장'}</button>}
    {error&&<p className="form-error block" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </form></section>;
}
