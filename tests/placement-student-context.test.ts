import test from 'node:test';import assert from 'node:assert/strict';
import {placementStudentContext as label} from '../lib/placement-student-context';
const base={school:'윤슬중 1',sourceGrade:'중1',targetGrade:'중2',workspaceTitle:'2027 겨울학기 반편성',requestedAt:'2026-11-12T08:47:00Z'};
test('winter shows current school/grade and next placement grade without duplicate grade',()=>{
 assert.equal(label(base),'윤슬중 중1 (예비 중2)');
 assert.equal(label({...base,school:'윤슬중 중1'}),'윤슬중 중1 (예비 중2)');
 assert.equal(label({...base,school:'윤슬중1'}),'윤슬중 중1 (예비 중2)');
});
test('January 1 cutoff follows Korean time, including future winter semesters',()=>{
 assert.equal(label({...base,requestedAt:'2026-12-31T14:59:59Z'}),'윤슬중 중1 (예비 중2)');
 assert.equal(label({...base,requestedAt:'2026-12-31T15:00:00Z'}),'윤슬중 중1');
 assert.equal(label({...base,workspaceTitle:'2028 겨울학기',requestedAt:'2027-12-01T00:00:00Z'}),'윤슬중 중1 (예비 중2)');
});
test('summer, unchanged grade and missing dates never imply promotion',()=>{
 assert.equal(label({...base,workspaceTitle:'2026 여름학기'}),'윤슬중 중1');
 assert.equal(label({...base,targetGrade:'중1'}),'윤슬중 중1');
 assert.equal(label({...base,requestedAt:''}),'윤슬중 중1');
 assert.equal(label({...base,sourceGrade:'중3',targetGrade:'고1',school:'윤슬중3'}),'윤슬중 중3 (예비 고1)');
});
