import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('server lockfile contains complete versions for every installable package, including optional architectures',()=>{
  const lock=JSON.parse(readFileSync(new URL('../server/package-lock.json',import.meta.url),'utf8'));
  for(const [name,metadata] of Object.entries(lock.packages)){
    if(!name||metadata.link)continue;
    assert.equal(typeof metadata.version,'string',`${name} is missing a version and breaks npm ci`);
    assert(metadata.version.trim(),`${name} has an empty version`);
    assert(metadata.resolved&&metadata.integrity,`${name} needs a resolved tarball and integrity`);
  }
});
