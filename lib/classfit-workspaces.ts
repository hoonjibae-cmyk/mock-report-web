import {getSupabaseAdmin} from '@/lib/supabase-admin';
export const workspaceIdValid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export async function listClassfitWorkspaces(){
  const {data,error}=await getSupabaseAdmin().from('placement_workspaces').select('id,title,created_at').order('created_at',{ascending:false});
  if(error)throw Error('클래스핏 회차 목록을 불러오지 못했습니다.');return data;
}
export async function requireClassfitWorkspace(id:unknown){
  if(!workspaceIdValid(id))throw Error('반편성 회차를 선택해 주세요.');
  const {data,error}=await getSupabaseAdmin().from('placement_workspaces').select('id,title').eq('id',id).maybeSingle();
  if(error||!data)throw Error('선택한 반편성 회차를 찾을 수 없습니다. 목록을 다시 확인해 주세요.');return data;
}
