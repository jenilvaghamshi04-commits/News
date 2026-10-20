import {spawn} from 'node:child_process';
const api=spawn(process.execPath,['server/api.mjs'],{stdio:'inherit',env:process.env});
const extra=process.argv.slice(2),portIndex=extra.indexOf('--port'),port=portIndex>=0?extra[portIndex+1]:process.env.PORT||'4173';
const ui=spawn(process.execPath,['scripts/run-framework.mjs','dev','--port',port,'--host','0.0.0.0'],{stdio:'inherit',env:process.env});
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;api.kill('SIGTERM');ui.kill('SIGTERM');};
process.on('SIGTERM',stop);process.on('SIGINT',stop);api.on('exit',()=>{stop();process.exit(0);});ui.on('exit',code=>{stop();process.exit(code||0);});
