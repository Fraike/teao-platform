import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DATA_DIR } from '../config.js';
import {
  CUSTOMER_ACCOUNT_IMPORT_LIMIT, CUSTOMER_ACCOUNT_PAGE_SIZE, customerAccountContainsPassword, customerAccountDetails, customerAccountIssues,
  customerAccountPasswordIssue, customerAccountUrl,
} from '../shared/customer-system-account.ts';
import type {
  CustomerAccount, CustomerAccountArchiveRow, CustomerAccountDetails, CustomerAccountInput, CustomerAccountImportRow,
} from '../../src/types/customerSystemAccount.ts';

interface StoredPassword {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

const dbColumns = `id, company, url, username, note, revision, password_changed_at AS passwordChangedAt,
  length(ciphertext)>0 AS hasPassword,
  (SELECT json_group_array(json_object('rowNumber', source_row, 'issues', json(issues)))
    FROM customer_account_source_rows WHERE account_id=customer_accounts.id ORDER BY source_row) AS sourceRows`;
let connection: { db: Database.Database; key: Buffer } | undefined;

export function customerAccountError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

export function closeCustomerAccounts() {
  connection?.db.close();
  connection = undefined;
}

function createDatabase() {
  mkdirSync(DATA_DIR, { recursive: true });
  const file = join(DATA_DIR, 'customer-system-accounts.db');
  try {
    closeSync(openSync(file, 'wx', 0o600));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return new Database(file);
}

function initializeDatabase(db: Database.Database, key: Buffer) {
  const verifier = createHmac('sha256', key).update('teao/customer-system-accounts/v1').digest();
  db.pragma('foreign_keys=ON');
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS customer_account_key (id INTEGER PRIMARY KEY CHECK (id=1), verifier BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS customer_accounts (
        id TEXT PRIMARY KEY, company TEXT NOT NULL, url TEXT NOT NULL, username TEXT NOT NULL, note TEXT NOT NULL,
        ciphertext BLOB NOT NULL, iv BLOB NOT NULL, tag BLOB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
        password_changed_at TEXT, UNIQUE(company, url, username)
      );
      CREATE TABLE IF NOT EXISTS customer_account_password_changes (
        id INTEGER PRIMARY KEY, account_id TEXT NOT NULL REFERENCES customer_accounts(id),
        changed_at TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, reason TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS customer_account_changes_by_account
        ON customer_account_password_changes(account_id, id DESC);
      CREATE TABLE IF NOT EXISTS customer_account_source_rows (
        source_hash TEXT NOT NULL, source_row INTEGER NOT NULL,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id),
        issues TEXT NOT NULL, ciphertext BLOB NOT NULL, iv BLOB NOT NULL, tag BLOB NOT NULL,
        PRIMARY KEY(source_hash, source_row)
      );
      CREATE INDEX IF NOT EXISTS customer_account_source_by_account ON customer_account_source_rows(account_id, source_row);`);
    db.prepare('INSERT OR IGNORE INTO customer_account_key (id, verifier) VALUES (1, ?)').run(verifier);
    const stored = db.prepare('SELECT verifier FROM customer_account_key WHERE id=1').pluck().get();
    if (!Buffer.isBuffer(stored) || stored.length !== verifier.length || !timingSafeEqual(stored, verifier)) {
      throw customerAccountError(503, '客户账号加密密钥不匹配，请联系管理员');
    }
  }).immediate();
}

function database() {
  const configured = process.env.CUSTOMER_ACCOUNTS_KEY || '';
  const key = Buffer.from(configured, 'base64');
  if (key.length !== 32 || key.toString('base64') !== configured) {
    throw customerAccountError(503, '客户账号尚未配置加密密钥，请联系管理员');
  }
  if (connection && timingSafeEqual(connection.key, key)) return connection;
  closeCustomerAccounts();
  const db = createDatabase();
  try {
    initializeDatabase(db, key);
    connection = { db, key };
    return connection;
  } catch (error) {
    db.close();
    throw error;
  }
}

function encrypt(key: Buffer, id: string, password: string): StoredPassword {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(id));
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function decrypt(key: Buffer, id: string, { ciphertext, iv, tag }: StoredPassword): string {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function checkedDetails(input: Partial<CustomerAccountDetails>, requireLoginFields = false) {
  const details = customerAccountDetails(input);
  const issues = customerAccountIssues(details, requireLoginFields);
  if (issues.length) throw customerAccountError(400, issues.join('，'));
  return { ...details, url: customerAccountUrl(details.url) };
}

function checkedPassword(password: string) {
  const issue = customerAccountPasswordIssue(password);
  if (issue) throw customerAccountError(400, issue);
  return password;
}

function publicAccount(row: Omit<CustomerAccount, 'sourceRows' | 'hasPassword'> & { sourceRows: string; hasPassword: number }): CustomerAccount {
  return { ...row, sourceRows: JSON.parse(row.sourceRows), hasPassword: Boolean(row.hasPassword) };
}

function entry(db: Database.Database, id: string) {
  const row = db.prepare(`SELECT ${dbColumns} FROM customer_accounts WHERE id=?`).get(id) as Parameters<typeof publicAccount>[0] | undefined;
  if (!row) throw customerAccountError(404, '客户账号不存在');
  return publicAccount(row);
}

function assertRevision(row: CustomerAccount, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw customerAccountError(400, '缺少有效的账号版本');
  if (row.revision !== revision) throw customerAccountError(409, '账号已更新，请刷新后重试');
}

function insert(db: Database.Database, key: Buffer, details: CustomerAccountDetails, password: string): string | null {
  if (customerAccountContainsPassword(details.note, password)) throw customerAccountError(400, '备注不能包含密码');
  const id = randomUUID();
  const { ciphertext, iv, tag } = encrypt(key, id, password);
  const result = db.prepare(`INSERT INTO customer_accounts (id, company, url, username, note, ciphertext, iv, tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (company, url, username) DO NOTHING`)
    .run(id, details.company, details.url, details.username, details.note, ciphertext, iv, tag);
  return result.changes ? id : null;
}

export function listCustomerAccounts() {
  return (database().db.prepare(`SELECT ${dbColumns} FROM customer_accounts ORDER BY company, username, id`).all() as Parameters<typeof publicAccount>[0][]).map(publicAccount);
}

export function createCustomerAccount(input: CustomerAccountInput) {
  const { db, key } = database();
  const id = insert(db, key, checkedDetails(input), checkedPassword(input?.password));
  if (!id) throw customerAccountError(409, '同公司、网址和账号的记录已存在');
  return entry(db, id);
}

export function importCustomerAccounts(rows: CustomerAccountImportRow[]) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > CUSTOMER_ACCOUNT_IMPORT_LIMIT ||
    rows.some(row => !Number.isSafeInteger(row?.rowNumber) || row.rowNumber < 1)) {
    throw customerAccountError(400, '请选择有效的导入行');
  }
  const { db, key } = database();
  return db.transaction(() => {
    const duplicates: number[] = [];
    for (const row of rows) {
      if (!insert(db, key, checkedDetails(row.account, true), checkedPassword(row.account?.password))) duplicates.push(row.rowNumber);
    }
    return { imported: rows.length - duplicates.length, duplicates };
  }).immediate();
}

/** Used by the local workbook migration. The normal import API still requires complete records. */
export function importCustomerAccountArchive(sourceHash: string, rows: CustomerAccountArchiveRow[]) {
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Invalid source hash');
  const { db, key } = database();
  const findSource = db.prepare('SELECT 1 FROM customer_account_source_rows WHERE source_hash=? AND source_row=?');
  const findAccount = db.prepare('SELECT id, note FROM customer_accounts WHERE company=? AND url=? AND username=?');
  const saveSource = db.prepare(`INSERT INTO customer_account_source_rows
    (source_hash, source_row, account_id, issues, ciphertext, iv, tag) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  return db.transaction(() => {
    const result = { created: 0, merged: 0, skipped: 0 };
    for (const row of rows) {
      if (findSource.get(sourceHash, row.rowNumber)) { result.skipped++; continue; }
      const details = { ...customerAccountDetails(row.account), url: customerAccountUrl(row.account.url) };
      const password = row.account.password;
      let id = insert(db, key, details, password);
      if (id) result.created++;
      else {
        const existing = findAccount.get(details.company, details.url, details.username) as { id: string; note: string };
        if (existing.note !== details.note || decrypt(key, existing.id, storedPassword(db, existing.id)) !== password) {
          throw customerAccountError(409, `原表第 ${row.rowNumber} 行与已有账号冲突`);
        }
        id = existing.id;
        result.merged++;
      }
      const source = encrypt(key, `${sourceHash}:${row.rowNumber}:${id}`, JSON.stringify(row.cells));
      saveSource.run(sourceHash, row.rowNumber, id, JSON.stringify(row.issues), source.ciphertext, source.iv, source.tag);
    }
    return result;
  }).immediate();
}

export function readCustomerAccountSource(id: string) {
  const { db, key } = database();
  const rows = db.prepare(`SELECT source_hash AS hash, source_row AS rowNumber, ciphertext, iv, tag
    FROM customer_account_source_rows WHERE account_id=? ORDER BY source_row`).all(id) as
    (StoredPassword & { hash: string; rowNumber: number })[];
  return rows.map(row => ({
    rowNumber: row.rowNumber,
    cells: JSON.parse(decrypt(key, `${row.hash}:${row.rowNumber}:${id}`, row)) as CustomerAccountArchiveRow['cells'],
  }));
}

export function updateCustomerAccount(
  id: string,
  input: CustomerAccountDetails & { revision: number; password?: string },
  actor: { id: string; name: string },
) {
  const details = checkedDetails(input);
  const password = input.password === undefined || input.password === '' ? undefined : checkedPassword(input.password);
  const { db, key } = database();
  return db.transaction(() => {
    assertRevision(entry(db, id), input.revision);
    const previous = decrypt(key, id, storedPassword(db, id));
    if (customerAccountContainsPassword(details.note, previous) ||
      (password !== undefined && customerAccountContainsPassword(details.note, password))) {
      throw customerAccountError(400, '备注不能包含密码');
    }
    const result = db.prepare(`UPDATE OR IGNORE customer_accounts
      SET company=?, url=?, username=?, note=?, revision=revision+1 WHERE id=?`)
      .run(details.company, details.url, details.username, details.note, id);
    if (!result.changes) throw customerAccountError(409, '同公司、网址和账号的记录已存在');
    if (password !== undefined && password !== previous) writePasswordChange(db, key, id, password, actor, '');
    return entry(db, id);
  }).immediate();
}

function storedPassword(db: Database.Database, id: string) {
  const row = db.prepare('SELECT ciphertext, iv, tag FROM customer_accounts WHERE id=?').get(id) as StoredPassword | undefined;
  if (!row) throw customerAccountError(404, '客户账号不存在');
  return row;
}

export function revealCustomerAccountPassword(id: string) {
  const { db, key } = database();
  const encrypted = storedPassword(db, id);
  if (!encrypted.ciphertext.length) throw customerAccountError(404, '原表未填写密码');
  return { password: decrypt(key, id, encrypted) };
}

export function revealCustomerAccountPasswords(ids: unknown) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > CUSTOMER_ACCOUNT_PAGE_SIZE ||
    ids.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))) {
    throw customerAccountError(400, '请选择有效的账号');
  }
  const { db, key } = database();
  const rows = db.prepare(`SELECT id, ciphertext, iv, tag FROM customer_accounts
    WHERE length(ciphertext)>0 AND id IN (${ids.map(() => '?').join(',')})`).all(...ids) as (StoredPassword & { id: string })[];
  return Object.fromEntries(rows.map(row => [row.id, decrypt(key, row.id, row)]));
}

