import {randomUUID} from 'node:crypto';
export type AnalysisDocument=Record<string,unknown>|null;
export type AnalysisStore={read:()=>Promise<AnalysisDocument>;compareAndSwap:(before:AnalysisDocument,after:Record<string,unknown>)=>Promise<boolean>};
type Entry<T>={state:'processing'|'ready'|'error';fingerprint:string;owner?:string;startedAt?:number;result?:T};
export async function sharedAnalysis<T>(store:AnalysisStore,slot:string,fingerprint:string,generate:()=>Promise<T>,options:{isCurrent?:(document:AnalysisDocument)=>boolean;leaseMs?:number;waitMs?:number;pollMs?:number}={}):Promise<T>{
 const owner=randomUUID(),start=Date.now(),leaseMs=options.leaseMs??180000,waitMs=options.waitMs??100000;
 for(;;){const document=await store.read();if(options.isCurrent&&!options.isCurrent(document))throw Error('시험지 또는 정답이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');const entry=document?.[slot] as Entry<T>|undefined;
  if(entry?.state==='ready'&&entry.fingerprint===fingerprint&&entry.result!==undefined)return entry.result;
  if(entry?.state==='processing'&&Date.now()-(entry.startedAt??0)<leaseMs){if(Date.now()-start>waitMs)throw Error('공통 분석을 준비 중입니다. 잠시 후 다시 시도해 주세요.');await new Promise(r=>setTimeout(r,options.pollMs??1000));continue;}
  const claim:Entry<T>={state:'processing',fingerprint,owner,startedAt:Date.now()};if(!await store.compareAndSwap(document,{...document,[slot]:claim})){if(Date.now()-start>waitMs)throw Error('분석 저장이 지연되고 있습니다. 다시 시도해 주세요.');continue;}
  try{const result=await generate();for(let retry=0;retry<10;retry++){const latest=await store.read(),current=latest?.[slot] as Entry<T>|undefined;if(current?.owner!==owner||current.fingerprint!==fingerprint)throw Error('분석 대상이 변경되었습니다. 새로고침해 주세요.');if(options.isCurrent&&!options.isCurrent(latest))throw Error('시험지 또는 정답이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');if(await store.compareAndSwap(latest,{...latest,[slot]:{state:'ready',fingerprint,result}}))return result;}throw Error('분석 결과를 저장하지 못했습니다. 다시 시도해 주세요.');
  }catch(error){for(let retry=0;retry<5;retry++){const latest=await store.read(),current=latest?.[slot] as Entry<T>|undefined;if(current?.owner!==owner)break;if(await store.compareAndSwap(latest,{...latest,[slot]:{state:'error',fingerprint}}))break;}throw error;}
 }
}
