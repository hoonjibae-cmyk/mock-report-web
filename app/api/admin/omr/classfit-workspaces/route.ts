import {NextResponse} from 'next/server';
import {authorizeApi} from '@/lib/api-auth';
import {canViewExamType} from '@/lib/auth';
import {listClassfitWorkspaces} from '@/lib/classfit-workspaces';
export async function GET(){
  const auth=await authorizeApi('createReports');if(auth.response)return auth.response;
  if(!canViewExamType(auth.user,'placement'))return NextResponse.json({error:'권한이 없습니다.'},{status:403});
  try{return NextResponse.json({workspaces:await listClassfitWorkspaces()},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'반편성 회차 목록을 불러오지 못했습니다.'},{status:503});}
}