function writePasswordChange(
  db: Database.Database, key: Buffer, id: string, password: string,
  actor: { id: string; name: string }, reason: string,
) {
  const { ciphertext, iv, tag } = encrypt(key, id, password);
  const now = new Date().toISOString();
  db.prepare('UPDATE customer_accounts SET ciphertext=?, iv=?, tag=?, password_changed_at=? WHERE id=?')
    .run(ciphertext, iv, tag, now, id);
  db.prepare('INSERT INTO customer_account_password_changes (account_id, changed_at, actor_id, actor_name, reason) VALUES (?, ?, ?, ?, ?)')
    .run(id, now, actor.id, actor.name, reason.trim());
}

export function readSupplementalCustomerCredentials(id: string) {
  return readCustomerAccountSource(id).flatMap(row => row.cells.flatMap(cell => {
    if (cell.column === 'H') {
      const vpn = cell.value.match(/连接\s*VPN.*?账号[:：]\s*(\S+)\s+密码[:：]\s*(\S+)/i);
      return vpn ? [{ username: vpn[1], password: vpn[2], step: 'VPN 登录' }] : [];
    }
    if (cell.column !== 'G') return [];
    return Array.from(cell.value.matchAll(/^【附加凭据\s*\d+】账号=([^｜\r\n]*)｜密码=([^｜\r\n]*)(?:｜.*关联步骤=([^｜\r\n]*))?/gm),
      ([, username, password, step]) => ({ username, password, step: step ?? '' }));
  }));
}

