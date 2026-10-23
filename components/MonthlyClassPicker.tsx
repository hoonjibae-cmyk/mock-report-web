'use client';
import type {MonthlyClassSelection} from '@/lib/monthly-class-selection';

export default function MonthlyClassPicker({classOptions,classesMine,classesError,selected,onToggle,disabled=false,requireSelection=false}:MonthlyClassSelection&{selected:string[];onToggle:(name:string,on:boolean)=>void;disabled?:boolean;requireSelection?:boolean}) {
  return <fieldset className="class-picker" disabled={disabled}>
    <legend><span>시험을 치르는 반{requireSelection||classOptions.length?' *':''}</span></legend>
    {classOptions.length?<>
      <div className="class-picker-grid">{classOptions.map(c=><label key={c.className} className={`class-picker-item${selected.includes(c.className)?' on':''}`}>
        <input type="checkbox" checked={selected.includes(c.className)} onChange={e=>onToggle(c.className,e.target.checked)}/>
        <span className="class-picker-name">{c.className}</span>
        <span className="class-picker-meta">{classesMine?'':c.teacher?`${c.teacher} · `:''}{c.count}명</span>
      </label>)}</div>
      <small className="hint">{classesMine?'담당하시는 반만 보입니다. 두 반을 합쳐 치르면 둘 다 고르세요.':'담당 반을 찾지 못해 전체 반을 보입니다. 이 시험을 치르는 반을 고르세요.'} 운영진 검토 화면의 미응시 확인은 여기서 고른 반을 기준으로 합니다.</small>
    </>:<small className="hint">반 목록을 불러오지 못했습니다{classesError?` — ${classesError}`:''}. {requireSelection?'반 목록을 다시 불러온 뒤 선택해야 가져올 수 있습니다.':'반 없이 만들 수 있지만, 운영진 검토 화면에서 미응시 학생을 가려내지 못합니다.'}</small>}
  </fieldset>;
}
