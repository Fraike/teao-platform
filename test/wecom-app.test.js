import test from 'node:test';
import assert from 'node:assert/strict';
import { createWecomAppClient } from '../server/services/wecom-app.ts';
test('application token coalesces concurrent requests and targets one userid', async () => {
 const calls=[];
 const client=createWecomAppClient({config:()=>({corpId:'corp',agentId:'12',secret:'secret'}),reserve:async()=>{},fetch:async(url,options)=>{calls.push({url,options}); return {ok:true,json:async()=>url.includes('gettoken')?{errcode:0,access_token:'token',expires_in:7200}:{errcode:0}};}});
 await Promise.all([client.send('alice','a'),client.send('bob','b')]);
 assert.equal(calls.filter(c=>c.url.includes('gettoken')).length,1);
 assert.equal(JSON.parse(calls[1].options.body).touser,'alice');
 assert.equal(JSON.parse(calls[2].options.body).touser,'bob');
});
test('missing binding never sends and errors are sanitized',async()=>{
 let calls=0; const client=createWecomAppClient({config:()=>({corpId:'corp',agentId:'12',secret:'secret'}),reserve:async()=>{},fetch:async()=>{calls++;throw Error('secret');}});
 await assert.rejects(client.send('','a'),e=>e.code==='RECIPIENT_UNBOUND');assert.equal(calls,0);
 await assert.rejects(client.send('alice','a'),e=>!e.message.includes('secret')&&e.code==='TOKEN_FAILED');
});
test('expired token refreshes once, visibility failures and uncertain sends do not retry', async()=>{
 let tokens=0,sends=0,mode='expired';
 const client=createWecomAppClient({config:()=>({corpId:'corp',agentId:'12',secret:'secret'}),reserve:async()=>{},fetch:async(url)=>{
  if(url.includes('gettoken')) return {ok:true,json:async()=>({errcode:0,access_token:`t${++tokens}`,expires_in:7200})};
  sends++;
  if(mode==='timeout') throw Error('private url/token');
  return {ok:true,json:async()=>mode==='visibility'?{errcode:0,invaliduser:'alice'}:sends===1?{errcode:42001}:{errcode:0}};
 }});
 await client.send('alice','a');assert.equal(tokens,2);assert.equal(sends,2);
 mode='visibility';await assert.rejects(client.send('alice','a'),e=>e.code==='SEND_REJECTED');assert.equal(sends,3);
 mode='timeout';await assert.rejects(client.send('alice','a'),e=>e.code==='SEND_RESULT_UNCERTAIN'&&!e.message.includes('token'));assert.equal(sends,4);
});
test('recipient guard is rechecked after token and rate limit waits',async()=>{
 let valid=true,posts=0;
 const client=createWecomAppClient({config:()=>({corpId:'corp',agentId:'12',secret:'secret'}),reserve:async()=>{valid=false;},fetch:async(url)=>{
  if(!url.includes('gettoken')) posts++;
  return {ok:true,json:async()=>({errcode:0,access_token:'t',expires_in:7200})};
 }});
 await assert.rejects(client.send('alice','a',{shouldSend:()=>valid}),e=>e.code==='SEND_CANCELLED');assert.equal(posts,0);
});
