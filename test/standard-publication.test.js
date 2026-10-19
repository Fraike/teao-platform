import assert from 'node:assert/strict';
import {mock,test,beforeEach} from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const db=new(require('better-sqlite3'))(':memory:');
let calls=[],webhook='https://example.invalid/mock',failure=null,submitterBound=true;
mock.module('../server/config.js',{namedExports:{readConfig:()=>({wecomWebhook:webhook})}});
const record=async(url,content,mentions=[],type='text')=>{calls.push({url,content,mentions,type});await new Promise(resolve=>setImmediate(resolve));if(failure)throw failure;return{errcode:0};};
mock.module('../server/services/wecom.js',{namedExports:{sendWecomText:record,sendWecomMessage:async(url,content)=>record(url,content,[],'markdown_v2')}});
mock.module('../server/services/users.js',{namedExports:{listReviewers:()=>[],findUserByName:()=>null,getUserById:()=>({wecomUserid:submitterBound?'submitter-id':''})}});
mock.module('../server/services/standard-store.js',{namedExports:{getDB:()=>db,listCategories:()=>[{key:'gear_damper',fields:[{key:'test_standard',label:'测试标准'},{key:'gear_spec',label:'齿轮规格'}]}]}});
const {notifyReviewDone}=await import('../server/services/standard-notify.js');
const {initPublicationOutbox}=await import('../server/services/standard-publication-outbox.js');initPublicationOutbox(db);
beforeEach(()=>db.exec('DELETE FROM standard_publication_outbox'));
const standard={serialNo:'SP-TEST',categoryKey:'gear_damper',categoryName:'齿形阻尼器',versions:[{id:'v1',status:'published',versionNo:2,customer:'客户▲*',model:'RD-T001',customerPartNo:'CP-001',vehicleModel:'项目A',standardType:'formal',submittedBy:'甲',submittedById:'a',publishedAt:'2026-10-15T00:00:00Z',fields:{test_standard:'12-18',gear_spec:'齿轮A\n齿轮B',extra:'不能遗漏的扩展字段'}}],sourceComments:[{versionId:'v1',fieldLabel:'测试标准',author:'工程',text:'原始变更批注'}]};
test('approved publication contains complete standard and mentions everyone once',async()=>{
 calls=[];const result=await notifyReviewDone(standard,{approve:true,comment:'已核对',reviewerName:'乙'});
 assert.equal(result.status,'sent');assert.deepEqual(calls[0].mentions,['@all']);
 for(const value of ['客户▲\\*','CP-001','项目A','齿轮A','齿轮B','不能遗漏的扩展字段','原始变更批注','已核对','V2','| 属性 | 标准内容 |'])assert(calls.map(c=>c.content).join('').includes(value),value);
 assert(calls.slice(1).every(call=>call.type==='markdown_v2'));
});
test('long Unicode content is complete, ordered and within text byte limits',async()=>{
 calls=[];const text='超长参数😀\n'.repeat(1200);const data=structuredClone(standard);data.versions[0].fields.extra=text;
 const result=await notifyReviewDone(data,{approve:true,comment:'',reviewerName:'乙'});assert.equal(result.status,'sent');assert(calls.length>1);
 assert(calls.every(call=>Buffer.byteLength(call.content,'utf8')<=(call.type==='text'?2048:4096)));assert.equal(calls.filter(call=>call.mentions.includes('@all')).length,1);
 assert.equal(calls.map(c=>c.content).join('').split('超长参数😀').length-1,1200);
});
test('concurrent publications stay together and every part identifies the standard',async()=>{
 calls=[];const a=structuredClone(standard),b=structuredClone(standard);a.serialNo='SP-A';b.serialNo='SP-B';a.versions[0].id='v-a';b.versions[0].id='v-b';a.versions[0].fields.extra='长参数'.repeat(1000);b.versions[0].fields.extra='长参数'.repeat(1000);
 await Promise.all([notifyReviewDone(a,{approve:true}),notifyReviewDone(b,{approve:true})]);
 const owners=calls.map(call=>call.content.includes('SP-A')?'A':call.content.includes('SP-B')?'B':'?');
 assert(!owners.includes('?'));assert.equal(owners.filter((owner,index)=>index>0&&owner!==owners[index-1]).length,1);
 assert(calls.every(call=>Buffer.byteLength(call.content,'utf8')<=(call.type==='text'?2048:4096)));
});
test('missing WeCom binding never claims the submitter was mentioned',async()=>{
 calls=[];submitterBound=false;const result=await notifyReviewDone(standard,{approve:false,comment:'修改',reviewerName:'乙'});submitterBound=true;
 assert.equal(result.mentionedSubmitter,false);assert.deepEqual(calls[0].mentions,[]);
});
test('rejection is private-targeted and delivery errors do not undo approval',async()=>{
 calls=[];await notifyReviewDone(standard,{approve:false,comment:'请修正',reviewerName:'乙'});assert.deepEqual(calls[0].mentions,['submitter-id']);assert(calls[0].content.includes('请修正'));assert(!calls[0].content.includes('齿轮A'));
 webhook='';assert.equal((await notifyReviewDone(standard,{approve:true})).status,'not_configured');webhook='https://example.invalid/mock';
 const fresh=structuredClone(standard);fresh.versions[0].id='fresh-failure';
 failure=Object.assign(new Error('结果不确定'),{code:'SEND_RESULT_UNCERTAIN'});assert.equal((await notifyReviewDone(fresh,{approve:true})).status,'unknown');failure=null;
});
