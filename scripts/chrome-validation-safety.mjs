import assert from "node:assert/strict";
import {lstat,mkdir,mkdtemp} from 'node:fs/promises';
import {join,posix,resolve} from 'node:path';

const base='http://127.0.0.1:5173';
export function allowsUiRequest(value,method){
  let url,path;
  try{url=new URL(value);path=posix.normalize(decodeURIComponent(url.pathname));}catch{return false;}
  if(url.username||url.password||url.origin!==base||path.includes('%')||/[\\\x00-\x1f\x7f]/.test(path))return false;
  if(method==='POST')return path==='/api/scan-public';
  if(method!=='GET')return false;
  // Never expose Vite's filesystem route, private docs, logs or profiles.
  return ['/','/favicon.ico','/@react-refresh','/api/scanning-capabilities'].includes(path)
    || ['/src/','/shared/','/scanner/gateway/','/node_modules/','/@vite/','/@id/'].some(prefix=>path.startsWith(prefix));
}

export async function createValidationDirectory(project){
  let directory=resolve(project);
  for(const segment of ['logs','chrome-validation']){
    directory=join(directory,segment);
    try{await mkdir(directory);}catch(error){if(error.code!=='EEXIST')throw error;}
    const info=await lstat(directory);
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Validation output must use project-local directories, not symbolic links.');
  }
  return mkdtemp(join(directory,'run-'));
}

export async function readValidationBody(response,maximum=8*1024*1024){
  const chunks=[];let size=0;
  for await(const chunk of response.body??[]){
    size+=chunk.length;
    if(size>maximum)throw new Error('Loopback response exceeds the validation limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks,size);
}

export function assertColourPixel(original,expected,actual){
  expected.forEach((value,index)=>assert.ok(Math.abs(value-actual[index])<=8,'Colour pixel does not match the selected matrix.'));
  assert.ok(actual.some((value,index)=>Math.abs(value-original[index])>=4),'Colour filter must change the modified frame pixels');
}
