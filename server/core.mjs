import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv,createHash,randomUUID} from 'node:crypto';

export const defaults={sourceUsername:'BitcoinWorldN',channels:['@News982192'],mode:'demo',posting:'auto',pollSeconds:60,newOnly:true,prefix:'',hashtags:'#Bitcoin #CryptoNews',signature:'',website:'',formats:['text','photo','video','animation']};
export const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
export const hash=s=>createHash('sha256').update(norm(s)).digest('hex');
export const split=(text,max)=>{const a=[];while(text.length){let n=Math.min(max,text.length);if(n<text.length&&/[\uD800-\uDBFF]/.test(text[n-1]))n--;a.push(text.slice(0,n));text=text.slice(n);}return a;};
const json=v=>JSON.stringify(v),parse=(s,f={})=>{try{return JSON.parse(s);}catch{return f;}};
export class Publisher {
 constructor(dir,{network=fetch}={}){
  mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);const keyfile=path.join(dir,'secrets.key');
  if(!existsSync(keyfile))writeFileSync(keyfile,randomBytes(32),{mode:0o600});this.key=readFileSync(keyfile);
  this.db=new DatabaseSync(path.join(dir,'publisher.sqlite'));this.network=network;this.started=Date.now();this.busy=false;this.nextPoll=0;
  this.db.exec(`PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,source_id TEXT,mode TEXT,username TEXT,text TEXT,caption TEXT,media TEXT,created INTEGER,detected INTEGER,approved INTEGER,title TEXT,UNIQUE(mode,source_id));CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY,post_id TEXT,channel TEXT,mode TEXT,status TEXT,caption TEXT,fingerprint TEXT,created INTEGER,updated INTEGER,error TEXT DEFAULT '',link TEXT,messages TEXT DEFAULT '[]',UNIQUE(post_id,channel));CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,level TEXT,message TEXT,created INTEGER);`);
  if(!this.get('config'))this.put('config',defaults);
  this.db.prepare("UPDATE deliveries SET status='uncertain',error='Server restarted during delivery. Verify Telegram before retrying.' WHERE status='sending'").run();
  // Explicit start is required after a server restart. No surprise live broadcasts.
  this.running=false;this.phase='paused';this.lastPoll=this.get('lastPoll',null);this.lastError='';
  if(!this.get('seeded'))this.seed();
 }
 get(k,f=null){const r=this.db.prepare('SELECT value FROM kv WHERE key=?').get(k);return r?parse(r.value,f):f;}
 put(k,v){this.db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,json(v));}
 event(message,level='info'){this.db.prepare('INSERT INTO events(level,message,created) VALUES(?,?,?)').run(level,message,Date.now());}
 secrets(){const d=this.get('secrets');if(!d)return{};const dec=createDecipheriv('aes-256-gcm',this.key,Buffer.from(d.iv,'hex'));dec.setAuthTag(Buffer.from(d.tag,'hex'));return parse(Buffer.concat([dec.update(Buffer.from(d.body,'hex')),dec.final()]).toString());}
 saveSecrets(values){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv);const body=Buffer.concat([c.update(json(values)),c.final()]);this.put('secrets',{iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),body:body.toString('hex')});}
 config(){return {...defaults,...this.get('config')};}
 caption(text,c=this.config()){return[c.prefix,text,c.hashtags,c.signature,c.website].map(s=>(s||'').trim()).filter(Boolean).join('\n\n');}
 save(input){
  if(this.running||this.busy)throw Error('Pause the worker and wait for its current operation before saving settings.');
  const old=this.config(),c={...old};for(const k of Object.keys(defaults))if(input[k]!==undefined)c[k]=input[k];
  c.sourceUsername=String(c.sourceUsername).replace(/^@/,'').trim();if(!/^[A-Za-z0-9_]{1,15}$/.test(c.sourceUsername))throw Error('Enter a valid X username.');
  c.channels=[...new Set((Array.isArray(c.channels)?c.channels:String(c.channels).split(/[\n,]/)).map(s=>s.trim().toLowerCase()).filter(Boolean))];
  if(!c.channels.length||c.channels.length>20||c.channels.some(s=>!/^@[\w]{5,}$/.test(s)))throw Error('Add 1–20 public Telegram @channel usernames.');
  if(!['demo','live'].includes(c.mode)||!['auto','approval'].includes(c.posting))throw Error('Choose a valid connection and publishing mode.');
  c.pollSeconds=Number(c.pollSeconds);if(!Number.isInteger(c.pollSeconds)||c.pollSeconds<30||c.pollSeconds>3600)throw Error('Check interval must be 30–3600 seconds.');
  if(!Array.isArray(c.formats)||!c.formats.length||c.formats.some(f=>!defaults.formats.includes(f)))throw Error('Choose at least one supported post format.');
  for(const k of ['prefix','hashtags','signature','website']){c[k]=String(c[k]||'').trim();if(c[k].length>4000)throw Error('Caption rule fields must be under 4000 characters.');}
  if(c.website&&!/^https?:\/\/\S+$/.test(c.website))throw Error('Website link must start with https:// or http://.');c.newOnly=!!c.newOnly;
  const secret=this.secrets();if(input.xToken?.trim())secret.xToken=input.xToken.trim();if(input.botToken?.trim()){if(!/^\d+:[\w-]+$/.test(input.botToken.trim()))throw Error('Invalid BotFather token format.');secret.botToken=input.botToken.trim();}
  this.saveSecrets(secret);this.put('config',c);this.put('checks',{});this.nextPoll=0;this.event('Publishing settings saved. Existing queued posts keep their original destinations.');return this.state();
 }
 seed(){
  const c=this.config(),now=Date.now();
  const samples=[['sample-1','A quieter workflow. A clearer feed.','Demo post · image','photo'],['sample-2','Your next update, everywhere it belongs.','Demo post · text','text'],['sample-3','One update. Every channel.','Demo post · video','video'],['sample-4','Built to keep publishing, even when the dashboard is closed.','Demo post · image','photo'],['sample-5','Your captions. Your channels. Your rules.','Demo post · text','text']];
  for(let i=0;i<samples.length;i++){
   const[id,text,title,type]=samples[i],media=type==='text'?[]:[{type,url:type==='photo'?'/demo/bitcoin-card.svg':'',poster:'/demo/video-card.svg'}];
   this.ingest({source_id:id,text,title,media,created:now-(i+1)*3600000},{mode:'demo',approved:i>=2,seed:true});
   if(i>=2){const p=this.db.prepare('SELECT id FROM posts WHERE source_id=? AND mode=?').get(id,'demo');this.db.prepare("UPDATE deliveries SET status='demo_sent',updated=? WHERE post_id=?").run(now-i*3600000,p.id);}
  }
  this.put('seeded',true);this.event('Workspace ready in demo mode. Sample posts do not publish externally.');
 }
 ingest(p,{mode=this.config().mode,approved=this.config().posting==='auto',seed=false}={}){
  const c=this.config(),types=p.media?.length?p.media.map(m=>m.type):['text'];
  if(types.some(type=>!c.formats.includes(type)))return null;
  const id=randomUUID(),caption=this.caption(p.text),now=Date.now();
  const r=this.db.prepare('INSERT OR IGNORE INTO posts(id,source_id,mode,username,text,caption,media,created,detected,approved,title) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,p.source_id,mode,c.sourceUsername,p.text,caption,json(p.media||[]),p.created||now,now,approved?1:0,p.title||'');
  if(!r.changes)return null;
  for(const channel of c.channels)this.db.prepare('INSERT INTO deliveries(id,post_id,channel,mode,status,caption,fingerprint,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,channel,mode,'waiting',caption,hash(caption),now,now);
  if(!seed)this.event(`${mode==='demo'?'Demo':'X'} post detected and ${approved?'queued':'held for review'}.`);return id;
 }
 posts(){return this.db.prepare('SELECT * FROM posts ORDER BY detected DESC LIMIT 80').all().map(p=>({...p,media:parse(p.media,[]),deliveries:this.db.prepare('SELECT * FROM deliveries WHERE post_id=?').all()}));}
 state(){
  const c=this.config(),sec=this.secrets(),rows=this.db.prepare('SELECT status,COUNT(*) AS n FROM deliveries WHERE mode=? GROUP BY status').all(c.mode),counts=Object.fromEntries(rows.map(r=>[r.status,Number(r.n)]));
  const posts=this.posts(),history=this.db.prepare('SELECT d.*,p.text,p.title,p.source_id,p.username FROM deliveries d JOIN posts p ON p.id=d.post_id ORDER BY d.updated DESC LIMIT 150').all();
  const days=Array.from({length:7},(_,i)=>{const date=new Date(Date.now()-(6-i)*86400000),start=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime();const n=this.db.prepare("SELECT COUNT(*) AS n FROM deliveries WHERE mode=? AND status IN ('sent','demo_sent') AND updated>=? AND updated<?").get(c.mode,start,start+86400000).n;return{label:date.toLocaleDateString('en-US',{weekday:'short'}),count:Number(n)};});
  return{config:c,secrets:{hasXToken:!!sec.xToken,hasBotToken:!!sec.botToken},checks:this.get('checks',{}),running:this.running,phase:this.phase,busy:this.busy,lastPoll:this.lastPoll,nextPoll:this.nextPoll,lastError:this.lastError,uptime:Date.now()-this.started,counts,postCount:this.db.prepare('SELECT COUNT(*) AS n FROM posts WHERE mode=?').get(c.mode).n,posts,history,events:this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 40').all(),days};
 }
 start(){const c=this.config(),s=this.secrets();if(c.mode==='live'&&(!s.xToken||!s.botToken))throw Error('Add your X bearer token and Telegram bot token in Connections before starting live automation.');this.running=true;this.nextPoll=0;this.phase='waiting';this.event(c.mode==='demo'?'Demo worker started. No external posts will be sent.':'Live worker started. New X posts will publish to your configured Telegram channels.');}
 pause(){this.running=false;this.phase=this.busy?'finishing current operation':'paused';this.event('Worker paused. An already accepted Telegram request cannot be recalled.');}
 async x(pathname,query={}){const token=this.secrets().xToken;if(!token)throw Error('Add an X bearer token in Connections.');const url=new URL('https://api.x.com'+pathname);for(const[k,v]of Object.entries(query))url.searchParams.set(k,String(v));let r;try{r=await this.network(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});}catch{throw Error('Cannot reach X. Check network access and the bearer token.');}let body;try{body=await r.json();}catch{throw Error('X returned an unreadable response.');}if(!r.ok)throw Error(`X request failed (${r.status}). ${body.detail||body.title||'Check API access, credits and rate limits.'}`);return body;}
 async lookup(){const c=this.config(),k='xUser:'+c.sourceUsername.toLowerCase();let cached=this.get(k);if(!cached){const r=await this.x('/2/users/by/username/'+encodeURIComponent(c.sourceUsername));if(!r.data?.id)throw Error('X account could not be resolved.');cached=r.data;this.put(k,cached);}return cached;}
 async telegram(method,data){const token=this.secrets().botToken;if(!token)throw Error('Add your Telegram bot token first.');let r,b;try{r=await this.network(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:json(data),signal:AbortSignal.timeout(25000)});b=await r.json();}catch{const e=Error('Telegram connection interrupted. Check the channel before retrying.');e.uncertain=true;throw e;}if(!b.ok)throw Error(b.description||'Telegram rejected the request.');return b.result;}
 async check(which){const c=this.config(),checks=this.get('checks',{});try{if(which==='x'){const u=await this.lookup();checks.x={ok:true,label:'@'+u.username,at:Date.now()};}else{const bot=await this.telegram('getMe',{});for(const channel of c.channels){const m=await this.telegram('getChatMember',{chat_id:channel,user_id:bot.id});if(m.status!=='creator'&&(m.status!=='administrator'||!m.can_post_messages))throw Error(`Give the bot Post Messages permission in ${channel}.`);}checks.telegram={ok:true,label:'@'+bot.username,at:Date.now()};}this.put('checks',checks);this.event(`${which==='x'?'X':'Telegram'} connection verified. No test post sent.`);return checks;}catch(e){checks[which==='x'?'x':'telegram']={ok:false,label:e.message,at:Date.now()};this.put('checks',checks);throw e;}}
 demoSample(){const n=(this.get('demoSequence',0))+1;this.put('demoSequence',n);return{source_id:'demo-run-'+n,text:['Your next story is ready to travel.','The feed moves. Your workflow keeps up.','One update, thoughtfully delivered.'][n%3]+`\n\nDemo update ${n}. No live market claim.`,title:'Demo update '+n,media:n%2?[{type:'photo',url:'/demo/bitcoin-card.svg'}]:[],created:Date.now()};}
 async poll({preview=false}={}){
  const c=this.config();if(c.mode==='demo'){const id=this.ingest(this.demoSample(),{approved:!preview&&c.posting==='auto'});this.lastPoll=Date.now();this.put('lastPoll',this.lastPoll);return id;}
  const user=await this.lookup(),baselineKey='since:'+user.id,since=this.get(baselineKey),query={'post.fields':'text,created_at,attachments,entities,note_post',expansions:'attachments.media_keys','media.fields':'type,url,preview_image_url,variants',max_results:20,exclude:'retweets,replies'};
  if(since&&!preview)query.since_id=since;
  let pageToken,raw=[],media=[],newest=null;
  // Page through the returned range before committing its cursor, to avoid gaps after downtime.
  for(let page=0;page<10;page++){
   const result=await this.x(`/2/users/${user.id}/tweets`,{...query,...(pageToken?{pagination_token:pageToken}:{})});
   raw.push(...(result.data||[]));media.push(...(result.includes?.media||[]));newest=newest||result.meta?.newest_id;
   pageToken=result.meta?.next_token;if(preview||!pageToken)break;if(page===9)throw Error('Too many posts since the last scan. Cursor preserved; narrow the source or import the backlog separately.');
  }
  const byKey=new Map(media.map(m=>[m.media_key,m]));let last=null;
  if(!since&&c.newOnly&&!preview){if(newest)this.put(baselineKey,newest);this.event('X baseline saved. Only posts newer than this first scan will publish. Use Fetch latest preview to review an existing post.');}
  else for(const p of raw.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1).slice(preview?-1:0)){
   const assets=(p.attachments?.media_keys||[]).map(key=>byKey.get(key)).filter(Boolean).map(m=>{if(m.type==='photo')return{type:'photo',url:m.url,poster:m.url};const v=(m.variants||[]).filter(v=>v.content_type==='video/mp4').sort((a,b)=>(a.bit_rate||0)-(b.bit_rate||0));return{type:m.type==='animated_gif'?'animation':'video',url:(v.find(v=>(v.bit_rate||0)>=256000)||v[0])?.url||'',poster:m.preview_image_url||''};});
   let text=p.note_post?.text||p.note_tweet?.text||p.text||'';for(const u of p.entities?.urls||[])if(u.expanded_url)text=text.split(u.url).join(u.expanded_url);
   last=this.ingest({source_id:p.id,text,media:assets,created:Date.parse(p.created_at)||Date.now()},{approved:!preview&&c.posting==='auto'});
  }
  if(newest&&!preview)this.put(baselineKey,newest);this.lastPoll=Date.now();this.put('lastPoll',this.lastPoll);return last;
 }
 async guardedPoll(options){if(this.busy)throw Error('Worker is busy. Wait for the current operation.');this.busy=true;this.phase='checking X';try{const id=await this.poll(options);this.lastError='';return id;}catch(e){this.lastError=e.message;this.event(e.message,'error');throw e;}finally{this.busy=false;this.phase=this.running?'waiting':'paused';}}
 editPost(id,caption){const p=this.db.prepare('SELECT * FROM posts WHERE id=?').get(id);if(!p)throw Error('Post not found.');if(typeof caption!=='string'||caption.length>100000)throw Error('Caption must be under 100,000 characters.');const active=this.db.prepare("SELECT id FROM deliveries WHERE post_id=? AND status IN ('sending','sent','demo_sent','uncertain')").get(id);if(active)throw Error('Delivered or uncertain posts cannot be edited. Create a new source post instead.');this.db.prepare('UPDATE posts SET caption=? WHERE id=?').run(caption,id);this.db.prepare('UPDATE deliveries SET caption=?,fingerprint=? WHERE post_id=?').run(caption,hash(caption),id);this.event('Preview caption saved.');}
 approve(id){if(!this.db.prepare('SELECT id FROM posts WHERE id=?').get(id))throw Error('Post not found.');this.db.prepare('UPDATE posts SET approved=1 WHERE id=?').run(id);this.event('Selected post approved for its waiting destinations.');}
 skip(id){this.db.prepare("UPDATE deliveries SET status='skipped',error='Skipped by you',updated=? WHERE post_id=? AND status='waiting'").run(Date.now(),id);this.event('Selected waiting post skipped.');}
 retry(id,{verifiedAbsent=false}={}){const d=this.db.prepare('SELECT * FROM deliveries WHERE id=?').get(id);if(!d||!['failed','uncertain'].includes(d.status))throw Error('Only failed or uncertain deliveries can be retried.');if(d.status==='uncertain'&&!verifiedAbsent)throw Error('Check Telegram first, then confirm the post is absent before retrying.');this.db.prepare("UPDATE deliveries SET status='waiting',error='',updated=? WHERE id=?").run(Date.now(),id);this.approve(d.post_id);this.event('Retry queued only for the selected channel.');}
 async publish(d,p){
  let media=parse(p.media,[]),caption=d.caption,blobs=[],fallback='';const results=[];
  try{for(const m of media){const u=new URL(m.url);if(u.protocol!=='https:'||!['pbs.twimg.com','video.twimg.com'].includes(u.hostname))throw Error('Downloadable media unavailable.');const r=await this.network(u,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Media download failed.');const cap=(m.type==='photo'?10:50)*1024*1024;if(Number(r.headers.get('content-length')||0)>cap)throw Error('Media exceeds Telegram upload limit.');const blob=await r.blob();if(blob.size>cap)throw Error('Media exceeds Telegram upload limit.');blobs.push(blob);}}catch(e){fallback=e.message;media=[];caption+='\n\nhttps://x.com/'+p.username+'/status/'+p.source_id;}
  const record=messages=>this.db.prepare('UPDATE deliveries SET messages=?,updated=? WHERE id=?').run(json(messages.map(m=>m.message_id)),Date.now(),d.id);
  try{
   let remaining=caption;
   if(media.length){const first=split(caption,1024)[0]||'';remaining=caption.slice(first.length);const form=new FormData();form.set('chat_id',d.channel);const album=[];
    media.forEach((m,i)=>{form.set('file'+i,blobs[i],m.type==='photo'?`photo${i}.jpg`:`video${i}.mp4`);album.push({type:m.type==='photo'?'photo':'video',media:'attach://file'+i,...(i===0?{caption:first}:{})});});
    let method;if(media.length===1){method=media[0].type==='photo'?'sendPhoto':media[0].type==='animation'?'sendAnimation':'sendVideo';form.set(media[0].type==='photo'?'photo':media[0].type==='animation'?'animation':'video','attach://file0');form.set('caption',first);if(media[0].type==='video')form.set('supports_streaming','true');}else{method='sendMediaGroup';form.set('media',json(album));}
    const token=this.secrets().botToken;let b;try{const r=await this.network(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',body:form,signal:AbortSignal.timeout(25000)});b=await r.json();}catch{const e=Error('Telegram upload response lost. Check the channel before retrying.');e.uncertain=true;throw e;}if(!b.ok)throw Error(b.description||'Telegram rejected the media.');results.push(...(Array.isArray(b.result)?b.result:[b.result]));record(results);
   }
   for(const text of split(remaining,4096)){results.push(await this.telegram('sendMessage',{chat_id:d.channel,text,link_preview_options:{is_disabled:true}}));record(results);}
   if(!results[0]?.message_id){const e=Error('No Telegram message ID received. Verify the channel.');e.uncertain=true;throw e;}
   return{messages:results.map(m=>m.message_id),link:`https://t.me/${d.channel.slice(1)}/${results[0].message_id}`,fallback};
  }catch(e){if(results.length){e.uncertain=true;e.partial=results.map(m=>m.message_id);}throw e;}
 }
 async deliverOne({postId,deliveryId,manual=false}={}){
  if(this.busy)return false;const c=this.config();
  const d=this.db.prepare(`SELECT d.* FROM deliveries d JOIN posts p ON p.id=d.post_id WHERE d.status='waiting' AND p.approved=1 AND d.mode=? ${postId?'AND d.post_id=?':''} ${deliveryId?'AND d.id=?':''} ORDER BY d.created ASC LIMIT 1`).get(c.mode,...(postId?[postId]:[]),...(deliveryId?[deliveryId]:[]));if(!d)return false;
  const p=this.db.prepare('SELECT * FROM posts WHERE id=?').get(d.post_id);this.busy=true;this.phase='publishing';
  try{
   const dup=norm(d.caption)&&this.db.prepare("SELECT id,link FROM deliveries WHERE id<>? AND mode=? AND LOWER(channel)=LOWER(?) AND fingerprint=? AND status IN ('sent','demo_sent','sending','uncertain') LIMIT 1").get(d.id,d.mode,d.channel,d.fingerprint);
   if(dup){this.db.prepare("UPDATE deliveries SET status='skipped',error='Duplicate caption already delivered or awaiting verification',link=?,updated=? WHERE id=?").run(dup.link||null,Date.now(),d.id);this.event(`Duplicate caption skipped for ${d.channel}.`);return true;}
   this.db.prepare("UPDATE deliveries SET status='sending',updated=? WHERE id=?").run(Date.now(),d.id);
   if(d.mode==='demo'){await new Promise(r=>setTimeout(r,150));this.db.prepare("UPDATE deliveries SET status='demo_sent',updated=? WHERE id=?").run(Date.now(),d.id);this.event(`Demo delivery completed for ${d.channel}. Nothing sent externally.`);}
   else{const out=await this.publish(d,p);this.db.prepare("UPDATE deliveries SET status='sent',messages=?,link=?,error=?,updated=? WHERE id=?").run(json(out.messages),out.link,out.fallback?'Media fallback: '+out.fallback:'',Date.now(),d.id);this.event(`Post sent to ${d.channel}.`);}
  }catch(e){this.db.prepare('UPDATE deliveries SET status=?,error=?,updated=? WHERE id=?').run(e.uncertain?'uncertain':'failed',e.message,Date.now(),d.id);this.lastError=e.message;this.event(`${d.channel}: ${e.message}`,'error');}
  finally{this.busy=false;this.phase=this.running?'waiting':'paused';}return true;
 }
 async sendApproved(id){if(this.busy)throw Error('Worker is busy. Wait for the current operation.');this.approve(id);while(await this.deliverOne({postId:id,manual:true})){}return this.state();}
 async testTelegram(){if(this.busy)throw Error('Wait for the current operation.');const c=this.config();if(!this.secrets().botToken)throw Error('Add your Telegram bot token first.');const id=this.ingest({source_id:'test-'+Date.now(),text:'BitcoinWorld Publisher connection test.\nThis is a test message, not a market update.\n'+new Date().toISOString(),media:[],title:'Telegram connection test'},{mode:'live',approved:true});if(c.mode==='live'){while(await this.deliverOne({postId:id,manual:true})){}return;} // Test while demo mode requires explicit, isolated delivery.
  const post=this.db.prepare('SELECT * FROM posts WHERE id=?').get(id);const rows=this.db.prepare('SELECT * FROM deliveries WHERE post_id=?').all(id);this.busy=true;try{for(const d of rows){this.db.prepare("UPDATE deliveries SET status='sending' WHERE id=?").run(d.id);try{const out=await this.publish(d,post);this.db.prepare("UPDATE deliveries SET status='sent',link=?,messages=?,updated=? WHERE id=?").run(out.link,json(out.messages),Date.now(),d.id);}catch(e){this.db.prepare('UPDATE deliveries SET status=?,error=?,updated=? WHERE id=?').run(e.uncertain?'uncertain':'failed',e.message,Date.now(),d.id);throw e;}}this.event('Telegram test message delivered.','info');}finally{this.busy=false;}
 }
 async tick(){if(!this.running||this.busy)return;const c=this.config();if(Date.now()>=this.nextPoll){this.nextPoll=Date.now()+(c.mode==='demo'?45000:c.pollSeconds*1000);try{await this.guardedPoll();}catch{};}if(this.running&&!this.busy)await this.deliverOne();}
 close(){this.db.close();}
}
