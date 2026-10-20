import http from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {authentication,loginPage} from './auth.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Publisher} from './core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hosted=process.env.PUBLISHER_HOSTED==='true';
export const publisher=new Publisher(process.env.PUBLISHER_DATA_DIR||path.join(root,'.localdata'),{initialMode:hosted?'live':'demo',seedDemo:!hosted});
// One-time move of older hosted demo workspaces to real-data setup. No publishing starts here.
if(hosted&&!publisher.get('liveWorkspaceV1')){publisher.put('config',{...publisher.config(),mode:'live'});publisher.put('liveWorkspaceV1',true);publisher.event('Live workspace ready. Connect and verify X and Telegram before starting.');}
const serverSecrets=publisher.secrets();
if(process.env.X_BEARER_TOKEN)serverSecrets.xToken=process.env.X_BEARER_TOKEN.trim();
if(process.env.TELEGRAM_BOT_TOKEN)serverSecrets.botToken=process.env.TELEGRAM_BOT_TOKEN.trim();
if(process.env.X_BEARER_TOKEN||process.env.TELEGRAM_BOT_TOKEN)publisher.saveSecrets(serverSecrets);
const externalUrl=process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL;
const port=Number(hosted?(process.env.PORT||8080):(process.env.PUBLISHER_API_PORT||4319));
if(hosted&&(!process.env.ADMIN_USER||!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<16||!externalUrl))throw Error("Hosted mode requires ADMIN_USER, ADMIN_PASSWORD (16+ characters), and PUBLIC_URL (or Render automatic RENDER_EXTERNAL_URL).");

const allowed=new Set(['localhost','127.0.0.1','terminal.local']);
const publicOrigin=externalUrl?new URL(externalUrl).origin:null;
const auth=hosted?authentication({username:process.env.ADMIN_USER,password:process.env.ADMIN_PASSWORD,secure:publicOrigin.startsWith('https:')}):null;
const loginAttempts=new Map();
async function readBody(req,max=256000){let value='',size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('Request is too large.');value+=chunk;}return value;}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json');
 const reply=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
 try{
  // Public liveness only: never returns configuration, credentials or history.
  if(req.method==='GET'&&req.url==='/healthz')return reply(200,{ok:true});
  const url=new URL(req.url,'http://localhost');
  if(hosted&&url.pathname==='/login'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.writeHead(200);return res.end(loginPage());}
  if(hosted&&url.pathname==='/auth/login'&&req.method==='POST'){
   if(req.headers.origin&&req.headers.origin!==publicOrigin)return reply(403,{error:'Cross-site sign-in rejected.'});
   if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))return reply(415,{error:'Use the sign-in form.'});
   const now=Date.now(),ip=req.socket.remoteAddress,attempt=loginAttempts.get(ip);
   if(attempt&&attempt.until>now&&attempt.count>=10)return reply(429,{error:'Too many unsuccessful sign-ins. Try again in ten minutes.'});
   const form=new URLSearchParams(await readBody(req,4000));
   if(!auth.credentials(form.get('username'),form.get('password'))){loginAttempts.set(ip,{count:attempt&&attempt.until>now?attempt.count+1:1,until:attempt&&attempt.until>now?attempt.until:now+600000});res.setHeader('Content-Type','text/html; charset=utf-8');res.writeHead(401);return res.end(loginPage(true));}
   loginAttempts.delete(ip);res.setHeader('Set-Cookie',auth.cookie(auth.issue()));res.writeHead(303,{Location:'/'});return res.end();
  }
  if(hosted&&!auth.valid(req.headers.cookie)){if(url.pathname.startsWith('/api/'))return reply(401,{error:'Sign in required.'});res.writeHead(303,{Location:'/login'});return res.end();}
  if(hosted&&req.headers.origin&&req.headers.origin!==publicOrigin)return reply(403,{error:'Cross-site request rejected.'});
  if(!hosted&&req.headers.origin&&!allowed.has(new URL(req.headers.origin).hostname))return reply(403,{error:'Cross-site request rejected.'});
  if(req.method==='GET'&&url.pathname==='/api/health')return reply(200,{ok:true,service:'BitcoinWorld Publisher',mode:publisher.config().mode});
  if(req.method==='GET'&&url.pathname==='/api/state')return reply(200,publisher.state());
  if(hosted&&req.method==='GET'&&!url.pathname.startsWith('/api/')){
   const dist=path.join(root,'host-dist');let candidate=path.resolve(dist,'.'+decodeURIComponent(url.pathname));
   if(!candidate.startsWith(dist+path.sep)&&candidate!==dist)return reply(404,{error:'Not found'});
   if(candidate===dist||!existsSync(candidate)||!statSync(candidate).isFile())candidate=path.join(dist,'host.html');
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
   res.setHeader('Content-Type',mime[path.extname(candidate)]||'application/octet-stream');res.writeHead(200);return res.end(readFileSync(candidate));
  }
  if(req.method!=='POST')return reply(404,{error:'Not found'});
  if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'Use JSON requests.'});
  const body=await readBody(req);const input=body?JSON.parse(body):{};let data;
  switch(url.pathname){
   case'/api/settings':data=publisher.save(input);break;
   case'/api/live/enable':await publisher.enableLive();data=publisher.state();break;
   case'/api/start':publisher.start();data=publisher.state();break;
   case'/api/pause':publisher.pause();data=publisher.state();break;
   case'/api/check':await publisher.guardedPoll();data=publisher.state();break;
   case'/api/latest':await publisher.guardedPoll({preview:true});data=publisher.state();break;
   case'/api/connect':await publisher.check(input.provider);data=publisher.state();break;
   case'/api/test':if(input.confirmed!==true)throw Error('Confirm the public Telegram test first.');await publisher.testTelegram();data=publisher.state();break;
   case'/api/post/edit':publisher.editPost(input.id,input.caption);data=publisher.state();break;
   case'/api/post/send':data=await publisher.sendApproved(input.id);break;
   case'/api/post/skip':publisher.skip(input.id);data=publisher.state();break;
   case'/api/delivery/retry':publisher.retry(input.id,{verifiedAbsent:input.verifiedAbsent===true});await publisher.deliverOne({deliveryId:input.id,manual:true});data=publisher.state();break;
   default:return reply(404,{error:'Not found'});
  }
  return reply(200,data);
 }catch(e){return reply(400,{error:e.message});}
});
const interval=setInterval(()=>publisher.tick().catch(e=>{publisher.lastError=e.message;publisher.event(e.message,'error');}),1000);
server.listen(port,hosted?'0.0.0.0':'127.0.0.1',()=>console.log(`Publisher service ready on port ${port} (${publisher.config().mode} workspace)`));
if(process.env.AUTO_START==='true'||(process.env.AUTO_START!=='false'&&publisher.get('resumeRequested'))){try{publisher.start();}catch(e){publisher.lastError=e.message;publisher.event('Automatic resume held: '+e.message,'error');}}
const stop=()=>{clearInterval(interval);server.close(()=>{publisher.close();process.exit(0);});setTimeout(()=>process.exit(0),1000).unref();};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
