import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('occupied API port exits with an error before starting scheduled jobs',async()=>{
  const occupied=createServer();
  await new Promise(resolve=>occupied.listen(0,'127.0.0.1',resolve));
  const directory=mkdtempSync(path.join(os.tmpdir(),'teao-startup-'));
  const configPath=path.join(directory,'config.json');
  writeFileSync(configPath,JSON.stringify({enabled:false,wecomWebhook:''}));
  const child=spawn(process.execPath,['server/server.js'],{env:{...process.env,
    NODE_ENV:'production',DATA_DIR:directory,PRODUCTION_CONFIG_PATH:configPath,
    PRODUCTION_DB_PATH:path.join(directory,'production.db'),PORT:String(occupied.address().port),
    JWT_SECRET:'startup-test-only-secret-at-least-32-characters',INITIAL_ADMIN_PASSWORD:'StartupTest123456',
    KINGDEE_CLIENT_ID:'',KINGDEE_CLIENT_SECRET:'',STANDARD_REVIEW_REMINDERS_ENABLED:'false',
  },stdio:['ignore','pipe','pipe']});
  let output='';
  child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  const timeout=setTimeout(()=>child.kill('SIGKILL'),5000);
  try{
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
    assert.equal(code,1,output);
    assert.match(output,/EADDRINUSE/);
    assert.doesNotMatch(output,/teao-api running|定时催审未启用/);
  }finally{clearTimeout(timeout);child.kill();await new Promise(resolve=>occupied.close(resolve));}
});
