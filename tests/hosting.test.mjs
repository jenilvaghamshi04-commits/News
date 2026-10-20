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
  const redirect=await fetch(base,{redirect:'manual'});assert.equal(redirect.status,303);assert.equal(redirect.headers.get('location'),'/login');
  assert.equal((await fetch(base+'/login')).status,200);
  const denied=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:env.RENDER_EXTERNAL_URL},body:'username=qa&password=wrong',redirect:'manual'});assert.equal(denied.status,401);
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:env.RENDER_EXTERNAL_URL},body:'username=qa&password=qa-only-test-password',redirect:'manual'});assert.equal(login.status,303);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,'Content-Type':'application/json'};
  const state=await(await fetch(base+'/api/state',{headers})).json();assert.equal(state.config.mode,'live');assert.equal(state.postCount,0);
  assert.equal((await fetch(base+'/api/start',{method:'POST',headers,body:'{}'})).status,400);
  assert.equal((await fetch(base+'/api/pause',{method:'POST',headers:{...headers,Origin:env.RENDER_EXTERNAL_URL},body:'{}'})).status,200);
  assert.equal((await fetch(base+'/api/pause',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));rmSync(dir,{recursive:true,force:true});}
});
