"use client";
import {useEffect,useRef,type ReactNode} from 'react';
export default function EmbeddedReportSize({enabled,children}:{enabled:boolean;children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!enabled||window.parent===window||!ref.current)return;
    const send=()=>window.parent.postMessage({type:'placement-report-height',height:Math.ceil(ref.current!.getBoundingClientRect().height)},'https://classfit.yussam.com');
    const observer=new ResizeObserver(send);observer.observe(ref.current);send();
    return()=>observer.disconnect();
  },[enabled]);
  return <div ref={ref} style={{display:'flow-root'}}>{children}</div>;
}
