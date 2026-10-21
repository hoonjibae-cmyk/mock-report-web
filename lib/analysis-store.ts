import {getSupabaseAdmin} from '@/lib/supabase-admin';
import type {AnalysisStore,AnalysisDocument} from '@/lib/analysis-cache';
export function databaseAnalysisStore(table:'exams'|'student_reports',id:string,column:'omr_config'|'report_data'):AnalysisStore{
 const versions=new WeakMap<object,string>();let nullVersion='';
 return {async read(){const {data,error}=await getSupabaseAdmin().from(table).select(column+',updated_at').eq('id',id).single();if(error||!data)throw Error('분석 저장 자료를 읽지 못했습니다.');const row=data as unknown as Record<string,unknown>,document=(row[column]??null) as AnalysisDocument,version=String(row.updated_at);if(document)versions.set(document,version);else nullVersion=version;return document;},async compareAndSwap(before,after){const version=before?versions.get(before):nullVersion;if(!version)throw Error('분석 저장 버전을 확인하지 못했습니다.');const {data,error}=await getSupabaseAdmin().from(table).update({[column]:after}).eq('id',id).eq('updated_at',version).select('id').maybeSingle();if(error)throw Error('분석 저장 연결을 확인해 주세요.');return !!data;}};
}
