// Public-shaped destinations are bound only to disposable internal test origins.
import http from 'node:http';
const page=`<!doctype html><html lang="en"><title>Public website fixture</title><h1>Public website fixture</h1>
<link rel="stylesheet" href="http://static.example.net/style.css">
<link rel="stylesheet" href="http://rebind.example.net/theme.css">
<style>a:hover{color:rgb(255,0,0)}</style>
<script src="http://static.example.net/render.js"></script>
<img src="http://rebind.example.net/pixel.svg" alt="Controlled icon">
<img src="http://blocked.example.org/private" alt="Blocked resource">
<label>Contact<input type="text" value="synthetic-form-value"></label><button>Contact</button>
<a href="https://www.wikipedia.org/">Inactive source link</a><aside>Static website advertisement</aside></html>`;
http.createServer((req,res)=>{
 const path=new URL(req.url,'http://example.com').pathname;
 process.stdout.write(JSON.stringify({host:req.headers.host,path,method:req.method})+'\n');
 if(path==='/redirect' && req.headers.host==='example.com'){res.writeHead(302,{Location:'http://www.example.com/redirect'});res.end();return;}
 if(path==='/private-redirect'){res.writeHead(302,{Location:'http://blocked.example.org/private'});res.end();return;}
 const redirect = location => {res.writeHead(302,{Location:location});res.end();};
 if(path==='/path-redirect'){redirect('/canonical-result');return;}
 if(path==='/empty-query-redirect'){redirect('/canonical-result?');return;}
 if(path==='/invalid-redirect'){redirect('http://127.0.0.1/private');return;}
 if(path==='/query-redirect'){redirect('/canonical-result?changed=1');return;}
 if(path==='/other-host'){redirect('http://example.org/other-host');return;}
 if(path==='/loop'){redirect('http://'+(req.headers.host==='example.com'?'www.example.com':'example.com')+'/loop');return;}
 if(path==='/intermediate-redirect'){redirect('http://'+(req.headers.host==='example.com'?'www.example.com':'example.org')+'/intermediate-redirect');return;}
 if(path==='/www-private'){redirect('http://www.example.com/www-private');return;}
 if(path==='/script-redirect'||path==='/meta-redirect'){
  res.writeHead(200,{'Content-Type':'text/html'});
  res.end(path==='/script-redirect'?'<script>location.replace("/canonical-result")</script>':'<meta http-equiv="refresh" content="0;url=/canonical-result">');return;
 }
 if(path==='/canonical-result'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="en"><title>Canonical page</title><h1>Canonical destination marker</h1><p>Single final page.</p></html>');return;}
 if(path.endsWith('.css')){res.writeHead(200,{'Content-Type':'text/css'});res.end('p{color:rgb(0,128,0)}');return;}
 if(path==='/render.js'){res.writeHead(200,{'Content-Type':'application/javascript'});res.end("document.body.insertAdjacentHTML('beforeend','<p>Multi-host rendered marker</p>');fetch('http://late.example.net/pending').catch(()=>{})");return;}
 if(path==='/pixel.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end(page);
}).listen(80,'0.0.0.0');
setTimeout(()=>process.exit(0),80000);
