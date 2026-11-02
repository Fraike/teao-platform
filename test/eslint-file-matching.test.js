import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ESLint} from 'eslint';

test('patched glob matching still applies TypeScript rules and ignores built assets',async()=>{
  const eslint=new ESLint();
  for(const filePath of ['src/components/MatchingProbe.tsx','src/types/matching-probe.ts','test/matching-probe.test.ts']){
    const [result]=await eslint.lintText('const unused: any = 1;\n',{filePath});
    assert(result.messages.some(message=>message.ruleId==='@typescript-eslint/no-explicit-any'),filePath);
    assert(result.messages.some(message=>message.ruleId==='@typescript-eslint/no-unused-vars'),filePath);
  }
  assert.equal(await eslint.isPathIgnored('dist/assets/probe.tsx'),true);
});
