import {createHmac} from 'node:crypto';
export function classfitDeliveryHeaders(body:string,key:string,timestamp=String(Date.now())){
  return {'Content-Type':'application/json','x-classfit-timestamp':timestamp,'x-classfit-signature':createHmac('sha256',key).update(`classfit-intake:v1:${timestamp}:${body}`).digest('hex')};
}
export async function deliverToClassfit(reportIds:string[]){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('클래스핏 자동 반영 인증 설정을 확인해 주세요.');
  for(let from=0;from<reportIds.length;from+=100){
    const body=JSON.stringify({reportIds:reportIds.slice(from,from+100)});
    const response=await fetch('https://classfit.yussam.com/api/integrations/omr',{method:'POST',headers:classfitDeliveryHeaders(body,key),body,signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error('반배정 요청은 저장됐지만 클래스핏 자동 반영이 지연되고 있습니다. 자동 재시도 후 슬랙으로 알립니다.');
    console.info('ClassFit delivery completed',reportIds.slice(from,from+100).length);
  }
}
