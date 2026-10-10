import type {OmrExam} from '@/lib/omr-types';
import type {SourceSnapshot} from '@/lib/exam-generator-import';
export default function ImportedExamSource({exam}:{exam:OmrExam}){
  const source=exam.omrConfig.exam_generator as {snapshot?:SourceSnapshot}|undefined;
  if(!source?.snapshot)return null;
  const snapshot=source.snapshot;
  return <details className="imported-source"><summary>시험지 앱에서 연동한 월말평가 · {snapshot.grade} · {snapshot.questions.length}문항</summary>
    <p>저장본 v{snapshot.sourceVersion}의 문항 번호·정답·배점·유형·난이도를 가져왔습니다. 아래 자료는 가져올 당시의 문항입니다. 현재 채점 기준은 정답키 화면에서 확인하세요. 원본 시험지 링크는 시험지 앱의 최신 저장본을 엽니다.</p>
    <a className="button ghost" href={`https://exam.yussam.com/print/${snapshot.sourceExamId}`} target="_blank" rel="noreferrer">원본 시험지 최신 저장본 ↗</a>
    {snapshot.questions.map(q=><details key={q.id}><summary>{q.number}. {q.stem} · {q.area} / {q.content}</summary>{q.given&&<blockquote>{q.given}</blockquote>}{q.body&&<p className="import-source-body">{q.body}</p>}<ol>{q.choices.map((choice,i)=><li key={i}>{choice}</li>)}</ol><p>원본 정답: {q.answer}번 · {q.explanation}</p></details>)}
  </details>;
}
