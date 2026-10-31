import test from 'node:test';
import assert from 'node:assert/strict';
import {classfitDestinationUrl} from '@/lib/classfit-destination';
test('notification links follow placement grade instead of source exam grade',()=>{
 const url=classfitDestinationUrl({id:'winter',state:{students:[{reportId:'r',grade:'중3'}]}},'r');
 assert.equal(new URL(url).searchParams.get('grade'),'중3');
 assert.equal(new URL(url).searchParams.get('workspace'),'winter');
 for(const students of [[],[{reportId:'r',grade:'중2',removed:true}],[{reportId:'another',grade:'중2'}]])assert.equal(new URL(classfitDestinationUrl({id:'winter',state:{students}},'r')).searchParams.has('grade'),false);
});

