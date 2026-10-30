import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProductCatalog } from "../server/services/product-catalog.ts";
const store = createProductCatalog(mkdtempSync(path.join(os.tmpdir(), "product-catalog-")));
const standards = [
 { id: "s1", serialNo: "SP1", customer: "甲", customerPartNo: "A", model: "M", categoryKey: "gear", categoryName: "成品", versionNo: 1, fields: {} },
 { id: "s2", serialNo: "SP1", customer: "乙", customerPartNo: "B", model: "M", categoryKey: "gear", categoryName: "成品", versionNo: 1, fields: {} },
 { id: "s3", serialNo: "NEW", customer: "丙", customerPartNo: "C", model: "N", categoryKey: "gear", categoryName: "成品", versionNo: 1, fields: {} },
];
try {
 store.reconcileStandards(standards);
 const first = store.list(standards).find(p => p.internalNumber === "SP1")!;
 assert.equal(first.standards.length, 2);
 assert.equal(first.kingdeeId, null);
 const stats = store.applySnapshot([{id:"k1",number:"SP1",name:"成品"},{id:"k2",number:"HALF",name:"半成品"}], []);
 assert.equal(stats.added, 1);
 assert.equal(store.list(standards).length, 3);
 assert.equal(store.find(first.id, standards)!.kingdeeId, "k1");
 assert.equal(store.find("k1", standards)!.id, first.id, "旧金蝶ID链接继续解析");
 assert.equal(store.findByNumber("SP1", standards)!.id, first.id);
 assert.throws(() => store.applySnapshot([{id:"x",number:"SAME",name:"1"},{id:"y",number:"SAME",name:"2"}], []), /重复/);
 assert.equal(store.find(first.id, standards)!.name, "成品", "无效快照不得覆盖已有资料");
 store.applySnapshot([{id:"k1",number:"RENAMED",name:"改编码"},{id:"k2",number:"HALF",name:"半成品"}], []);
 assert.equal(store.find(first.id, standards)!.internalNumber,"SP1");
 assert.ok(store.find(first.id, standards)!.issues.length, "金蝶同ID改码需要人工核对");
 store.applySnapshot([{id:"k2",number:"HALF",name:"半成品"}], []);
 assert.equal(store.find(first.id, standards)!.kingdeeMissing,true);
 assert.throws(() => store.applySnapshot([], []), /空/);
 assert.equal(store.findByNumber('NEW',[])!.productionAvailable,false,'失去最后有效标准后仅保留历史档案');
 console.log("product catalog tests passed");
} finally { store.close(); }
