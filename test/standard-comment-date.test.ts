import assert from 'node:assert/strict';
import {test} from 'node:test';
import {firstCommentDate} from '../src/lib/standardCommentDate.ts';
import {parseStandardImportRows} from '../src/lib/standardImport.ts';

test('new imports only recognize legal leading dates, never material numbers',()=>{
 assert.equal(firstCommentDate('U9号：2010.0431.0805'),'');
 assert.equal(firstCommentDate('2024.2.30 错误日期'),'');
 assert.equal(firstCommentDate('2024.2.29 合法日期'),'2024-02-29');
 assert.equal(firstCommentDate('ta-05:\n2024/7/26'),'2024-07-26');
 assert.equal(firstCommentDate('原2021.11.1新增'),'');
 const parsed=parseStandardImportRows([['齿条阻尼器'],['SP1','客户','型号','','','范围']],{comments:[{row:1,column:5,cell:'F2',author:'a',text:'U9号：2010.0431.0805'}]});
 assert.equal(parsed.records[0].comments![0].changedAt,'');
});
