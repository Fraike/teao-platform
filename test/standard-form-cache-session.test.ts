import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {TabPageContext} from '../src/lib/tabPageContext.tsx';
import {getTabPage,clearTabScope,startTabInstance} from '../src/lib/tabPageCache.ts';
import {StandardFormModal} from '../src/components/standard/StandardFormModal.tsx';
import {api} from '../src/lib/api.ts';
import type {StandardDetail} from '../src/types/standard.ts';
const detail=(id:string):StandardDetail=>({id,versions:[{id:`${id}-v`,revision:id==='B'?2:1,serialNo:id,customer:`customer-${id}`,model:`model-${id}`,categoryKey:'gear_damper',standardType:'formal',fields:{},status:'draft'}],changes:[]} as StandardDetail);

for(const scenario of ['cancel-closed-cold','closed-cold','open-cold-same','new-cold-same','copy-cold-same','open-cold-other','direct-switch','save-cold','copy-cold-other','new-after-cancel'] as const){
 test(`standard form cache session: ${scenario}`,async()=>{
  const scope=`form-session-${scenario}`,record=getTabPage(scope,'form');record.active=true;
  let instance=startTabInstance(record),open=true,initial:StandardDetail|null=detail('A'),copySource:StandardDetail|null=null;
  if(scenario==='copy-cold-other'||scenario==='copy-cold-same'){copySource=initial;initial=null;}
  if(scenario==='new-cold-same')initial=null;
  const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
  const requests:{url:string;payload:Record<string,unknown>}[]=[];
  const oldPut=api.put,oldPost=api.post;
  const save=(async(url:string,payload:unknown)=>{requests.push({url,payload:payload as Record<string,unknown>});return {data:detail('B')};}) as typeof api.put;
  api.put=save;api.post=save;
  const render=()=>act(async()=>root.render(createElement(StrictMode,null,createElement(TabPageContext.Provider,{value:{record,instance,active:true,restored:instance>1,container:host}},createElement(StandardFormModal,{open,initial,copySource,categories:[{key:'gear_damper',name:'齿轮',fields:[]}],directPublish:true,onClose(){open=false;},onSaved(){}})))));
  const type=async(placeholder:string,value:string)=>act(()=>{const input=host.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  const click=async(label:string)=>{await act(()=>{[...host.querySelectorAll('button')].find(button=>button.textContent?.replaceAll(' ','')===label)!.click();});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});};
  const cold=async()=>{await act(()=>root.unmount());instance=startTabInstance(record);root=createRoot(host);await render();};
  try{
   await render();if(scenario==='new-cold-same')await type('如 SP0009-A','NEW');await type('客户名称','unsaved-A');await type('型号','unsaved-model-A');
   if(scenario==='cancel-closed-cold'||scenario==='new-after-cancel'){await click('取消');assert.equal(record.snapshot.get('standard:form:session'),null);assert.equal(record.snapshot.get('standard:form:dirty'),false);await render();}
   if(scenario==='closed-cold'){open=false;await render();}
   if(scenario==='save-cold'){await click('保存并发布');assert.equal(record.snapshot.get('standard:form:session'),null);assert.equal(record.snapshot.get('standard:form:dirty'),false);requests.length=0;}
   if(scenario==='open-cold-other'||scenario==='save-cold')initial=detail('B');
   if(scenario==='copy-cold-other')copySource=detail('B');
   if(scenario!=='direct-switch')await cold();
   if(scenario==='open-cold-same'||scenario==='new-cold-same'||scenario==='copy-cold-same'){
    await click('保存并发布');assert.equal(requests[0]?.payload.customer,'unsaved-A');assert.equal(requests[0]?.payload.model,'unsaved-model-A');assert.equal(requests[0]?.url,scenario==='open-cold-same'?'/api/standards/A':'/api/standards');
   }else if(scenario==='new-after-cancel'){
    initial=null;open=true;await render();await type('如 SP0009-A','NEW');await type('客户名称','new-customer');await type('型号','new-model');await click('保存并发布');assert.equal(requests[0]?.url,'/api/standards');assert.equal(requests[0]?.payload.customer,'new-customer');assert.equal(requests[0]?.payload.serialNo,'NEW');
   }else{
    if(scenario==='copy-cold-other')copySource=detail('B');else initial=detail('B');open=true;await render();await click('保存并发布');
    assert.equal(requests[0]?.payload.customer,'customer-B');assert.equal(requests[0]?.payload.model,'model-B');assert.equal(requests[0]?.url,scenario==='copy-cold-other'?'/api/standards':'/api/standards/B');
    if(scenario!=='copy-cold-other')assert.equal(requests[0]?.payload.revision,2);
   }
  }finally{await act(()=>root.unmount());api.put=oldPut;api.post=oldPost;clearTabScope(scope);host.remove();}
 });
}
