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
document.head.insertAdjacentHTML('beforeend','<style>.capture-link{color:rgb(0,0,0)}.capture-link:hover{color:rgb(255,0,0)}</style>');
document.body.insertAdjacentHTML('beforeend','<p>Rendered capture marker</p><a class="capture-link" href="/barriers">Captured hover link</a><aside>Controlled advertisement</aside><input type="password" value="controlled-form-value-marker">');
for(const url of ['http://127.0.0.1:8888/private','http://10.0.0.1/private','http://unlisted.invalid/private','http://example.com:81/private'])fetch(url).catch(()=>{});
fetch('/forbidden-method',{method:'POST'}).catch(()=>{});
fetch('/subresource-redirect').catch(()=>{});
</script></body>`);
const contentPage=await readFile(new URL('../fixtures/content-page.html',import.meta.url),'utf8');
const retentionPage=await readFile(new URL('../fixtures/retention-page.html',import.meta.url),'utf8');
const formPage=await readFile(new URL('../fixtures/form-page.html',import.meta.url),'utf8');
const siteCss='*{box-sizing:border-box}body{font:18px Arial;color:#111;background:#fff;margin:0;padding:24px}.content-card{max-width:900px;padding:20px;border:1px solid #333}table{border-collapse:collapse}th,td{padding:8px;border:1px solid #333}.guide-link:hover{color:rgb(255,0,0)}.offscreen-panel{display:none}';
function handle(req,res){
  const path=req.url.split('?')[0];
  process.stdout.write(JSON.stringify({method:req.method,path})+'\n');
  if(path==='/site.css'){setTimeout(()=>{res.writeHead(200,{'Content-Type':'text/css'});res.end(siteCss);},150);return;}
  if(path==='/content'||path==='/forms'){res.writeHead(200,{'Content-Type':'text/html'});res.end(path==='/content'?contentPage:formPage);return;}
  if(path==='/indented-content'||path==='/indented-budget'){
    const count=path==='/indented-content'?96:300;
    const blocks=Array.from({length:count},(_,index)=>`<p>Controlled paragraph ${index}</p>`).join('\n');
    res.writeHead(200,{'Content-Type':'text/html'});res.end(retentionPage.replace('<!-- retention-blocks -->',blocks));return;
  }
  if(path==='/missing'){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Controlled missing page');return;}
  if(path==='/redirect' && req.headers.host==='example.com'){res.writeHead(302,{Location:'http://www.example.com/redirect'});res.end();return;}
  if(path==='/blocked-redirect'||path==='/subresource-redirect'){res.writeHead(302,{Location:'http://10.0.0.1/private'});res.end();return;}
  const historyTask = path === '/same-url-history' ? 'history.replaceState(null,"",location.href)' : path === '/same-url-reload' ? 'location.reload()' : undefined;
  if(historyTask){res.writeHead(200,{'Content-Type':'text/html'});res.end(html.replace('</body>', `<script>let observedAxe;Object.defineProperty(window,'axe',{configurable:true,get(){return observedAxe;},set(value){observedAxe=value;queueMicrotask(()=>{${historyTask}});}});</script></body>`));return;}
  const body = path === '/moving' ? html.replace('</body>', `<script>let observedAxe;Object.defineProperty(window,'axe',{configurable:true,get(){return observedAxe;},set(value){observedAxe=value;queueMicrotask(()=>history.replaceState(null,'','/moving?analysis=started'));}});</script></body>`) : html;
  res.writeHead(200,{'Content-Type':'text/html'});res.end(body);
}
for(const port of [80,81])await new Promise((done,reject)=>http.createServer(handle).listen(port,'0.0.0.0',done).once('error',reject));
await new Promise((done,reject)=>https.createServer(tls,handle).listen(443,'0.0.0.0',done).once('error',reject));
const udp=dgram.createSocket('udp4');udp.on('message',(_data,peer)=>udp.send('kindpath-dns-fixture',peer.port,peer.address));
await new Promise((done,reject)=>udp.bind(53,'0.0.0.0',done).once('error',reject));
setTimeout(()=>process.exit(0),90000);
