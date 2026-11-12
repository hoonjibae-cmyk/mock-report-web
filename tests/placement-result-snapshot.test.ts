import test from 'node:test';
import assert from 'node:assert/strict';
import {placementResultSnapshot,placementResultFingerprint} from '../lib/placement-result-snapshot';
import {placementSummaryPng} from '../lib/placement-summary';
import type {GenericReportData} from '../lib/omr-report-types';
const report={family:'C_generic',schemaVersion:2,examId:'exam',examTitle:'겨울 반배치고사',examDate:'2026-11-12',student:{key:'S1',name:'검증학생',school:'검증중'},score:{raw:80,max:100},areas:[{area:'독해-상',earned:8,possible:10}],sourceScan:{id:'scan-first',uploadedAt:'2026-11-12T00:00:00Z'},generatedAt:'2026-11-12T00:10:00Z'} as GenericReportData;
test('same scan and score remain idempotent after regenerating the report',()=>{
 const first=placementResultFingerprint('root','old-report',report,'화목');
 assert.equal(first,placementResultFingerprint('root','new-report',{...report,generatedAt:'later',cohort:{mean:70} as any},'화목'));
 assert.notEqual(first,placementResultFingerprint('root','new-report',{...report,sourceScan:{...report.sourceScan!,id:'scan-retest'}},'화목'));
 assert.notEqual(first,placementResultFingerprint('root','old-report',{...report,score:{...report.score,raw:90}},'화목'));
});
test('stored image data stays unchanged when the current report score changes',()=>{
 const current=structuredClone(report),snapshot=placementResultSnapshot(current,'화목');
 const before=placementSummaryPng(snapshot as unknown as GenericReportData,'화목');
 current.score.raw=95;current.areas[0].earned=10;current.student.name='변경학생';
 assert.equal(snapshot.score.raw,80);assert.equal(snapshot.areas[0].earned,8);assert.equal(snapshot.student.name,'검증학생');
 assert.deepEqual(placementSummaryPng(snapshot as unknown as GenericReportData,'화목'),before);
});
