import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { optionalStandardSource } from './fixtures/standard-source.ts';

test('optional private sources skip absent files and mismatched hashes before workbook parsing', () => {
  const file = pathToFileURL(join(mkdtempSync(join(tmpdir(),'teao-source-guard-')),'source.xls'));
  const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const missing = optionalStandardSource(file,hash);
  assert.equal(missing.bytes,null);
  assert.match(String(missing.skip),/不存在/);
  writeFileSync(file,'not an XLS workbook');
  const mismatch = optionalStandardSource(file,hash);
  assert.equal(mismatch.bytes,null);
  assert.match(String(mismatch.skip),/SHA256/);
  writeFileSync(file,'abc');
  const approved = optionalStandardSource(file,hash);
  assert.equal(approved.skip,false);
  assert.equal(approved.bytes?.toString(),'abc');
});
