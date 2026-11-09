import assert from 'node:assert/strict';import {test} from 'node:test';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import express from '../server/node_modules/express/index.js';import jwt from '../server/node_modules/jsonwebtoken/index.js';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'maintenance-api-'));
process.env.DATA_DIR=directory;process.env.PRODUCTION_CONFIG_PATH=path.join(directory,'production.json');process.env.JWT_SECRET='maintenance-API-secret-at-least-32-characters';
const users=[{id:'admin',name:'管理员',username:'admin',role:'admin',permissions:[],status:'active',passwordVersion:0},{id:'editor',name:'员工',username:'editor',role:'user',permissions:['engineering_submit','engineering_maintain'],status:'active',passwordVersion:0}];
fs.writeFileSync(path.join(directory,'users.json'),JSON.stringify({users}));
const tokens=Object.fromEntries(users.map(user=>[user.id,jwt.sign(user,process.env.JWT_SECRET,{expiresIn:'1h'})]));
const {registerStandardRoutes}=await import('../server/routes/standards.js');
const {writeStandardMaintenance,readStandardMaintenance}=await import('../server/services/standard-maintenance.ts');
const {setUserPermission}=await import('../server/services/users.js');
const s=await import('../server/services/standard-store.js');
const app=express();app.use(express.json());registerStandardRoutes(app);
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const endpoint=`http://127.0.0.1:${server.address().port}/api/standards`;
async function request(url='',method='GET',body,user='editor') {const response=await fetch(endpoint+url,{method,headers:{Authorization:`Bearer ${tokens[user]}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}

test('live capabilities and viewer version change with mode and revoked user permissions',async()=>{
 try{
  const off=await request('?all=true&category=gear_damper');assert.equal(off.status,200,JSON.stringify(off.body));assert.equal(off.body.canMaintain,false);
  writeStandardMaintenance({...readStandardMaintenance(),enabled:true},users[0]);
  const version=await request('/version');assert.notEqual(version.body.version,off.body.version);
  const enabled=await request('?all=true&category=gear_damper');assert.equal(enabled.body.canMaintain,true);assert.equal(enabled.body.maintenanceEnabled,true);
  const created=await request('','POST',{serialNo:'API-MAINT',categoryKey:'gear_damper',customer:'客户',model:'型号',fields:{}},'admin');
  assert.equal(created.status,201);let detail=created.body.data;
  assert.equal((await request('/'+detail.id+'?summary=true')).body.canMaintain,true);
  const save=()=>({maintenance:true,versionId:detail.versions[0].id,revision:detail.versions[0].revision,fields:{test_standard:'100-120'}});
  const updated=await request('/'+detail.id,'PUT',save());assert.equal(updated.status,200);assert.equal(updated.body.data.versions[0].status,'published');assert.equal(updated.body.notification,undefined);detail=updated.body.data;
  await setUserPermission('editor','engineering_maintain',false);
  assert.notEqual((await request('/version')).body.version,enabled.body.version);
  assert.equal((await request('?all=true&category=gear_damper')).body.canMaintain,false);
  assert.equal((await request('/'+detail.id+'?summary=true')).body.canMaintain,false);
  const denied=await request('/'+detail.id,'PUT',save());assert.equal(denied.status,403);
  assert.equal(s.getStandard(detail.id).versions[0].revision,detail.versions[0].revision);
 }finally{await new Promise(resolve=>server.close(resolve));s.closeDB();}
});
