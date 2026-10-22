import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedAnalysis,type AnalysisDocument,type AnalysisStore} from '../lib/analysis-cache';
import {commonFingerprint} from '../lib/common-item-analysis';
import {personalCounsellingPayload,type CounsellingEvidenceSchema} from '../lib/counselling-ai';
import type {z} from 'zod';

function database(initial:AnalysisDocument={}){
 let document=initial;
 return {store:():AnalysisStore=>({read:async()=>document,compareAndSwap:async(before,after)=>{if(before!==document)return false;document=after;return true;}}),change:(patch:Record<string,unknown>)=>{document={...document,...patch};}};
}
const options={pollMs:1,waitMs:1000};
test('concurrent servers and later fresh instances reuse one persisted generation',async()=>{
 const db=database();let calls=0;const generate=async()=>{calls++;await new Promise(r=>setTimeout(r,15));return {items:[1,2]};};
 const results=await Promise.all(Array.from({length:20},()=>sharedAnalysis(db.store(),'common','v1',generate,options)));
 assert.equal(calls,1);assert.equal(results.length,20);
 assert.deepEqual(await sharedAnalysis(db.store(),'common','v1',generate,options),{items:[1,2]});assert.equal(calls,1);
 await sharedAnalysis(db.store(),'common','v2',generate,options);assert.equal(calls,2);
});
test('failed work can retry and concurrent unrelated updates survive',async()=>{
 const db=database();await assert.rejects(sharedAnalysis(db.store(),'common','v1',async()=>{throw Error('failed');},options));
 const result=await sharedAnalysis(db.store(),'common','v1',async()=>{db.change({note:'keep'});return 4;},options);
 assert.equal(result,4);assert.equal((await db.store().read())?.note,'keep');
});
test('source changes reject stale output and expired claims can recover',async()=>{
 const db=database({source:1});await assert.rejects(sharedAnalysis(db.store(),'common','v1',async()=>{db.change({source:2});return 4;},{...options,isCurrent:d=>d?.source===1}),/변경/);
 const expired=database({common:{state:'processing',fingerprint:'v1',owner:'old',startedAt:0}});
 assert.equal(await sharedAnalysis(expired.store(),'common','v1',async()=>5,options),5);
});
test('only shared source and grading changes invalidate common analysis',()=>{
 const config={counselling_paper:{status:'confirmed',questions:[{no:1,stem:'question',passage:'text',choices:['a'],explanation:'',unclear:false}]}};
 const key={1:1},meta={1:{point:2}};const fingerprint=commonFingerprint(config,key,meta);
 assert.equal(commonFingerprint({...config,counselling_common_analysis:{state:'ready'},unrelated:'change'},key,meta),fingerprint);
 assert.notEqual(commonFingerprint(config,{1:2},meta),fingerprint);
 assert.notEqual(commonFingerprint(config,key,{1:{point:3}}),fingerprint);
 assert.notEqual(commonFingerprint({counselling_paper:{...config.counselling_paper,questions:[{...config.counselling_paper.questions[0],stem:'changed'}]}},key,meta),fingerprint);
});
test('personal AI receives saved reasoning and outcomes, without original question text',()=>{
 const evidence={score:0,max:2,levelMean:1,gradeMean:1,areas:[],items:[{no:1,correct:false,question:{stem:'RAW SECRET SOURCE'}}]} as unknown as z.infer<typeof CounsellingEvidenceSchema>;
 const common={items:[{no:1,skill:'skill',correctReason:'saved reasoning',choiceNotes:[],reviewPoints:[],caution:''}]};
 const payload=personalCounsellingPayload(evidence,common);
 assert.equal(JSON.stringify(payload).includes('RAW SECRET SOURCE'),false);
 assert.equal(payload.commonItems[0].correctReason,'saved reasoning');
});

test('refresh replaces persisted personal analysis once and ordinary reads reuse refreshed result',async()=>{
 const db=database({personal:{state:'ready',fingerprint:'v1',result:0,completedAt:1},common:{state:'ready',result:'keep'}});let calls=0;
 const generate=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return 1;};
 const results=await Promise.all(Array.from({length:10},()=>sharedAnalysis(db.store(),'personal','v1',generate,{...options,refresh:true})));
 assert.deepEqual(results,Array(10).fill(1));assert.equal(calls,1);
 assert.equal(await sharedAnalysis(db.store(),'personal','v1',generate,options),1);assert.equal(calls,1);
 assert.deepEqual((await db.store().read())?.common,{state:'ready',result:'keep'});
});
