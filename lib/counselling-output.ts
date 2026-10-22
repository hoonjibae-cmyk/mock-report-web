// Student-facing counselling contains learning guidance, never source-review tasks.
export function internalReviewText(text:string){return /(?:교사|선생님|담당자|출제자).{0,18}(?:확인|검토|문의|점검|의뢰)|(?:확인|검토).{0,12}(?:교사|선생님|담당자|출제자)|(?:문항|문제|보기|정답|조건|지문|시험지|자료|원문).{0,20}(?:누락|오류|오타|불일치|불명확|판독|모호|이상|불확실|확인 필요)|(?:누락|오류|오타|불일치|불명확|판독|모호|불확실).{0,16}(?:문항|문제|보기|정답|조건|지문|시험지|자료|원문)/u.test(text);}
type Analysis={summary:string;strengths:Array<{title:string;evidence:string}>;weaknesses:Array<{title:string;questionNos:number[];analysis:string}>;plan:string[];programRecommendations:Array<{programId:string;focus:string;direction:string}>};
export function counsellingForStudent<T extends Analysis>(analysis:T,allowedWrong:Set<number>):T{
 const safe=(...parts:string[])=>parts.every(p=>!internalReviewText(p));
 const strengths=analysis.strengths.filter(s=>safe(s.title,s.evidence)),weaknesses=analysis.weaknesses.filter(w=>safe(w.title,w.analysis)).map(w=>({...w,questionNos:[...new Set(w.questionNos)].filter(no=>allowedWrong.has(no))})).filter(w=>w.questionNos.length),programRecommendations=analysis.programRecommendations.filter(p=>safe(p.focus,p.direction));
 const plan=analysis.plan.filter(p=>safe(p));if(!plan.length&&!programRecommendations.length)plan.push('영역별 오답 유형을 정리하고 관련 개념을 복습한 뒤 비슷한 문제로 적용 연습을 하세요.');
 return {...analysis,summary:safe(analysis.summary)?analysis.summary:'영역별 성취를 바탕으로 핵심 개념과 오답 유형을 복습하세요.',strengths,weaknesses,programRecommendations,plan};
}
