import {NextResponse} from 'next/server';
import {authorizeAdminApi} from '@/lib/api-auth';
import {PLACEMENT_CHANNEL,summarySignature} from '@/lib/placement-service';
import {PLACEMENT_PREVIEW_TOKEN,PLACEMENT_PREVIEW_SCHEDULE} from '@/lib/placement-preview';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=35;
export async function POST(request:Request){
  const auth=await authorizeAdminApi();if(auth.response)return auth.response;
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'같은 사이트에서 요청해 주세요.'},{status:403});
  if(!process.env.AUTH_SECRET||!process.env.HR_API_URL||!process.env.HR_API_KEY)return NextResponse.json({error:'반배정 알림 연결 설정을 확인해 주세요.'},{status:503});
  const expires=Date.now()+7*86400000;
  const imageUrl=`https://report.yussam.com/api/placement/summary/${PLACEMENT_PREVIEW_TOKEN}?expires=${expires}&signature=${summarySignature(PLACEMENT_PREVIEW_TOKEN,expires)}`;
  try{
    const response=await fetch(`${process.env.HR_API_URL.replace(/\/$/,'')}/api/slack/notify`,{method:'POST',headers:{'content-type':'application/json','x-app':'omr-report','x-api-key':process.env.HR_API_KEY},body:JSON.stringify({channel:PLACEMENT_CHANNEL,text:`[테스트 · 가상 자료]\n반배정 요청 · 가상학생\n선호 요일: ${PLACEMENT_PREVIEW_SCHEDULE}\n실제 학생이나 실제 반배정 요청이 아닌 화면 확인용 알림입니다.\nhttps://classfit.yussam.com`,imageUrl,imageAlt:'테스트 가상학생의 반배치고사 성적 요약 · 총점 65 · 선호 요일 화목'}),signal:AbortSignal.timeout(25000)});
    const result=await response.json().catch(()=>null);
    if(result?.delivered===true&&result?.imageIncluded===true)return NextResponse.json({delivered:true,imageIncluded:true,message:'#반배정에 가상 자료 알림 1건을 보냈습니다.'});
    return NextResponse.json({delivered:result?.delivered??null,error:result?.error??'전송 여부를 확인하지 못했습니다. 중복 발송을 피하려면 슬랙 채널을 먼저 확인해 주세요.'},{status:502});
  }catch{return NextResponse.json({delivered:null,error:'응답을 확인하지 못했습니다. 중복 발송을 피하려면 슬랙 채널을 먼저 확인해 주세요.'},{status:504});}
}
