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

test('domestic tax selection synchronizes first term and default settlement is persistent',()=>{
 setQuotationUserScope('tax-terms');
 const store=useQuotationStore;
 store.getState().resetToSample();
 assert.match(store.getState().quotation.terms[0],/不含13%税单价/);
 assert.equal(store.getState().quotation.terms[5],'6. 结算方式：入库结算。');
 store.getState().setQuoteMeta(meta=>({...meta,taxNote:'含税'}));
 assert.match(store.getState().quotation.terms[0],/含13%税单价/);
 store.getState().setTerms(['1. 以上价格为含13%税单价，运费另计。','2. 客户自定义条款。']);
 store.getState().setQuoteMeta(meta=>({...meta,taxNote:'不含税'}));
 assert.deepEqual(store.getState().quotation.terms,['1. 以上价格为不含13%税单价，运费另计。','2. 客户自定义条款。']);
 setQuotationUserScope(null);setQuotationUserScope('tax-terms');
 assert.match(store.getState().quotation.terms[0],/不含13%税/);
 store.getState().resetTerms();
 assert.match(store.getState().quotation.terms[0],/不含13%税/);
 assert.equal(store.getState().quotation.terms[5],'6. 结算方式：入库结算。');
 const international=useIntlQuotationStore.getState().quotation.terms;
 useIntlQuotationStore.getState().setQuoteMeta(meta=>({...meta,taxNote:'含税'}));
 assert.deepEqual(useIntlQuotationStore.getState().quotation.terms,international);
 setQuotationUserScope(null);
});


test('domestic molds require one product and guard all product insertion actions',()=>{
 setQuotationUserScope('mold-rules');
 const store=useQuotationStore;
 store.getState().resetToSample();
 store.getState().addMold();
 assert.equal(store.getState().quotation.molds.length,0);
 const product=store.getState().quotation.products[0];
 store.getState().setProducts([product]);
 store.getState().addMold();store.getState().addMold();
 assert.equal(store.getState().quotation.molds.length,2);
 store.getState().addProduct();store.getState().duplicateProduct(product.id);
 store.getState().setProducts([product,{...product,id:'another'}]);
 assert.equal(store.getState().quotation.products.length,1);
 setQuotationUserScope(null);setQuotationUserScope('mold-rules');
 assert.equal(store.getState().quotation.molds.length,2);
 store.getState().removeMold(store.getState().quotation.molds[0].id);
 store.getState().removeMold(store.getState().quotation.molds[0].id);
 store.getState().addProduct();
 assert.equal(store.getState().quotation.products.length,2);
 useIntlQuotationStore.getState().resetToSample();
 useIntlQuotationStore.getState().addMold();
 const count=useIntlQuotationStore.getState().quotation.products.length;
 useIntlQuotationStore.getState().addProduct();
 assert.equal(useIntlQuotationStore.getState().quotation.products.length,count+1);
 setQuotationUserScope(null);
});
