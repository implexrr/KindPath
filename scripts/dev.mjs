import { spawn } from 'node:child_process';

const children=new Set();
const groups=process.platform!=='win32';
let stopping=false;
function launch(args){
  const child=spawn(process.execPath,args,{stdio:'inherit',detached:groups});
  children.add(child);child.once('exit',()=>children.delete(child));
  return child;
}
function stop(code=0){
  if(stopping)return;
  stopping=true;process.exitCode=code;
  for(const child of children){
    try{if(groups&&child.pid)process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM');}catch{/* Already stopped. */}
  }
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log('Preparing isolated scanner images. Docker Desktop must be running.');
const setup=launch(['scripts/build-scanner.mjs','--runtime']);
const setupCode=await new Promise(resolve=>{setup.once('error',()=>resolve(1));setup.once('exit',code=>resolve(code??1));});
if(!stopping&&setupCode!==0){console.error('Scanner setup failed. Start Docker Desktop and retry npm run dev.');stop(1);}
if(!stopping){
  for(const args of [['node_modules/tsx/dist/cli.mjs','watch','server/index.ts'],['node_modules/vite/bin/vite.js','--host','127.0.0.1']]){
    const child=launch(args);child.once('error',()=>stop(1));child.once('exit',code=>{if(!stopping)stop(code??1);});
  }
}
