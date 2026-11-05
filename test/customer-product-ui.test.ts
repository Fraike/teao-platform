import assert from 'node:assert/strict';
import {test} from 'node:test';
import './standard-frontend-dom.ts';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {findCustomerProductStandards} from '../src/lib/customerProductStandards.ts';
import {api} from '../src/lib/api.ts';
import {CustomerProductPage} from '../src/pages/CustomerProductPage.tsx';

function Location(){return createElement('output',null,useLocation().search);}

test('customer product list shows internal mapping and only populated optional columns',async()=>{
  const original=api.get;
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  let rows=[{id:'a',customer_name:'客户甲',number:'CP-A',material_number:'SP0001-A',material_name:'内部商品',outside_unit:'  ',outside_barcode:'',outside_pk_id:''}];
  api.get=async path=>(path.startsWith('/api/standards?') ? {data:[{id:'standard-a',serialNo:'SP0001-A',customer:'客户甲'}],total:1} : {ok:true,data:rows}) as Awaited<ReturnType<typeof api.get>>;
  try{
    await act(async()=>{root.render(createElement(MemoryRouter,null,createElement(CustomerProductPage),createElement(Location)));});
    const headings=()=>[...host.querySelectorAll('thead th')].map(cell=>cell.textContent);
    assert(headings().includes('客户商品编码'));
    assert(headings().includes('内部料号'));
    assert(host.textContent?.includes('SP0001-A'));
    for(const title of ['单位','条形码','外部唯一标识'])assert(!headings().includes(title));
    rows=[{...rows[0],outside_barcode:'BAR-123'}];
    await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='搜索')!.click();});
    assert(headings().includes('条形码'));
    assert(host.textContent?.includes('BAR-123'));
    assert(!headings().includes('外部唯一标识'));
    await act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent==='SP0001-A')!.click();});
    assert.equal(host.querySelector('output')?.textContent,'?standardId=standard-a');
  }finally{
    await act(()=>root.unmount());host.remove();api.get=original;
  }
});


test('standard links match internal numbers across customers and reject similar numbers',async t=>{
  t.mock.method(api,'get',async()=>({data:[
    {id:'other-customer',serialNo:'SP1',customer:'客户乙'},
    {id:'similar-number',serialNo:'SP10',customer:'客户甲'},
  ],total:2}));
  const matches=await findCustomerProductStandards(' SP1 ',new AbortController().signal);
  assert.deepEqual(matches.map(row=>row.id),['other-customer']);
});

test('standard links collect all matching pages for selection',async t=>{
  const calls:string[]=[];
  t.mock.method(api,'get',async(url:string)=>{
    calls.push(url);const page=new URLSearchParams(url.split('?')[1]).get('page');
    return {data:[{id:page,serialNo:'SP1',customer:'客户甲'}],total:201};
  });
  const matches=await findCustomerProductStandards('SP1',new AbortController().signal);
  assert.deepEqual(matches.map(row=>row.id),['1','2']);
  assert.equal(calls.length,2);
  assert.equal(new URLSearchParams(calls[0].split('?')[1]).has('customer'),false);
});
