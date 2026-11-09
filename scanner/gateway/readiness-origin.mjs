// Fixed, disposable origin for offline readiness checks. Never used for submitted websites.
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import { execFileSync } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
const keyPath='/tmp/readiness-key.pem', certPath='/tmp/readiness-cert.pem';
execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,
  '-subj','/CN=example.com','-days','1'],{stdio:'pipe',timeout:8000,maxBuffer:65536});
const tls={key:await readFile(keyPath),cert:await readFile(certPath)};
await unlink(keyPath);await unlink(certPath); // Test credentials never leave container memory/tmpfs.
const html=(await readFile(new URL('../fixtures/barriers.html',import.meta.url),'utf8')).replace('</body>',`<script>
for(const url of ['http://127.0.0.1:8888/private','http://10.0.0.1/private','http://unlisted.invalid/private','http://example.com:81/private'])fetch(url).catch(()=>{});
fetch('/forbidden-method',{method:'POST'}).catch(()=>{});
fetch('/subresource-redirect').catch(()=>{});
</script></body>`);
function handle(req,res){
  const path=req.url.split('?')[0];
  process.stdout.write(JSON.stringify({method:req.method,path})+'\n');
  if(path==='/redirect'){res.writeHead(302,{Location:'/barriers'});res.end();return;}
  if(path==='/blocked-redirect'||path==='/subresource-redirect'){res.writeHead(302,{Location:'http://10.0.0.1/private'});res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html'});res.end(html);
}
for(const port of [80,81])await new Promise((done,reject)=>http.createServer(handle).listen(port,'0.0.0.0',done).once('error',reject));
await new Promise((done,reject)=>https.createServer(tls,handle).listen(443,'0.0.0.0',done).once('error',reject));
const udp=dgram.createSocket('udp4');udp.on('message',(_data,peer)=>udp.send('kindpath-dns-fixture',peer.port,peer.address));
await new Promise((done,reject)=>udp.bind(53,'0.0.0.0',done).once('error',reject));
setTimeout(()=>process.exit(0),90000);
