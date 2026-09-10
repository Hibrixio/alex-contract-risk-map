const authorize=require('../lib/auth');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});if(!await authorize(req,res))return;
 try{
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body;const url=new URL(body.url);
 if(url.protocol!=='https:'||url.hostname!=='docs.google.com')throw Error('Use a Google Sheets URL.');
 const id=url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1];if(!id||id==='e')throw Error('Use the spreadsheet sharing URL, or upload an exported XLSX file.');
 const r=await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,{signal:AbortSignal.timeout(20000)});
 if(!r.ok||!(r.headers.get('content-type') || '').includes('spreadsheet'))throw Error('This sheet requires Google access. Export it as XLSX in Google Sheets, then upload that file here.');
 const reader=r.body.getReader();let chunks=[],size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10000000){await reader.cancel();throw Error('Sheet exceeds the 10 MB import limit.');}chunks.push(Buffer.from(value));}
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.status(200).end(Buffer.concat(chunks));
 }catch(e){res.status(400).json({error:e.message});}
};
