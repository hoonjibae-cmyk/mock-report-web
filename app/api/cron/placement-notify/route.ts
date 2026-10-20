import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {dispatchPlacementNotifications} from '@/lib/placement-service';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=90;
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;if(!secret)return NextResponse.json({error:'알림 예약 실행이 설정되지 않았습니다.'},{status:503});
  const a=Buffer.from(request.headers.get('authorization')??''),b=Buffer.from(`Bearer ${secret}`);if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'권한이 없습니다.'},{status:401});
  try{return NextResponse.json(await dispatchPlacementNotifications(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'반배정 알림 처리를 완료하지 못했습니다. 저장된 요청은 유지됩니다.'},{status:500});}
}
