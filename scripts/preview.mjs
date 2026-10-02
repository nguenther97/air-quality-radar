import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    const target=path.resolve(root,file);
    if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(target);
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.setHeader('Cache-Control','no-store');res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Radar preview: http://127.0.0.1:4173'));
