/* Receipt extraction runs locally; contract mapping state is never modified. */
(function(root){
 function detectTotal(text){
  const lines=String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean), candidates=[];
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
  let worker,ocrLines=[];
  async function ocr(canvas){
   if(!root.Tesseract)await loadScript('/assets/vendor/tesseract/tesseract.min.js');
   worker ||= await Tesseract.createWorker('eng',1,{workerPath:'/assets/vendor/tesseract/worker.min.js'});
   const result=await worker.recognize(canvas,{}, {text:true,blocks:true});ocrLines=(result.data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));return result.data.text;
  }
  async function scan(canvas){
   const initial=await ocr(canvas);
   if(detectTotal(initial).amount)return initial;
   // Locate the printed receipt using transaction text, avoiding table glare and hands.
   const anchors=ocrLines.filter(line=>/merchant|batch|sale|account|customer|receipt|total|payment|debit|credit|subtotal/i.test(line.text||'')&&line.bbox);
   let scanSource=canvas;
   if(anchors.length>=3){
    const boxes=anchors.map(l=>l.bbox),left=Math.min(...boxes.map(b=>b.x0)),right=Math.max(...boxes.map(b=>b.x1)),top=Math.min(...boxes.map(b=>b.y0)),bottom=Math.max(...boxes.map(b=>b.y1));
    const padX=(right-left)*.15,padY=(bottom-top)*.2,x=Math.max(0,left-padX),y=Math.max(0,top-padY),w=Math.min(canvas.width-x,right-left+2*padX),h=Math.min(canvas.height-y,bottom-top+2*padY);
    scanSource=document.createElement('canvas');scanSource.width=Math.ceil(w);scanSource.height=Math.ceil(h);scanSource.getContext('2d').drawImage(canvas,x,y,w,h,0,0,w,h);
   }
   // Camera tilt breaks OCR lines: try deskewed views before dividing the photo.
   const rotatedResults=[];
   for(const degrees of [12,-12,24,-24]){
    progress(`Deep scan — straightening receipt (${degrees}°)…`);
    const angle=degrees*Math.PI/180,scale=Math.min(2,3000/Math.max(scanSource.width,scanSource.height));
    const rotated=document.createElement('canvas');
    rotated.width=Math.ceil((Math.abs(scanSource.width*Math.cos(angle))+Math.abs(scanSource.height*Math.sin(angle)))*scale);
    rotated.height=Math.ceil((Math.abs(scanSource.height*Math.cos(angle))+Math.abs(scanSource.width*Math.sin(angle)))*scale);
    const ctx=rotated.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,rotated.width,rotated.height);
    ctx.translate(rotated.width/2,rotated.height/2);ctx.rotate(angle);ctx.scale(scale,scale);ctx.drawImage(scanSource,-scanSource.width/2,-scanSource.height/2);
    try{await worker.setParameters({tessedit_pageseg_mode:'11'});const result=await ocr(rotated);if(detectTotal(result).amount)rotatedResults.push(result);}
    finally{rotated.width=rotated.height=0;}
   }
   await worker.setParameters({tessedit_pageseg_mode:'3'});
   if(scanSource!==canvas)scanSource.width=scanSource.height=0;
   if(rotatedResults.length){
    const totals=rotatedResults.map(detectTotal);
    return new Set(totals.map(t=>t.amount)).size===1?rotatedResults[0]:totals.map(t=>'Grand Total '+t.amount).join('\n');
   }
   // Overlapping regions enlarge small print without requiring an enormous full-image canvas.
   const attempts=[];
   for(let pass=0;pass<5;pass++){
    progress(`Deep scan ${pass+1} of 5 — enlarging small receipt text…`);
    const whole=pass===0,w=whole?canvas.width:canvas.width*.68,h=whole?canvas.height:canvas.height*.68;
    const x=whole?0:((pass-1)%2)*canvas.width*.32,y=whole?0:Math.floor((pass-1)/2)*canvas.height*.32;
    const zoom=Math.min(3,3600/Math.max(w,h)),enhanced=document.createElement('canvas');
    enhanced.width=Math.round(w*zoom);enhanced.height=Math.round(h*zoom);
    const ctx=enhanced.getContext('2d');ctx.drawImage(canvas,x,y,w,h,0,0,enhanced.width,enhanced.height);
    const pixels=ctx.getImageData(0,0,enhanced.width,enhanced.height),data=pixels.data;
    for(let i=0;i<data.length;i+=4){const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2];const value=Math.max(0,Math.min(255,(gray-128)*1.55+145));data[i]=data[i+1]=data[i+2]=value;}
    ctx.putImageData(pixels,0,0);
    try{await worker.setParameters({tessedit_pageseg_mode:'11'});attempts.push(await ocr(enhanced));}
    finally{enhanced.width=enhanced.height=0;}
   }
   await worker.setParameters({tessedit_pageseg_mode:'3'});
   // Keep disagreement visible instead of choosing whichever scan ran last.
   const totals=attempts.map(detectTotal).filter(result=>result.amount);
   if(new Set(totals.map(result=>result.amount)).size>1)return totals.map(result=>'Grand Total '+result.amount).join('\n');
   return totals.length?attempts.find(text=>detectTotal(text).amount===totals[0].amount):initial;
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
     if(pageText.trim().length<20){const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;pageText=await scan(canvas);canvas.width=canvas.height=0;}
     text+=pageText+'\n';page.cleanup();
    }}finally{await loading.destroy();}
   }else{
    progress('Reading receipt image…');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');const scale=Math.min(1,4096/Math.max(bitmap.width,bitmap.height));canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();text=await scan(canvas);canvas.width=canvas.height=0;
   }
   return detectTotal(text);
  }finally{if(worker)await worker.terminate();}
 }
 root.OrbitReceipt={detectTotal,read};if(typeof module!=='undefined')module.exports={detectTotal};
})(typeof window==='undefined'?globalThis:window);
