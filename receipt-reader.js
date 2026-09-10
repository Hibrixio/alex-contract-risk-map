/* Receipt extraction runs locally; contract mapping state is never modified. */
(function(root){
 function detectTotal(text){
  const lines=String(text).split(/\r?\n/), candidates=[];
  for(let i=0;i<lines.length;i++){
   const line=lines[i];
   if(/sub\s*total|tax\s*total|total\s*(?:tax|items|savings)|cash\s*tendered|change\s*due/i.test(line))continue;
   const label=line.match(/\b(grand\s+total|total\s+(?:paid|amount|due)|amount\s+(?:paid|due)|balance\s+due|total)\b/i);
   if(!label)continue;
   let tail=line.slice(label.index+label[0].length);
   if(!/\d/.test(tail))tail=lines[i+1]||'';
   const amounts=tail.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})\b/g);
   if(!amounts?.length)continue;
   candidates.push({amount:Number(amounts[0].replaceAll(',','')).toFixed(2),evidence:line.trim(),rank:/grand|paid/i.test(label[0])?3:/amount|due/i.test(label[0])?2:1});
  }
  candidates.sort((a,b)=>b.rank-a.rank);
  if(!candidates.length)return {amount:'',evidence:''};
  const best=candidates.filter(c=>c.rank===candidates[0].rank);
  return new Set(best.map(c=>c.amount)).size===1?best[0]:{amount:'',evidence:'Multiple totals found — enter the receipt total.'};
 }
 async function read(file,progress){
  let worker;
  async function ocr(canvas){
   if(!root.Tesseract)await loadScript('/assets/vendor/tesseract/tesseract.min.js');
   worker ||= await Tesseract.createWorker('eng',1,{workerPath:'/assets/vendor/tesseract/worker.min.js'});
   const result=await worker.recognize(canvas);return result.data.text;
  }
  try{
   let text='';
   if(/\.pdf$/i.test(file.name)){
    const pdfjs=await import('./assets/vendor/pdfjs/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='./assets/vendor/pdfjs/pdf.worker.min.mjs';
    const loading=pdfjs.getDocument({data:await file.arrayBuffer()});const pdf=await loading.promise;
    try{for(let n=1;n<=pdf.numPages;n++){
     progress(`Reading receipt page ${n} of ${pdf.numPages}…`);
     const page=await pdf.getPage(n),content=await page.getTextContent();let pageText='',lastY;
     for(const item of content.items){if(lastY!==undefined&&Math.abs(item.transform[5]-lastY)>3)pageText+='\n';pageText+=item.str+' ';if(item.hasEOL)pageText+='\n';lastY=item.transform[5];}
     if(pageText.trim().length<20){const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;pageText=await ocr(canvas);canvas.width=canvas.height=0;}
     text+=pageText+'\n';page.cleanup();
    }}finally{await loading.destroy();}
   }else{
    progress('Reading receipt image…');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');const scale=Math.min(1,2600/Math.max(bitmap.width,bitmap.height));canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();text=await ocr(canvas);canvas.width=canvas.height=0;
   }
   return detectTotal(text);
  }finally{if(worker)await worker.terminate();}
 }
 root.OrbitReceipt={detectTotal,read};if(typeof module!=='undefined')module.exports={detectTotal};
})(typeof window==='undefined'?globalThis:window);
