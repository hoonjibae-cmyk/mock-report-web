import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {COMMON_ANALYSIS_MODEL,STUDENT_COUNSELLING_MODEL,COMMON_REASONING_EFFORT,STUDENT_REASONING_EFFORT} from '../lib/counselling-models';
import {commonFingerprint,readyCommonAnalysis} from '../lib/common-item-analysis';
import {DEFAULT_AI_MODEL} from '../lib/ai-models';
test('routing is scoped to counselling roles without changing unrelated AI defaults',()=>{assert.equal(COMMON_ANALYSIS_MODEL,'gpt-6.1-sol');assert.equal(STUDENT_COUNSELLING_MODEL,'gpt-6-luna');assert.equal(COMMON_REASONING_EFFORT,'medium');assert.equal(STUDENT_REASONING_EFFORT,'low');assert.equal(DEFAULT_AI_MODEL,'gpt-5.6-luna');});
test('shared model migration invalidates old common analysis once and reuses the current generation',()=>{
 const config={counselling_paper:{status:'confirmed',questions:[]}},answerKey={},meta={},analysis={items:[]};
 const old=createHash('sha256').update(JSON.stringify({version:1,model:'gpt-5.6-luna',questions:[],answerKey,meta})).digest('hex');
 assert.notEqual(commonFingerprint(config,answerKey,meta),old);
 assert.equal(readyCommonAnalysis({...config,counselling_common_analysis:{state:'ready',fingerprint:old,result:analysis}},answerKey,meta),null);
 assert.deepEqual(readyCommonAnalysis({...config,counselling_common_analysis:{state:'ready',fingerprint:commonFingerprint(config,answerKey,meta),result:analysis}},answerKey,meta),analysis);
});
