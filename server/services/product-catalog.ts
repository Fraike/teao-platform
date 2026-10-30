import {drawingAppliesToStandards} from '../shared/product-drawing-applicability.ts';
import {inheritPublishedDrawings} from './product-drawing-inheritance.ts';
import { buildProductCategoryTree, classifyProduct, indexProductCategories, countProductCategories } from '../shared/product-classification.ts';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProductArchive, ProductMaterial, ProductStandardReference, ProductSyncState } from '../../src/types/product.ts';

interface ProductRow {
  id: string; number: string; kingdee_id: string | null; material: string | null;
  missing: number; issues: string;
}
export function productError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}
export function validateMaterialSnapshot(materials: ProductMaterial[]) {
  if (!Array.isArray(materials)) throw productError('金蝶商品列表格式错误');
  const ids = new Set<string>(), numbers = new Set<string>();
  for (const m of materials) {
    if (!m.id || !String(m.number || '').trim()) throw productError('金蝶商品缺少ID或内部料号');
    if (ids.has(String(m.id)) || numbers.has(m.number.trim())) throw productError('金蝶商品ID或内部料号重复，请核对');
    ids.add(String(m.id)); numbers.add(m.number.trim());
  }
}
export function createProductCatalog(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
  const db = new Database(path.join(directory, 'products.db'));
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS product_archives (
    id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, kingdee_id TEXT UNIQUE,
    material TEXT, missing INTEGER NOT NULL DEFAULT 0, issues TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS product_state (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_files (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES product_archives(id),
      drawing_no TEXT NOT NULL, version TEXT NOT NULL, filename TEXT NOT NULL, kind TEXT NOT NULL,
      standard_ids TEXT NOT NULL, scope_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      size INTEGER NOT NULL, sha256 TEXT NOT NULL, uploaded_by TEXT NOT NULL, uploaded_at TEXT NOT NULL,
      published_by TEXT, published_at TEXT,
      UNIQUE(product_id,drawing_no,version,kind,scope_key));
    CREATE TABLE IF NOT EXISTS product_drawing_inheritance (standard_id TEXT NOT NULL,product_id TEXT NOT NULL REFERENCES product_archives(id),inherited_at TEXT NOT NULL,PRIMARY KEY(standard_id,product_id));
    CREATE TABLE IF NOT EXISTS product_file_blobs (file_id TEXT PRIMARY KEY REFERENCES product_files(id),sha256 TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_import_batches (id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_import_entries (id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES product_import_batches(id),source_path TEXT NOT NULL,sha256 TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(batch_id,source_path));
    CREATE TABLE IF NOT EXISTS product_import_links (entry_id TEXT NOT NULL REFERENCES product_import_entries(id),product_id TEXT NOT NULL REFERENCES product_archives(id),file_id TEXT NOT NULL REFERENCES product_files(id),decision TEXT NOT NULL,PRIMARY KEY(entry_id,product_id));
    CREATE INDEX IF NOT EXISTS idx_product_files ON product_files(product_id,status);
    CREATE TABLE IF NOT EXISTS product_file_events (
      id TEXT PRIMARY KEY,file_id TEXT NOT NULL REFERENCES product_files(id), action TEXT NOT NULL,
      actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,created_at TEXT NOT NULL);`);
  const fileColumns=new Set((db.prepare('PRAGMA table_info(product_files)').all() as {name:string}[]).map(c=>c.name));
  db.transaction(()=>{
    if(!fileColumns.has('drawing_role'))db.exec("ALTER TABLE product_files ADD COLUMN drawing_role TEXT NOT NULL DEFAULT 'primary' CHECK(drawing_role IN ('primary','supplement'))");
    if(!fileColumns.has('structure'))db.exec("ALTER TABLE product_files ADD COLUMN structure TEXT NOT NULL DEFAULT 'unspecified' CHECK(structure IN ('geared','gearless','unspecified'))");
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_product_file_variant_identity ON product_files(product_id,drawing_no,version,kind,standard_ids,structure)');
  })();
  const getState = <T,>(key: string, fallback: T): T => {
    const row = db.prepare('SELECT value FROM product_state WHERE key=?').get(key) as {value:string}|undefined;
    return row ? JSON.parse(row.value) : fallback;
  };
  const setState = (key: string, value: unknown) => {
    db.prepare('INSERT INTO product_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
  };
  function reconcileStandards(standards: ProductStandardReference[]) {
    db.transaction(() => {
      const insert = db.prepare('INSERT OR IGNORE INTO product_archives(id,number) VALUES(?,?)');
      for (const s of standards) if (s.serialNo.trim()) insert.run(randomUUID(),s.serialNo.trim());
      inheritPublishedDrawings(db,directory,standards);
    })();
  }
  function applySnapshot(materials: ProductMaterial[], categories: unknown[]) {
    validateMaterialSnapshot(materials);
    if (!materials.length && (db.prepare('SELECT count(*) n FROM product_archives WHERE kingdee_id IS NOT NULL').get() as {n:number}).n) {
      throw productError('金蝶返回空商品快照，保留原有资料');
    }
    return db.transaction(() => {
      let added = 0, updated = 0;
      db.prepare('UPDATE product_archives SET missing=1 WHERE kingdee_id IS NOT NULL').run();
      for (const m of materials) {
        const byId = db.prepare('SELECT * FROM product_archives WHERE kingdee_id=?').get(String(m.id)) as ProductRow|undefined;
        const byNumber = db.prepare('SELECT * FROM product_archives WHERE number=?').get(m.number.trim()) as ProductRow|undefined;
        if ((byId && byId.number !== m.number.trim()) || (byNumber?.kingdee_id && byNumber.kingdee_id !== String(m.id))) {
          for (const row of [byId,byNumber]) if (row) db.prepare('UPDATE product_archives SET issues=? WHERE id=?').run(JSON.stringify(['金蝶ID与内部料号关联冲突，需工程核对']),row.id);
          continue;
        }
        const row = byId || byNumber, json = JSON.stringify(m);
        if (!row) {
          db.prepare('INSERT INTO product_archives(id,number,kingdee_id,material) VALUES(?,?,?,?)').run(randomUUID(),m.number.trim(),String(m.id),json);
          added++;
        } else {
          if (row.material !== json || !row.kingdee_id) updated++;
          db.prepare("UPDATE product_archives SET kingdee_id=?,material=?,missing=0,issues='[]' WHERE id=?").run(String(m.id),json,row.id);
        }
      }
      setState('materials',materials); setState('categories',categories);
      return {added,updated};
    })();
  }
  function list(standards: ProductStandardReference[]): ProductArchive[] {
    const categoryIndex = indexProductCategories(buildProductCategoryTree(getState<unknown[]>('categories',[])));
    const refs = new Map<string,ProductStandardReference[]>();
    for (const s of standards) refs.set(s.serialNo.trim(),[...(refs.get(s.serialNo.trim()) || []),s]);
    const scopes = new Map<string,string[][]>();
    for (const file of db.prepare("SELECT product_id,standard_ids FROM product_files WHERE status='published' AND kind='pdf'").all() as {product_id:string;standard_ids:string}[]) {
      const productScopes = scopes.get(file.product_id) || [];
      productScopes.push(JSON.parse(file.standard_ids));
      scopes.set(file.product_id,productScopes);
    }
    return (db.prepare('SELECT * FROM product_archives ORDER BY number COLLATE NOCASE').all() as ProductRow[]).map(row => {
      const material: ProductMaterial|null = row.material ? JSON.parse(row.material) : null;
      const linked = refs.get(row.number) || [], models = [...new Set(linked.map(s=>s.model).filter(Boolean))];
      const issues: string[] = JSON.parse(row.issues);
      const productionAvailable = Boolean((row.kingdee_id && !row.missing) || linked.length) && !issues.some(issue=>issue.includes('关联冲突'));
      if (!productionAvailable) issues.push('当前无有效商品来源或关联存在冲突，仅保留工程历史，不可用于生产');
      if (models.length>1) issues.push('关联客户标准存在不同型号，请按客户查看，未合并工程参数');
      return {id:row.id,internalNumber:row.number,kingdeeId:row.kingdee_id,material,
        name:material?.name || models[0] || row.number,model:material?.model || (models.length===1?models[0]:''),
        ...classifyProduct(material,linked,categoryIndex),unit:material?.base_unit_name || '',
        kingdeeMissing:Boolean(row.missing),standards:linked,issues,drawingCount:(scopes.get(row.id)||[]).filter(ids=>drawingAppliesToStandards(ids,linked)).length,productionAvailable};
    });
  }
  const find = (id: string, standards: ProductStandardReference[]) => list(standards).find(p=>p.id===id || p.kingdeeId===id);
  const findByNumber = (number: string, standards: ProductStandardReference[]) => list(standards).find(p=>p.internalNumber===number.trim());
  const syncState = (): ProductSyncState => ({running:false,lastAttemptAt:null,lastSuccessAt:null,error:null,added:0,updated:0,nextIntervalMinutes:60,...getState('sync',{})});
  return { db, directory, applySnapshot, reconcileStandards, list, find, findByNumber, getState, setState, syncState, categoryTree:(products:ProductArchive[])=>countProductCategories(buildProductCategoryTree(getState<unknown[]>('categories',[])),products), close:()=>db.close() };
}
export type ProductCatalog = ReturnType<typeof createProductCatalog>;
