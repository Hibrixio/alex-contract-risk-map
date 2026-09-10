const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
try{process.loadEnvFile('.env.local');}catch{}
http.createServer(async(req,res)=>{
 res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(/^\/api\/(analyze|config|ocr)$/.test(pathname)){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>4000000){res.status(413).json({error:'Request too large'});return;}}
  try{req.body=body?JSON.parse(body):{};await require('.'+pathname+'.js')(req,res);}catch{res.status(500).json({error:'Server error'});}return;
 }
 const file=path.resolve('.','.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(process.cwd()+path.sep)||pathname.includes('/.')||pathname.startsWith('/node_modules')||pathname.startsWith('/lib/')){res.statusCode=403;return res.end();}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.pdf':'application/pdf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}
}).listen(Number(process.env.PORT)||4174,'127.0.0.1',()=>console.log('Orbit ready'));
