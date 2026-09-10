/* Orbit workspace: a single upload flow, source-backed highlights and task actions. */
const $ = id => document.getElementById(id);
let busy = false, config = {}, currentUser = null, documentKey = '', taskItems = [], taskSelected = '', taskFilter = 'all', taskQuery = '', taskMap = false;
const loadScript = src => new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error('Could not load a required service. Check your connection and try again.')); document.head.append(script); });
window.orbitAuthHeaders = async () => {
  const token = await window.Clerk?.session?.getToken();
  if (!token) throw new Error('Please sign in to map a document.');
  return { Authorization: `Bearer ${token}` };
};
function showPage(page) {
  document.body.dataset.page = page;
  $('tasksPage').hidden = page !== 'tasks'; $('settingsPage').hidden = page !== 'settings';
  $('greeting').hidden = page !== 'mapping'; app.hidden = page !== 'mapping' || !nodes.length;
  document.querySelectorAll('.workspace-nav button').forEach(b => b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'));
  if (page === 'tasks') renderTasks();
}
async function initAuth() {
  $('retryAuth').hidden = true;
  try {
    if (location.protocol === 'file:') throw new Error('Open https://orbit-contract-mind-map.vercel.app to sign in and upload. This downloaded HTML cannot run the secure services.');
    const res = await fetch('/api/config'); if (!res.ok) throw new Error('Unable to load workspace configuration.');
    config = await res.json();
    $('serviceStatus').textContent = `Analysis: ${config.analysis ? 'connected' : 'not configured'}. OCR: ${config.googleOcr ? 'Google Vision' : 'on-device, no API credits'}.`;
    if (!config.clerkPublishableKey) throw new Error('Google sign-in needs the existing Clerk configuration connected to this site.');
    if (!window.Clerk) {
      const domain = atob(config.clerkPublishableKey.split('_').slice(2).join('_')).replace(/\$$/, '');
      if (!/^[a-zA-Z0-9.-]+$/.test(domain)) throw new Error('Invalid sign-in configuration.');
      const script = document.createElement('script');
      script.src = `https://${domain}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
      script.dataset.clerkPublishableKey = config.clerkPublishableKey;
      script.crossOrigin = 'anonymous';
      await new Promise((resolve,reject)=>{ script.onload=resolve; script.onerror=()=>reject(new Error('Sign-in could not load. Check the Clerk domain configuration.')); document.head.append(script); });
    }
    await window.Clerk.load();
    const sync = () => {
      const previousId=currentUser?.id;
      currentUser = window.Clerk.user;
      if(previousId && previousId!==currentUser?.id){releaseDocument();uploadedDocument={name:'',text:'',fileType:'text',fileUrl:'',pdfData:null,pdfPages:[]};nodes=[];sources={};taskItems=[];documentKey='';documentDialog.close();render();syncWorkspace();}
      if(previousId && previousId!==currentUser?.id)window.dispatchEvent(new Event('orbit-user-change'));
      $('signInScreen').hidden = Boolean(currentUser);
      document.body.classList.toggle('signed-out', !currentUser);
      if (currentUser) {
        if(previousId!==currentUser.id){loadTasks();renderRecents();}
        $('greetingTitle').textContent = `Hi, ${currentUser.firstName || currentUser.username || 'there'}. What do you need to map today?`;
        window.Clerk.mountUserButton($('userButton'));
      } else {
        window.Clerk.mountSignIn($('clerkSignIn'), { routing: 'hash', forceRedirectUrl: location.origin, signUpForceRedirectUrl: location.origin, appearance: { variables: { colorPrimary: '#526c49', borderRadius: '12px' }, elements: { header: {display:'none'}, form: {display:'none'}, dividerRow: {display:'none'}, footerAction: {display:'none'}, socialButtonsBlockButton__apple: {display:'none'} } } });
      }
    };
    sync(); window.Clerk.addListener(sync);
  } catch(error) { $('signInScreen').hidden = false; document.body.classList.add('signed-out'); $('authMessage').textContent=error.message; $('retryAuth').hidden=false; }
  finally { $('bootScreen').hidden = true; }
}
$('retryAuth').onclick = initAuth;
$('navToggle').onclick = () => document.body.classList.toggle('nav-collapsed');
document.querySelectorAll('.workspace-nav button').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('topUpload').onclick = () => documentUpload.click();
$('topSource').onclick = () => openDocumentAt();
$('reanalyze').onclick = () => processDocumentText(uploadedDocument.text, uploadedDocument.name);
$('pasteToggle').onclick = () => { $('pasteArea').hidden = !$('pasteArea').hidden; if (!$('pasteArea').hidden) documentPaste.focus(); };
$('pasteArea').append(documentPaste, $('analyzePaste'));
$('analyzePaste').replaceWith($('analyzePaste').cloneNode(true));
$('analyzePaste').onclick = async () => {
  if (busy) return;
  const text = documentPaste.value.trim();
  if (!text) return setUploadMessage('Paste some document text first.', 'error');
  releaseDocument(); uploadedDocument = {name:'Pasted document',text,fileType:'text',fileUrl:'',pdfData:null,pdfPages:[]};
  await processDocumentText(text, 'Pasted document');
};
function releaseDocument() { if (uploadedDocument.fileUrl) URL.revokeObjectURL(uploadedDocument.fileUrl); }
const originalMessage = setUploadMessage;
setUploadMessage = function(message, type='muted') { originalMessage(message,type); $('workflowStatus').textContent=message; $('workflowStatus').dataset.type=type; };
function lockUpload(value) {
  busy=value; $('topUpload').disabled=value; $('reanalyze').disabled=value; $('analyzePaste').disabled=value; $('clearWorkspace').disabled=value;
  documentUpload.disabled=value; $('topUpload').textContent=value ? 'Mapping…' : '↑ Upload document';
}
function syncWorkspace() {
  $('activeDocument').textContent=uploadedDocument.name || 'Your mapping workspace';
  $('core').querySelector('span').textContent=uploadedDocument.name || 'Your document';
  $('topSource').disabled=!uploadedDocument.text; $('reanalyze').hidden=!uploadedDocument.text;
  document.body.classList.toggle('has-document',Boolean(nodes.length));
  app.hidden=document.body.dataset.page!=='mapping' || !nodes.length;
  // The former sample downloads are never offered for an uploaded document.
  document.querySelectorAll('.topbar-actions a').forEach(a=>a.hidden=true);
}
assignSourcePages = function() {
  for (const node of nodes) {
    const matches = OrbitSource.locate(node.clauses || [], uploadedDocument.pdfPages || []);
    sources[node.id] = {quote:node.clauses[0] || '', matches, page:matches[0]?.page || null, pageNumber:matches[0]?.page || null, rects:matches[0]?.rects || []};
  }
};
async function identifyDocument(text) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  documentKey = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
processDocumentText = async function(text,name) {
  if (busy) return false;
  const analysisOwner=currentUser?.id;
  lockUpload(true); uploadedDocument.name=name; uploadedDocument.text=String(text || '').trim();
  beginNewDocumentAnalysis(name); syncWorkspace(); $('analysisNotice').hidden=true;
  try {
    if (uploadedDocument.text.length<20) throw new Error('No readable text was found. Try a clearer scan or paste the text.');
    if (uploadedDocument.text.length>120000) throw new Error('This document exceeds 120,000 characters. Split it into smaller documents; nothing has been silently skipped.');
    await identifyDocument(uploadedDocument.text);
    setUploadMessage(`Mapping ${name}. Reading your requested topics…`,'busy');
    const result=await analyzeWithOpenRouter(uploadedDocument.text,name);
    if(currentUser?.id!==analysisOwner)return false;
    if(!result.length)throw new Error("Analysis returned no clauses. Please retry; an empty result will not replace your saved mapping.");
    setNodesFromAnalysis(result,name,'Orbit'); state.dossierHidden=true; renderView();
    try{recommendationStatus=JSON.parse(localStorage.getItem(mapStorageKey()+'-decisions') || '{}');acceptedRecommendations=JSON.parse(localStorage.getItem(mapStorageKey()+'-accepted') || '{}');nodeOffsets=JSON.parse(localStorage.getItem(mapStorageKey()+'-positions') || '{}');}catch{recommendationStatus={};acceptedRecommendations={};nodeOffsets={};}
    render();
    const missing=window.lastAnalysisResult?.unmatchedRequests || [];
    $('analysisNotice').hidden=false;
    $('analysisNotice').textContent = (missing.length ? `Not found in the source: ${missing.join('; ')}. ` : '') + `${nodes.length} source-backed items mapped. Review the highlighted evidence before acting.`;
    showPage('mapping');
    await saveRecentMapping();
    if ($('autoSource').checked && nodes.length) openDocumentAt();
    setUploadMessage(nodes.length ? `Ready — ${nodes.length} items. Open the highlighted document or select a map card.` : 'No matching clauses found. Adjust your request and map again.','success');
    return true;
  } catch(error) { setUploadMessage(error.message,'error'); return false; }
  finally { lockUpload(false); syncWorkspace(); }
};
let ocrWorker;
async function recognizeCanvas(canvas, pageNumber) {
  if (config.googleOcr) {
    const res=await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json',...await orbitAuthHeaders()},body:JSON.stringify({image:canvas.toDataURL('image/jpeg',.88).split(',')[1]})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error);
    return {pageNumber,text:data.text,items:data.words.map(w=>{const xs=w.vertices.map(v=>v.x || 0),ys=w.vertices.map(v=>v.y || 0);return {text:w.text,rect:[100*Math.min(...xs)/canvas.width,100*Math.min(...ys)/canvas.height,100*(Math.max(...xs)-Math.min(...xs))/canvas.width,100*(Math.max(...ys)-Math.min(...ys))/canvas.height]};})};
  }
  if (!window.Tesseract) await loadScript('/assets/vendor/tesseract/tesseract.min.js');
  if (!ocrWorker) ocrWorker = await Tesseract.createWorker('eng',1,{workerPath:'/assets/vendor/tesseract/worker.min.js',logger:m=>{if(m.status==='recognizing text') setUploadMessage(`Reading scanned page ${pageNumber}: ${Math.round(m.progress*100)}%`,'busy');}});
  const {data}=await ocrWorker.recognize(canvas,{}, {blocks:true,text:true});
  const words=(data.blocks || []).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words)));
  return {pageNumber,text:data.text,items:words.map(w=>({text:w.text,rect:[w.bbox.x0/canvas.width*100,w.bbox.y0/canvas.height*100,(w.bbox.x1-w.bbox.x0)/canvas.width*100,(w.bbox.y1-w.bbox.y0)/canvas.height*100]}))};
}
extractPdfDocumentText = async function(buffer) {
  const pdfjs=window.pdfjsLib || await import('./assets/vendor/pdfjs/pdf.min.mjs'); window.pdfjsLib=pdfjs;
  pdfjs.GlobalWorkerOptions.workerSrc='./assets/vendor/pdfjs/pdf.worker.min.mjs';
  const loading=pdfjs.getDocument({data:buffer.slice(0)}),pdf=await loading.promise;
  const pages=[];
  try {
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++) {
      setUploadMessage(`Reading page ${pageNumber} of ${pdf.numPages}…`,'busy');
      const page=await pdf.getPage(pageNumber), viewport=page.getViewport({scale:1}), content=await page.getTextContent();
      const items=content.items.filter(i=>i.str).map(i=>{
        const tx=pdfjs.Util.transform(viewport.transform,i.transform),height=Math.hypot(tx[2],tx[3]);
        const style=content.styles[i.fontName] || {}, ascent=style.ascent ?? (style.descent ? 1+style.descent : .8);
        return {text:i.str,rect:[100*tx[4]/viewport.width,100*(tx[5]-height*ascent)/viewport.height,100*i.width/viewport.width,100*height/viewport.height]};
      });
      if(items.map(i=>i.text).join('').trim().length<20) {
        const scan=page.getViewport({scale:2}), canvas=document.createElement('canvas');canvas.width=scan.width;canvas.height=scan.height;
        await page.render({canvasContext:canvas.getContext('2d'),viewport:scan}).promise;
        pages.push(await recognizeCanvas(canvas,pageNumber));canvas.width=0;canvas.height=0;
      } else pages.push({pageNumber,text:items.map(i=>i.text).join(' '),items});
      page.cleanup();
    }
  } finally {await loading.destroy(); if(ocrWorker){await ocrWorker.terminate();ocrWorker=null;}}
  uploadedDocument.pdfPages=pages;return pages.map(p=>p.text).join('\n\n');
};
readUploadedFile = async function(file) {
  if(busy) return;
  const uploadOwner=currentUser?.id;
  if(file.size>25*1024*1024) return setUploadMessage('Choose a file smaller than 25 MB.','error');
  const ext=file.name.split('.').pop().toLowerCase();
  if(!['pdf','docx','txt','md','csv','png','jpg','jpeg','webp'].includes(ext)) return setUploadMessage('Use PDF, DOCX, text, PNG, or JPEG. Save older Word files as DOCX first.','error');
  lockUpload(true); releaseDocument();
  uploadedDocument={name:file.name,text:'',fileUrl:URL.createObjectURL(file),fileType:ext==='pdf'?'pdf':['png','jpg','jpeg','webp'].includes(ext)?'image':'text',pdfData:null,pdfPages:[]};
  beginNewDocumentAnalysis(file.name);syncWorkspace();
  try {
    let text;
    if(ext==='pdf'){const bytes=await file.arrayBuffer();uploadedDocument.pdfData=bytes.slice(0);text=await extractPdfDocumentText(bytes);}
    else if(ext==='docx') text=await extractDocxText(await file.arrayBuffer());
    else if(uploadedDocument.fileType==='image') {
      const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');
      const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const page=await recognizeCanvas(canvas,1);uploadedDocument.pdfPages=[page];text=page.text;
    } else text=await file.text();
    if(currentUser?.id!==uploadOwner)return;
    lockUpload(false);await processDocumentText(text,file.name);
  } catch(error){setUploadMessage(`Could not read ${file.name}: ${error.message}`,'error');}
  finally{lockUpload(false);documentUpload.value='';if(ocrWorker){await ocrWorker.terminate();ocrWorker=null;}syncWorkspace();}
};
renderUploadedTextDocument = function(selectedId=state.selected) {
  const text=uploadedDocument.text || '',node=nodes.find(n=>n.id===selectedId),ranges=OrbitSource.textRanges(text,node?.clauses || []);
  let cursor=0,html='';for(const [start,end] of ranges){if(start<cursor)continue;html+=escapeHtml(text.slice(cursor,start))+`<mark class="uploaded-text-highlight">${escapeHtml(text.slice(start,end))}</mark>`;cursor=end;}
  html+=escapeHtml(text.slice(cursor));
  documentPages.innerHTML=`<article class="uploaded-source-page" id="uploaded-source-text"><h3>${escapeHtml(uploadedDocument.name)}</h3><p class="uploaded-source-note">Extracted source text · yellow marks show the selected item's exact evidence.</p><pre>${html}</pre></article>`;
};
let sourceRender=0;
function addHighlights(container,pageNumber,selectedId){
  nodes.forEach(node=>(sources[node.id]?.matches || []).filter(m=>m.page===pageNumber).forEach(match=>match.rects.forEach(rect=>{
    const b=document.createElement('button');b.className='document-page-highlight uploaded-pdf-highlight'+(node.id===selectedId?' is-active':'');b.type='button';b.dataset.sourceNode=node.id;b.setAttribute('aria-label',`Source: ${node.title}`);b.title=node.title;
    ['x','y','w','h'].forEach((key,i)=>b.style.setProperty(`--${key}`,`${rect[i]}%`));b.onclick=()=>selectSourceNodeInDialog(node.id);container.append(b);
  })));
}
renderUploadedPdfPages = async function(selectedId=state.selected){
  const token=++sourceRender;documentPages.innerHTML='<p class="uploaded-pdf-loading">Opening your original document…</p>';
  const pdfjs=window.pdfjsLib || await import('./assets/vendor/pdfjs/pdf.min.mjs');
  window.pdfjsLib=pdfjs;pdfjs.GlobalWorkerOptions.workerSrc='./assets/vendor/pdfjs/pdf.worker.min.mjs';
  const loading=pdfjs.getDocument({data:uploadedDocument.pdfData.slice(0)}),pdf=await loading.promise;
  if(token!==sourceRender){await loading.destroy();return;}
  documentPages.innerHTML='';
  try{for(let n=1;n<=pdf.numPages;n++){
    if(token!==sourceRender || !documentDialog.open) break;
    const page=await pdf.getPage(n),viewport=page.getViewport({scale:1.3}),figure=document.createElement('figure');figure.className='document-page uploaded-pdf-page';figure.id=`uploaded-document-page-${n}`;
    figure.innerHTML=`<figcaption>Page ${n} of ${pdf.numPages}</figcaption><div class="page-canvas"></div>`;const holder=figure.querySelector('.page-canvas'),canvas=document.createElement('canvas');canvas.className='pdf-render-canvas';canvas.width=viewport.width;canvas.height=viewport.height;holder.append(canvas);documentPages.append(figure);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;addHighlights(holder,n,state.selected);page.cleanup();
  }}finally{await loading.destroy();}
  if(token===sourceRender)scrollUploadedDocumentToNode(state.selected,'auto');
};
const originalSourceDialog=renderUploadedDocumentDialog;
renderUploadedDocumentDialog=function(selectedId=state.selected){
  originalSourceDialog(selectedId);
  document.querySelector('.document-dialog-header p').textContent='Your uploaded source. Select an item to jump to its exact yellow evidence.';
  highlightIndex.querySelectorAll('.highlight-page').forEach((badge,i)=>{const match=sources[nodes[i]?.id]?.matches?.[0];badge.textContent=uploadedDocument.fileType==='text'?`${i+1}`:match?`P${match.page}`:'—';});
  if(uploadedDocument.fileType==='image'){
    documentPages.innerHTML='<figure class="document-page" id="uploaded-document-page-1"><div class="page-canvas"><img alt="Uploaded source" class="pdf-render-canvas"></div></figure>';
    documentPages.querySelector('img').src=uploadedDocument.fileUrl;addHighlights(documentPages.querySelector('.page-canvas'),1,selectedId);
  }
};
scrollUploadedDocumentToNode=function(id=state.selected,behavior='smooth'){
  if(uploadedDocument.fileType==='text')renderUploadedTextDocument(id);
  documentDialog.querySelectorAll('[data-source-node]').forEach(b=>{b.setAttribute('aria-current',String(b.dataset.sourceNode===id));b.classList.toggle('is-active',b.dataset.sourceNode===id);});
  const target=documentPages.querySelector(`.uploaded-pdf-highlight[data-source-node="${id}"]`) || documentPages.querySelector('mark');
  if(target){const box=target.getBoundingClientRect(),container=documentPages.getBoundingClientRect();documentPages.scrollTo({top:documentPages.scrollTop+box.top-container.top-100,behavior});}
};
$('closeDocument').addEventListener('click',()=>sourceRender++);
$('clearWorkspace').onclick=()=>{if(busy)return;sourceRender++;documentDialog.close();$('clearDocument').click();documentKey='';syncWorkspace();showPage('mapping');};
for(const id of ['reduceMotion','autoSource']){
  $(id).checked=localStorage.getItem(`orbit-${id}`)==='true';
  $(id).onchange=()=>{localStorage.setItem(`orbit-${id}`,$(id).checked);document.body.classList.toggle('reduce-motion',$('reduceMotion').checked);};
}
document.body.classList.toggle('reduce-motion',$('reduceMotion').checked);
function taskStorageKey(){return `orbit-independent-tasks-${currentUser?.id || 'local'}`;}
function mapStorageKey(){return `orbit-mapping-${currentUser?.id || 'local'}-${documentKey}`;}
function saveTasks(){try{localStorage.setItem(taskStorageKey(),JSON.stringify(taskItems));}catch{setUploadMessage('Browser storage is full. Export your tasks before leaving.','error');}}
function loadTasks(){
  try{
    const saved=localStorage.getItem(taskStorageKey());
    if(saved!==null)taskItems=JSON.parse(saved);
    else{const migrated=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith(`orbit-tasks-${currentUser?.id}-`)){try{for(const t of JSON.parse(localStorage.getItem(key))){if(t.manual||t.owner||t.notes||(t.actions || []).some(a=>a.done))migrated.push(t);}}catch{}}}taskItems=[...new Map(migrated.map(t=>[t.id,t])).values()];saveTasks();}
  }catch{taskItems=[];}
  taskSelected=taskItems[0]?.id || '';
}
function downloadFile(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function renderTasks(){
  const matches=taskItems.filter(t=>(taskFilter==='all'||t.status===taskFilter)&&`${t.title} ${t.owner} ${t.next} ${t.notes}`.toLowerCase().includes(taskQuery.toLowerCase()));
  const selected=taskItems.find(t=>t.id===taskSelected);
  const page=$('tasksPage');
  page.innerHTML=`<div class="page-title"><div><span class="orbit-eyebrow">FROM INSIGHT TO ACTION</span><h1>Tasks</h1><p>${taskItems.length} total · ${taskItems.filter(t=>t.status==='Done').length} done · ${taskItems.filter(t=>t.blockers).length} with blockers</p></div><button id="newTask">+ New task</button><button id="taskView">${taskMap?'List view':'Map view'}</button><button id="exportTasks">Export tasks</button></div><div class="task-controls"><input id="taskSearch" aria-label="Search tasks" placeholder="Search tasks or owners" value="${escapeHtml(taskQuery)}"><select id="taskFilter" aria-label="Filter task status">${['all','To do','In progress','Blocked','Done'].map(v=>`<option ${taskFilter===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="tasks-layout"><div class="task-list ${taskMap?'task-map':''}" id="taskList">${taskMap?'<svg id="taskConnections" aria-hidden="true"></svg>':''}${matches.map(t=>`<button class="task-item" data-task="${t.id}" aria-pressed="${t.id===taskSelected}" style="--task-color:${t.priority==='high'?'#b34e4b':t.priority==='medium'?'#80679a':'#52759a'};${taskMap?`left:${t.x}%;top:${t.y}%;`:''}"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.status)} · ${escapeHtml(t.owner || 'Unassigned')}</span><small>${escapeHtml(t.due || 'No due date — needs to be set')}</small></button>`).join('') || '<p>No tasks yet. Upload a document or create your first task.</p>'}</div><div class="task-editor">${selected?`<h2>${escapeHtml(selected.title)}</h2><label>Title<input data-field="title" value="${escapeHtml(selected.title)}"></label><div class="task-fields"><label>Owner<input data-field="owner" value="${escapeHtml(selected.owner)}" placeholder="Assign an owner"></label><label>Due date<input data-field="due" type="date" value="${escapeHtml(selected.due)}"></label><label>Status<select data-field="status">${['To do','In progress','Blocked','Done'].map(v=>`<option ${selected.status===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Priority<select data-field="priority">${['high','medium','low'].map(v=>`<option ${selected.priority===v?'selected':''}>${v}</option>`).join('')}</select></label></div><label>Next action<textarea data-field="next">${escapeHtml(selected.next)}</textarea></label><h3>Action checklist</h3>${selected.actions.map((a,i)=>`<label class="check-row"><input type="checkbox" data-action="${i}" ${a.done?'checked':''}><span>${escapeHtml(a.text)}</span></label>`).join('')}<form id="addAction"><input name="action" aria-label="New checklist item" required placeholder="Add a checklist item"><button>Add</button></form><label>Blockers / waiting on<textarea data-field="blockers" placeholder="Who or what is holding this up?">${escapeHtml(selected.blockers)}</textarea></label><label>Working notes<textarea data-field="notes" placeholder="Your notes…">${escapeHtml(selected.notes)}</textarea></label>${nodes.some(n=>n.id===selected.id)?'<button id="taskSource">View highlighted evidence</button><button id="taskClause">Focus on map</button>':''}`:'<p>Select a task to see its next action, checklist and notes.</p>'}</div></div>`;
  const assistantMessages=window.orbitTaskAssistantMessages||['Hi! Tell me a task to add, edit, complete, or find.'];
  page.insertAdjacentHTML('beforeend',`<aside class="task-assistant" aria-label="Orbit task assistant"><div><strong>Orbit task assistant</strong><span>I can add, edit, complete, or find tasks.</span></div><div class="task-assistant-messages">${assistantMessages.map(m=>`<p>${escapeHtml(m)}</p>`).join('')}</div><form id="taskAssistantForm"><input id="taskAssistantInput" aria-label="Message Orbit task assistant" placeholder="Try: add task Review MBCC fees"><button class="primary">Send</button></form></aside>`);
  $('taskAssistantForm').onsubmit=e=>{e.preventDefault();const input=$('taskAssistantInput'),text=input.value.trim();if(!text)return;let reply='I can add, edit, complete, or find tasks. Try “add task …” or “mark … done”.';const lower=text.toLowerCase();if(lower.startsWith('add task ')){const title=text.slice(9).trim();const id=crypto.randomUUID();taskItems.push({id,manual:true,title,priority:'medium',status:'To do',owner:'',due:'',next:'',notes:'',blockers:'',actions:[],x:50,y:20});taskSelected=id;reply=`Added “${title}”.`;saveTasks();}else if(lower.startsWith('mark ')&&lower.endsWith(' done')){const q=text.slice(5,-5).trim().toLowerCase();const t=taskItems.find(x=>x.title.toLowerCase().includes(q));if(t){t.status='Done';taskSelected=t.id;reply=`Marked “${t.title}” done.`;}else reply='I could not find that task.';saveTasks();}else if(lower.startsWith('find ')){const q=text.slice(5).trim().toLowerCase();const t=taskItems.find(x=>x.title.toLowerCase().includes(q));reply=t?`“${t.title}” is ${t.status}.`:'I could not find that task.';if(t)taskSelected=t.id;}else if(lower.startsWith('edit ')){const parts=text.slice(5).split(' to '),t=taskItems.find(x=>x.title.toLowerCase().includes(parts[0].toLowerCase()));if(t&&parts[1]){const old=t.title;t.title=parts[1].trim();taskSelected=t.id;reply=`Renamed “${old}” to “${t.title}”.`;saveTasks();}else reply='Tell me “edit [task] to [new title]”.';}window.orbitTaskAssistantMessages=[...assistantMessages,text,reply].slice(-8);renderTasks();};
  $('newTask').onclick=()=>{const id=crypto.randomUUID();taskItems.push({id,manual:true,title:'New task',priority:'medium',status:'To do',owner:'',due:'',next:'',notes:'',blockers:'',actions:[],x:50,y:20});taskSelected=id;saveTasks();renderTasks();};
  $('taskView').onclick=()=>{taskMap=!taskMap;renderTasks();};
  $('taskSearch').oninput=e=>{const cursor=e.target.selectionStart;taskQuery=e.target.value;renderTasks();$('taskSearch').focus();$('taskSearch').setSelectionRange(cursor,cursor);};
  $('taskFilter').onchange=e=>{taskFilter=e.target.value;renderTasks();};
  $('exportTasks').onclick=()=>downloadFile('orbit-tasks.json',JSON.stringify(taskItems,null,2),'application/json');
  page.querySelectorAll('[data-field]').forEach(input=>input.onchange=()=>{selected[input.dataset.field]=input.value;saveTasks();if(['status','priority','title','owner','due'].includes(input.dataset.field))renderTasks();});
  page.querySelectorAll('[data-field="notes"],[data-field="blockers"],[data-field="next"]').forEach(input=>input.oninput=()=>{selected[input.dataset.field]=input.value;saveTasks();});
  page.querySelectorAll('[data-action]').forEach(input=>input.onchange=()=>{selected.actions[Number(input.dataset.action)].done=input.checked;saveTasks();});
  if($('addAction'))$('addAction').onsubmit=e=>{e.preventDefault();const text=new FormData(e.target).get('action').trim();if(text){selected.actions.push({text,done:false});saveTasks();renderTasks();}};
  if($('taskSource'))$('taskSource').onclick=()=>{state.selected=selected.id;openDocumentAt();};
  if($('taskClause'))$('taskClause').onclick=()=>{showPage('mapping');state.view='map';focusNode(selected.id);render();};
  page.querySelectorAll('[data-task]').forEach(button=>{
    button.onclick=()=>{taskSelected=button.dataset.task;renderTasks();};
    if(taskMap)button.onpointerdown=e=>{
      if(e.button!==0)return;const t=taskItems.find(t=>t.id===button.dataset.task),rect=$('taskList').getBoundingClientRect(),startX=e.clientX,startY=e.clientY,oldX=t.x,oldY=t.y;let moved=false;button.setPointerCapture(e.pointerId);
      button.onpointermove=event=>{if(Math.hypot(event.clientX-startX,event.clientY-startY)>4)moved=true;if(!moved)return;t.x=Math.max(12,Math.min(88,oldX+(event.clientX-startX)/rect.width*100));t.y=Math.max(8,Math.min(92,oldY+(event.clientY-startY)/rect.height*100));button.style.left=t.x+'%';button.style.top=t.y+'%';drawTaskLines();};
      button.onpointerup=()=>{button.onpointermove=null;button.onpointerup=null;if(moved){button.onclick=e=>e.preventDefault();saveTasks();}else{taskSelected=t.id;renderTasks();}};
    }
  });drawTaskLines();
}
function drawTaskLines(){const svg=$('taskConnections');if(!svg)return;const list=$('taskList'),rect=list.getBoundingClientRect(),cards=[...list.querySelectorAll('[data-task]')];svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);svg.innerHTML=cards.slice(1).map(card=>{const a=cards[0].getBoundingClientRect(),b=card.getBoundingClientRect();return `<line x1="${a.x+a.width/2-rect.x}" y1="${a.y+a.height/2-rect.y}" x2="${b.x+b.width/2-rect.x}" y2="${b.y+b.height/2-rect.y}" stroke="#9daea0" stroke-width="1.5"/>`;}).join('');}
window.addEventListener('resize',drawTaskLines);
// Preserve the original map, risk board, recommendation log and all map controls.
const originalDecision=setRecommendationStatus;
setRecommendationStatus=function(id,status){if(status==='accepted'){const node=nodes.find(item=>item.id===id);if(node)acceptedRecommendations[id]=node.ask||'Review and confirm this clause before signing.';}else delete acceptedRecommendations[id];originalDecision(id,status);localStorage.setItem(mapStorageKey()+'-decisions',JSON.stringify(recommendationStatus));localStorage.setItem(mapStorageKey()+'-accepted',JSON.stringify(acceptedRecommendations));};
saveNodeOffsets=function(){localStorage.setItem(mapStorageKey()+'-positions',JSON.stringify(nodeOffsets));};
space.prepend(mapLinks);
renderMapLinks=function(){
 if(!nodes.length || scene.hidden){mapLinks.innerHTML='';return;}
 const bounds=space.getBoundingClientRect(),center=$('core').getBoundingClientRect();
 mapLinks.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
 mapLinks.innerHTML=[...ring.querySelectorAll('.node:not(.hidden)')].map(card=>{const r=card.getBoundingClientRect(),node=nodes.find(n=>n.id===card.dataset.id);return `<line x1="${center.left+center.width/2-bounds.left}" y1="${center.top+center.height/2-bounds.top}" x2="${r.left+r.width/2-bounds.left}" y2="${r.top+r.height/2-bounds.top}" style="--link:${risks[node.risk].color}" stroke-width="1.6"/>`;}).join('');
};
const mapToolbar=document.createElement('div');mapToolbar.className='map-toolbar';mapToolbar.innerHTML='<button aria-label="Zoom out">−</button><button aria-label="Zoom in">+</button><button aria-label="Reset view">Fit</button><button aria-label="Exit full screen">Exit full screen</button>';
space.append(mapToolbar);mapToolbar.children[0].onclick=()=>{state.zoom=Math.max(28,state.zoom-12);applySceneTransform();};mapToolbar.children[1].onclick=()=>{state.zoom=Math.min(220,state.zoom+12);applySceneTransform();};mapToolbar.children[2].onclick=()=>{resetSceneForDocument();state.dossierHidden=true;render();};mapToolbar.children[3].onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();app.classList.remove('fullscreen-fallback');};
const views=document.querySelector('.view-switch');document.querySelector('.workspace-nav [data-page=mapping]').after(views);
views.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{showPage('mapping');render();}));
const mapOptions=document.createElement('details');mapOptions.className='map-options';mapOptions.innerHTML='<summary>Map controls & filters</summary>';
sidebar.querySelectorAll('.control-group:not(.upload-box)').forEach(control=>mapOptions.append(control));$('settingsPage').append(mapOptions);
showPage('mapping');syncWorkspace();
const exportPdf=document.createElement('button');exportPdf.textContent='Download highlighted PDF';exportPdf.className='document-button';
const exportReview=document.createElement('button');exportReview.textContent='Download review';exportReview.className='document-button';
document.querySelector('.document-dialog-actions').prepend(exportPdf,exportReview);
const sourceDialogWithExport=renderUploadedDocumentDialog;
renderUploadedDocumentDialog=function(id=state.selected){sourceDialogWithExport(id);exportPdf.hidden=!uploadedDocument.pdfData;};
exportPdf.onclick=async()=>{
 exportPdf.disabled=true;exportPdf.textContent='Preparing PDF…';
 try{
  if(!window.PDFLib)await loadScript('/assets/vendor/pdf-lib/pdf-lib.min.js');
  const doc=await PDFLib.PDFDocument.load(uploadedDocument.pdfData.slice(0));
  const loading=window.pdfjsLib.getDocument({data:uploadedDocument.pdfData.slice(0)}),pdf=await loading.promise;
  try{for(let n=1;n<=doc.getPageCount();n++){
   const page=await pdf.getPage(n),viewport=page.getViewport({scale:1}),output=doc.getPage(n-1);
   const unique=new Set();
   for(const source of Object.values(sources))for(const match of source.matches || [])if(match.page===n)for(const [x,y,w,h] of match.rects){
    const key=[x,y,w,h].join();if(unique.has(key))continue;unique.add(key);
    const a=viewport.convertToPdfPoint(x/100*viewport.width,y/100*viewport.height),b=viewport.convertToPdfPoint((x+w)/100*viewport.width,(y+h)/100*viewport.height);
    output.drawRectangle({x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1]),color:PDFLib.rgb(1,.9,.1),opacity:.32});
   }
  }}finally{await loading.destroy();}
  downloadFile(uploadedDocument.name.replace(/\.pdf$/i,'')+'-highlighted.pdf',await doc.save(),'application/pdf');
 }catch(error){setUploadMessage('Could not export PDF: '+error.message,'error');}
 finally{exportPdf.disabled=false;exportPdf.textContent='Download highlighted PDF';}
};
exportReview.onclick=()=>{
 const html='<!doctype html><meta charset="utf-8"><title>Orbit document review</title><style>body{font:16px system-ui;max-width:900px;margin:50px auto;line-height:1.7;color:#29382c}article{border-bottom:1px solid #ddd;padding:20px 0}blockquote{background:#fff4a3;padding:12px}pre{white-space:pre-wrap}</style>'+`<h1>${escapeHtml(uploadedDocument.name)}</h1><p>Orbit review · ${new Date().toLocaleDateString()}</p>`+nodes.map(n=>{const t=taskItems.find(t=>t.id===n.id);return `<article><h2>${escapeHtml(n.title)}</h2><p>${escapeHtml(n.summary)}</p>${n.clauses.map(c=>`<blockquote>${escapeHtml(c)}</blockquote>`).join('')}<p>Recommendation: ${escapeHtml(n.ask)} (${escapeHtml(recommendationStatus[n.id] || 'pending')})</p><p>Owner: ${escapeHtml(t?.owner || 'Unassigned')} · Due: ${escapeHtml(t?.due || 'Not set')}</p><pre>${escapeHtml(t?.notes || '')}</pre></article>`;}).join('');
 downloadFile('orbit-document-review.html',html,'text/html');
};
