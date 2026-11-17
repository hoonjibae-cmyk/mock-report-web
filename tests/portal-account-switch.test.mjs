import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoute, request } from './route-contract.mjs';
const origin='https://report.example.invalid';
function scenario() {
  const s={current:'U12345A',identity:'U12345B',flow:null,issued:null,lookups:0};
  const auth={SESSION_COOKIE:'ys_mock_session',getCurrentUser:async()=>({id:s.current}),
    authenticateByEmail:async()=>{s.lookups++;return {id:'B',role:'user'};},
    setSessionCookie:async(user,slackUserId)=>{s.issued={user,slackUserId};}};
  const slack={SLACK_STATE_COOKIE:'ys_mock_oauth_state',SLACK_NEXT_COOKIE:'ys_mock_oauth_next',
    SlackLoginNotConfiguredError:class extends Error{},
    createState:expected=>{s.flow=expected;return 'signed-flow';},authorizeUrl:()=> 'https://slack.com/authorize',
    stateMatches:(cookie,state)=>cookie==='signed-flow'&&state===cookie,
    expectedSlackUserForState:()=>s.flow,exchangeCode:async()=>({email:'b@example.invalid',slackUserId:s.identity})};
  const mocks={'@/lib/auth':auth,'@/lib/slack-auth':slack,
    '@/lib/crypto':{verifyPayload:()=>({slackUserId:s.current})},
    'next/headers':{cookies:async()=>({get:()=>({value:'old'})})},
    '@/lib/utils':{siteBaseUrl:()=>origin},'@/lib/login-next':{DEFAULT_AFTER_LOGIN:'/',safeNextPath:()=> '/'}};
  return {s,start:loadRoute(new URL('../app/api/auth/slack/start/route.ts',import.meta.url),mocks).GET,
    callback:loadRoute(new URL('../app/api/auth/slack/callback/route.ts',import.meta.url),mocks).GET};
}
function callbackRequest(query) {
  const req=request(origin+'/api/auth/slack/callback?'+query);
  req.headers.set('cookie','ys_mock_oauth_state=signed-flow');return req;
}
test('report clears A and issues only B after the bound Slack flow verifies B',async()=>{
  const {s,start,callback}=scenario();const began=await start(request(origin+'/api/auth/slack/start?portal_slack_user=U12345B'));
  assert.equal(began.savedCookies.get('ys_mock_session').value,'');assert.equal(s.flow,'U12345B');
  const done=await callback(callbackRequest('state=signed-flow&code=ok'));
  assert.equal(done.headers.get('location'),origin+'/');assert.equal(s.issued.slackUserId,'U12345B');assert.equal(s.issued.user.id,'B');
});
test('report rejects A before account lookup and clears sessions on cancellation',async()=>{
  const {s,start,callback}=scenario();await start(request(origin+'/api/auth/slack/start?portal_slack_user=U12345B'));s.identity='U12345A';
  const denied=await callback(callbackRequest('state=signed-flow&code=wrong'));
  assert.match(decodeURIComponent(denied.headers.get('location')),/포털과 다른 Slack 계정/);
  assert.equal(denied.savedCookies.get('ys_mock_session').value,'');assert.equal(s.lookups,0);assert.equal(s.issued,null);
  assert.equal((await callback(callbackRequest('error=access_denied'))).savedCookies.get('ys_mock_session').value,'');
});
test('report matching B reuses only B and malformed constraints clear previous sessions',async()=>{
  const {s,start}=scenario();s.current='U12345B';
  assert.equal((await start(request(origin+'/api/auth/slack/start?portal_slack_user=U12345B'))).headers.get('location'),origin+'/');
  assert.equal(s.flow,null);
  const denied=await start(request(origin+'/api/auth/slack/start?portal_slack_user=invalid'));
  assert.equal(denied.status,400);assert.equal(denied.savedCookies.get('ys_mock_session').value,'');
});
