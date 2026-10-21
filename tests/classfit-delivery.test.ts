import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {classfitDeliveryHeaders,deliverToClassfit} from '../lib/classfit-delivery';
import {workspaceIdValid} from '../lib/classfit-workspaces';
test('클래스핏 연동 서명은 본문·시간·용도를 묶고 회차는 실제 UUID만 받는다',()=>{
  const body=JSON.stringify({reportIds:['one']}),key='test-key',timestamp='1792548000000';
  const headers=classfitDeliveryHeaders(body,key,timestamp);
  assert.equal(headers['x-classfit-signature'],createHmac('sha256',key).update(`classfit-intake:v1:${timestamp}:${body}`).digest('hex'));
  assert.equal(workspaceIdValid('12345678-1234-1234-1234-123456789abc'),true);
  for(const id of ['',undefined,'newest','12345678-1234-1234-1234-123456789abz'])assert.equal(workspaceIdValid(id),false);
});
test('요청을 100건씩 전달하며 서버 반영 실패를 성공으로 숨기거나 다시 전송하지 않는다',async()=>{
  const original=globalThis.fetch,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
  const requests:Array<{url:string;ids:string[];headers:Record<string,string>}>=[];
  try{
    globalThis.fetch=async(input,init)=>{requests.push({url:String(input),ids:JSON.parse(String(init?.body)).reportIds,headers:init?.headers as Record<string,string>});return new Response('{}',{status:200});};
    await deliverToClassfit(Array.from({length:101},(_,i)=>String(i)));
    assert.deepEqual(requests.map(r=>r.ids.length),[100,1]);assert.ok(requests.every(r=>r.url==='https://classfit.yussam.com/api/integrations/omr'&&!!r.headers['x-classfit-signature']));
    let attempts=0;globalThis.fetch=async()=>{attempts++;return new Response('{}',{status:503});};
    await assert.rejects(deliverToClassfit(['one']),/자동 반영이 지연/);assert.equal(attempts,1);
  }finally{globalThis.fetch=original;if(secret===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=secret;}
});
