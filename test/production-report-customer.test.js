import assert from 'node:assert/strict';
import { buildWecomContent } from '../server/services/report.js';
const assembly={summary:{lines:1,totalActualQty:3,totalDefects:0,totalPlanQty:3},rawCount:3,records:[{line:'1#',products:[
 {name:'产品A',customer:'客户甲',actualQty:1,defects:0},
 {name:'产品B',customer:'客户|乙\n分部',actualQty:1,defects:0},
 {name:'产品C',customer:'',actualQty:1,defects:0},
]}]};
const injection={summary:{machines:0,totalQty:0,totalDefects:0},rawCount:0,records:[]};
const content=buildWecomContent('2026-10-19',assembly,injection,'internal');
assert(content.includes('| 产线 | 客户名称 | 品名 | 产量 | 不良 |'));
assert(content.includes('| 1# | 客户甲 | 产品A | 1 | - |'));
assert(content.includes('| 1# | 客户｜乙 分部 | 产品B | 1 | - |'));
assert(content.includes('| 1# | — | 产品C | 1 | - |'));
assert(content.includes('| 机台 | 品名 | 产量 | 不良 |'));
console.log('assembly customer column and safe table cells passed');
