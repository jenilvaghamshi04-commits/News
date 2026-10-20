import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
test('Render URL fallback, public health and protected API',async()=>{
 const dir=mkdtempSync(tmpdir()+'/bw-render-');
 const env={...process.env,PUBLISHER_HOSTED:'true',PORT:'0',PUBLISHER_DATA_DIR:dir,ADMIN_USER:'qa',ADMIN_PASSWORD:'qa-only-test-password',RENDER_EXTERNAL_URL:'https://news-test.onrender.com',AUTO_START:'false'};delete env.PUBLIC_URL;
 // Fixed ephemeral process-specific test port, unrelated to preview infrastructure.
 env.PORT=String(20000+process.pid%20000);
 const child=spawn(process.execPath,['server/api.mjs'],{env,stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server startup timed out')),10000);child.stdout.once('data',()=>{clearTimeout(timeout);resolve();});child.once('exit',code=>{clearTimeout(timeout);reject(Error('Startup failed '+code));});});
  const base='http://127.0.0.1:'+env.PORT;
  assert.deepEqual(await(await fetch(base+'/healthz')).json(),{ok:true});
  assert.equal((await fetch(base+'/api/state')).status,401);
  const headers={Authorization:'Basic '+Buffer.from('qa:qa-only-test-password').toString('base64'),'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/pause',{method:'POST',headers:{...headers,Origin:env.RENDER_EXTERNAL_URL},body:'{}'})).status,200);
  assert.equal((await fetch(base+'/api/pause',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));rmSync(dir,{recursive:true,force:true});}
});
