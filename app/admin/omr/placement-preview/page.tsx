import {redirect} from 'next/navigation';
import {getCurrentUser} from '@/lib/auth';
import {summarySignature} from '@/lib/placement-service';
import {PLACEMENT_PREVIEW_TOKEN} from '@/lib/placement-preview';
export const dynamic='force-dynamic';
export default async function PlacementNotificationPreview(){
  const user=await getCurrentUser();if(user?.role!=='admin')redirect('/admin/omr');
  const expires=Date.now()+7*86400000,url=`/api/placement/summary/${PLACEMENT_PREVIEW_TOKEN}?expires=${expires}&signature=${summarySignature(PLACEMENT_PREVIEW_TOKEN,expires)}`;
  return <main className="admin-shell"><header className="admin-header"><h1>반배정 슬랙 알림 확인</h1><a className="button ghost" href="/admin/omr">시험 목록</a></header><section className="panel"><h2>테스트 · 가상 자료</h2><p>유쌤 알리미가 #반배정 채널에 아래 가상 성적과 선호 요일을 담은 알림 1건을 보냅니다.</p><p>가상학생 · 가상중3 · 총점 65점 · 선호 요일 화목</p><img src={url} alt="가상학생 성적 요약" style={{width:'100%',height:'auto',margin:'24px 0'}}/><form action="/api/admin/omr/placement-test" method="post"><button className="button primary" type="submit">가상 알림 1건 보내기</button></form></section></main>;
}
