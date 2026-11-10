import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {prepareQuotationCopy,setQuotationUserScope,useQuotationStore,useIntlQuotationStore} from '../src/lib/store.ts';

test('quotation and cost data work without native structuredClone',async()=>{
 const native=Object.getOwnPropertyDescriptor(globalThis,'structuredClone');
 Reflect.deleteProperty(globalThis,'structuredClone');
 try{
  const {useQuoteStore}=await import('../src/lib/costStore.ts');
  useQuoteStore.getState().resetToExample();
  for(const store of [useQuotationStore,useIntlQuotationStore]){
   store.getState().resetToSample();
   const source=store.getState().quotation;
   const copy=prepareQuotationCopy(source);
   assert.deepEqual(copy.products,source.products);
   assert.notEqual(copy.products[0],source.products[0]);
  }
 }finally{
  if(native)Object.defineProperty(globalThis,'structuredClone',native);
 }
});
test('quotation drafts isolate accounts and preserve legacy drafts',()=>{
 localStorage.setItem('teao-quotation', 'legacy');
 for(const store of [useQuotationStore,useIntlQuotationStore]){
  setQuotationUserScope('A');store.getState().setCustomer(c=>({...c,name:'Account A'}));
  setQuotationUserScope('B');assert.notEqual(store.getState().quotation.customer.name,'Account A');
  store.getState().setCustomer(c=>({...c,name:'Account B'}));
  setQuotationUserScope(null);assert.notEqual(store.getState().quotation.customer.name,'Account B');
  setQuotationUserScope('A');assert.equal(store.getState().quotation.customer.name,'Account A');
 }
 assert.equal(localStorage.getItem('teao-quotation'),'legacy');
 setQuotationUserScope(null);
});

test('authentication login, fetchMe and logout select draft owner',async()=>{
 const {useAuthStore}=await import('../src/lib/authStore.ts');
 const {api}=await import('../src/lib/api.ts');
 const originalPost=api.post,originalGet=api.get;
 const user=(id:string)=>({id,name:id,username:id,role:'admin' as const,status:'active' as const,permissions:[]});
 api.post=(async()=>({token:'test-token',user:user('login-user')})) as typeof api.post;
 api.get=(async()=>user('restored-user')) as typeof api.get;
 try{
  await useAuthStore.getState().login({username:'test',password:'test'});
  useQuotationStore.getState().setCustomer(c=>({...c,name:'login draft'}));
  await useAuthStore.getState().fetchMe();
  assert.notEqual(useQuotationStore.getState().quotation.customer.name,'login draft');
  useQuotationStore.getState().setCustomer(c=>({...c,name:'restored draft'}));
  useAuthStore.getState().logout();
  assert.notEqual(useQuotationStore.getState().quotation.customer.name,'restored draft');
  await useAuthStore.getState().login({username:'test',password:'test'});
  assert.equal(useQuotationStore.getState().quotation.customer.name,'login draft');
  let resolveMe:(value:unknown)=>void=()=>{};
  api.get=(()=>new Promise(resolve=>{resolveMe=resolve})) as typeof api.get;
  const pending=useAuthStore.getState().fetchMe();
  useAuthStore.getState().logout();
  resolveMe(user('login-user'));await pending;
  assert.equal(useAuthStore.getState().user,null,'late fetchMe must not restore logged out owner');
  assert.notEqual(useQuotationStore.getState().quotation.customer.name,'login draft');
 }finally{useAuthStore.getState().logout();api.post=originalPost;api.get=originalGet;}
});
