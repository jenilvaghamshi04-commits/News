import http from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Publisher} from './core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const publisher=new Publisher(process.env.PUBLISHER_DATA_DIR||path.join(root,'.localdata'));
const hosted=process.env.PUBLISHER_HOSTED==='true';
const port=Number(hosted?(process.env.PORT||8080):(process.env.PUBLISHER_API_PORT||4319));
if(hosted&&(!process.env.ADMIN_USER||!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<16||!process.env.PUBLIC_URL))throw Error('Hosted mode requires ADMIN_USER, ADMIN_PASSWORD (16+ characters), and PUBLIC_URL.');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const allowed=new Set(['localhost','127.0.0.1','terminal.local']);
const publicOrigin=process.env.PUBLIC_URL?new URL(process.env.PUBLIC_URL).origin:null;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json');
 const reply=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
 try{
  if(hosted){const expected='Basic '+Buffer.from(process.env.ADMIN_USER+':'+process.env.ADMIN_PASSWORD).toString('base64');if(!equal(req.headers.authorization||'',expected)){res.setHeader('WWW-Authenticate','Basic realm="BitcoinWorld Publisher", charset="UTF-8"');return reply(401,{error:'Sign in required.'});}}
  if(hosted&&req.headers.origin&&req.headers.origin!==publicOrigin)return reply(403,{error:'Cross-site request rejected.'});
  if(!hosted&&req.headers.origin&&!allowed.has(new URL(req.headers.origin).hostname))return reply(403,{error:'Cross-site request rejected.'});
  const url=new URL(req.url,'http://localhost');
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
  let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>256000)throw Error('Request is too large.');body+=chunk;}
  const input=body?JSON.parse(body):{};let data;
  switch(url.pathname){
   case'/api/settings':data=publisher.save(input);break;
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
server.listen(port,hosted?'0.0.0.0':'127.0.0.1',()=>console.log(`Publisher service ready on port ${port} (demo by default)`));
if(process.env.AUTO_START==='true')publisher.start();
const stop=()=>{clearInterval(interval);server.close(()=>{publisher.close();process.exit(0);});setTimeout(()=>process.exit(0),1000).unref();};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
