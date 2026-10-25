const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/live.js':'live.js','/lines.js':'lines.js','/line-search.js':'line-search.js','/assets/train-line2-short.png':'assets/train-line2-short.png'};
http.createServer((req,res)=>{
  const file=files[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
  fs.createReadStream(path.join(__dirname,file)).pipe(res);
}).listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));