export function changeCustomerAccountPassword(
  id: string,
  input: { revision: number; password: string; reason?: string },
  actor: { id: string; name: string },
) {
  const password = checkedPassword(input?.password);
  const reason = input.reason ?? '';
  if (typeof reason !== 'string' || reason.length > 500) throw customerAccountError(400, '变更说明最多 500 字');
  const { db, key } = database();
  return db.transaction(() => {
    const account = entry(db, id);
    assertRevision(account, input.revision);
    const previous = decrypt(key, id, storedPassword(db, id));
    if (previous === password) return account;
    if (customerAccountContainsPassword(reason, previous) || customerAccountContainsPassword(reason, password)) {
      throw customerAccountError(400, '变更说明不能包含密码');
    }
    if (customerAccountContainsPassword(account.note, password)) {
      throw customerAccountError(400, '请先移除账号备注中的新密码');
    }
    writePasswordChange(db, key, id, password, actor, reason);
    db.prepare('UPDATE customer_accounts SET revision=revision+1 WHERE id=?').run(id);
    return entry(db, id);
  }).immediate();
}

export function listCustomerAccountHistory(id: string) {
  const { db } = database();
  entry(db, id);
  return db.prepare(`SELECT id, changed_at AS changedAt, actor_name AS actorName, reason
    FROM customer_account_password_changes WHERE account_id=? ORDER BY id DESC`).all(id);
}
