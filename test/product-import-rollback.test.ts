import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createProductCatalog} from '../server/services/product-catalog.ts';
import {createProductDrawings} from '../server/services/product-drawings.ts';
import {createProductImports} from '../server/services/product-imports.ts';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const Database=require('better-sqlite3');
const directory=mkdtempSync(path.join(tmpdir(),'batch-rollback-'));
const previous=new Database(path.join(directory,'products.db'));
previous.exec("CREATE TABLE product_import_batches(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'finished' CHECK(kind IN ('finished','semi-parts'))); INSERT INTO product_import_batches VALUES('semi','保留原批次','2026','工程','semi-parts')");previous.close();
let store=createProductCatalog(directory);
const actor={id:'admin',name:'工程',role:'admin',permissions:[]};
const imports=()=>createProductImports(store,createProductDrawings(store),()=>store.list([]));
try{
 assert.equal(store.db.prepare('PRAGMA table_info(product_import_batches)').all().length,4);
 assert.equal(imports().view('semi',actor).batch.kind,'semi-parts');
 // The deployed old version uses exactly this four-value INSERT on rollback.
 store.db.prepare('INSERT INTO product_import_batches VALUES(?,?,?,?)').run('old','旧代码新批次','2026','工程');
 assert.equal(imports().view('old',actor).batch.kind,'finished');
 const created=imports().create('新半成品',actor,'semi-parts');assert.equal(created.kind,'semi-parts');
 const count=store.db.prepare('SELECT count(*) n FROM product_import_batches').get()!.n;
 store.db.exec("CREATE TRIGGER fail_batch_type BEFORE INSERT ON product_import_batch_types BEGIN SELECT RAISE(ABORT,'test type failure'); END");
 assert.throws(()=>imports().create('应回滚',actor,'semi-parts'),/test type failure/);
 assert.equal(store.db.prepare('SELECT count(*) n FROM product_import_batches').get()!.n,count);
 store.db.exec('DROP TRIGGER fail_batch_type');
 store.close();store=createProductCatalog(directory);
 assert.equal(imports().view(created.id,actor).batch.kind,'semi-parts');
 assert.equal(imports().view('old',actor).batch.kind,'finished');
 console.log('four-column rollback, experimental kind migration, atomic creation and reopen passed');
}finally{store.close();}
