/* Independent tasks, saved mappings, imports and the Orbit calendar. */
const notice = document.createElement('p'); notice.id='workspaceNotice';notice.setAttribute('role','status');document.querySelector('.workspace-header').after(notice);
function inform(text){notice.textContent=text;notice.hidden=!text;}
const mascot=document.createElement('div');mascot.className='orbit-mascot';mascot.setAttribute('role','img');mascot.setAttribute('aria-label','Orbit waves hello');mascot.innerHTML='<span class="orbit-hand left">╰</span><span class="orbit-face"><i></i><i></i><b>⌣</b></span><span class="orbit-hand wave">╯</span><span class="orbit-feet">╱ ╲</span>';$('greeting').prepend(mascot);
$('mapKind').closest('label').hidden=true;
const recentSection=document.createElement('section');recentSection.id='recentMappings';recentSection.innerHTML='<h2>Recent mappings</h2><p>Sign in to see documents saved in this browser.</p>';$('greeting').append(recentSection);
const calendarPage=document.createElement('section');calendarPage.id='calendarPage';calendarPage.className='workspace-page';calendarPage.hidden=true;$('settingsPage').after(calendarPage);
const calendarNav=document.createElement('button');calendarNav.dataset.page='calendar';calendarNav.innerHTML='▦ <span>Calendar</span>';document.querySelector('.workspace-nav [data-page=settings]').before(calendarNav);calendarNav.onclick=()=>showPage('calendar');
const originalShowPage=showPage;
showPage=function(page){originalShowPage(page);calendarPage.hidden=page!=='calendar';if(page==='calendar')renderCalendar();if(page==='mapping')renderRecents();$('topUpload').hidden=page==='tasks'||page==='calendar';$('topSource').hidden=page!=='mapping';};
const oldSyncWorkspace=syncWorkspace;syncWorkspace=function(){oldSyncWorkspace();app.classList.toggle('table-layout',state.view==='recommendations');};
const oldRenderView=renderView;renderView=function(){oldRenderView();app.classList.toggle('table-layout',state.view==='recommendations');};
let mappingDb;
function openMappingDb(){return mappingDb ||= new Promise((resolve,reject)=>{const r=indexedDB.open('orbit-workspace',1);r.onupgradeneeded=()=>r.result.createObjectStore('mappings',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function mappingStore(mode,operation){const db=await openMappingDb();return new Promise((resolve,reject)=>{const tx=db.transaction('mappings',mode),request=operation(tx.objectStore('mappings'));let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function saveRecentMapping(){
 if(!currentUser || !documentKey)return;
 try{
  const source={...uploadedDocument,fileUrl:''};
  if(uploadedDocument.fileType==='image'&&uploadedDocument.fileUrl)source.imageBlob=await fetch(uploadedDocument.fileUrl).then(r=>r.blob());
  await mappingStore('readwrite',s=>s.put({key:mapStorageKey(),owner:currentUser.id,name:uploadedDocument.name,updated:Date.now(),documentKey,source,nodes:structuredClone(nodes),sources:structuredClone(sources),analysis:window.lastAnalysisResult || {},request:$('clauseRequest').value}));
  await renderRecents();
 }catch{inform('This mapping is open, but browser storage could not save it. Export the review before closing.');}
}
async function renderRecents(){
 if(!currentUser)return;
 const owner=currentUser.id;
 try{const all=await mappingStore('readonly',s=>s.getAll());if(currentUser?.id!==owner)return;const recent=all.filter(m=>m.owner===owner).sort((a,b)=>b.updated-a.updated);
 recentSection.innerHTML='<h2>Recent mappings <small>Saved on this browser</small></h2>'+ (recent.length?'<div class="recent-grid">'+recent.map((m,i)=>`<article><button data-reopen="${i}"><span>▤</span><strong>${escapeHtml(m.name)}</strong><small>${m.nodes.length} clauses · ${new Date(m.updated).toLocaleDateString()}</small></button><button data-remove-mapping="${i}" aria-label="Delete saved ${escapeHtml(m.name)}">×</button></article>`).join('')+'</div>':'<p>Your next uploaded document will be saved here, including its original PDF and highlights.</p>');
 recentSection.querySelectorAll('[data-reopen]').forEach(b=>b.onclick=()=>restoreMapping(recent[Number(b.dataset.reopen)]));
 recentSection.querySelectorAll('[data-remove-mapping]').forEach(b=>b.onclick=async()=>{if(busy)return;await mappingStore('readwrite',s=>s.delete(recent[Number(b.dataset.removeMapping)].key));renderRecents();});
 }catch{recentSection.innerHTML='<p>Saved documents are unavailable. Browser storage may be disabled.</p>';}
}
function restoreMapping(record){
 if(busy || record.owner!==currentUser?.id)return;
 releaseDocument();uploadedDocument=record.source;documentKey=record.documentKey;
 if(uploadedDocument.pdfData)uploadedDocument.fileUrl=URL.createObjectURL(new Blob([uploadedDocument.pdfData],{type:'application/pdf'}));
 else if(uploadedDocument.imageBlob)uploadedDocument.fileUrl=URL.createObjectURL(uploadedDocument.imageBlob);
 nodes=record.nodes;sources=record.sources;window.lastAnalysisResult=record.analysis;$('clauseRequest').value=record.request;
 try{recommendationStatus=JSON.parse(localStorage.getItem(mapStorageKey()+'-decisions') || '{}');nodeOffsets=JSON.parse(localStorage.getItem(mapStorageKey()+'-positions') || '{}');}catch{recommendationStatus={};nodeOffsets={};}
 state.uploadedName=record.name;state.view='map';resetSceneForDocument();state.dossierHidden=true;render();syncWorkspace();showPage('mapping');setUploadMessage('Saved mapping reopened. Your tasks are unchanged.','success');$('analysisNotice').hidden=true;
}
function draftKey(){return mapStorageKey()+'-drafts';}
function clauseDrafts(){try{return JSON.parse(localStorage.getItem(draftKey()) || '[]');}catch{return [];}}
renderRecommendationLog=function(){
 const items=recommendationNodes(),concerns=window.lastAnalysisResult?.concerns || [];
 recommendationView.innerHTML=`<header class="recommendation-header"><div><h2>Recommendation log</h2><p>${items.length} clauses · review evidence, decide, and keep your record.</p></div><button id="exportRecommendations">Export table</button></header><div class="recommendation-table-wrap"><table class="recommendation-table"><thead><tr><th>Risk</th><th>Clause / issue</th><th>Evidence</th><th>Recommendation</th><th>Impact</th><th>Decision</th></tr></thead><tbody>${items.map(n=>{const decision=recommendationStatus[n.id] || 'pending';return `<tr><td><span class="risk-pill ${n.risk}">${escapeHtml(risks[n.risk].label)}</span></td><td><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.section)}</p></td><td>${escapeHtml(n.clauses[0] || '')}<button data-table-source="${n.id}">View source</button></td><td>${escapeHtml(n.ask)}</td><td>${escapeHtml(n.why)}</td><td><span>${decision}</span><div class="decision-actions"><button data-decision-action="accepted" data-decision-id="${n.id}" aria-pressed="${decision==='accepted'}">Accept</button><button data-decision-action="rejected" data-decision-id="${n.id}" aria-pressed="${decision==='rejected'}">Reject</button><button data-decision-action="pending" data-decision-id="${n.id}" aria-label="Reset decision for ${escapeHtml(n.title)}">Reset</button></div></td></tr>`;}).join('')}</tbody></table></div><section class="contract-concerns"><button id="addClauseDraft">+ Write a draft clause</button><div id="clauseDraftList"></div><h3>Signing checks & proposed protections</h3><p>These are review prompts and draft wording, separate from the original clauses. “Not identified” is not proof that a protection is absent.</p>${concerns.map(c=>`<details><summary>${escapeHtml(c.topic)} <small>${escapeHtml(c.status.replaceAll('_',' '))}</small></summary><p>${escapeHtml(c.explanation)}</p>${c.proposedWording?`<h4>Suggested draft — review before using</h4><blockquote>${escapeHtml(c.proposedWording)}</blockquote>`:''}</details>`).join('') || '<p>Run a new mapping to include the expanded signing checks, including force majeure.</p>'}</section>`;
 recommendationView.querySelectorAll('[data-table-source]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.tableSource;openDocumentAt();});
 $('clauseDraftList').innerHTML=clauseDrafts().map((d,i)=>`<details><summary>My draft: ${escapeHtml(d.title)}</summary><p>Proposed wording — not part of the uploaded contract.</p><textarea data-draft="${i}" aria-label="Edit draft ${escapeHtml(d.title)}">${escapeHtml(d.text)}</textarea><button data-remove-draft="${i}">Delete draft</button></details>`).join('');
 recommendationView.querySelectorAll('[data-draft]').forEach(t=>t.oninput=()=>{const drafts=clauseDrafts();drafts[Number(t.dataset.draft)].text=t.value;localStorage.setItem(draftKey(),JSON.stringify(drafts));});
 recommendationView.querySelectorAll('[data-remove-draft]').forEach(b=>b.onclick=()=>{const drafts=clauseDrafts();drafts.splice(Number(b.dataset.removeDraft),1);localStorage.setItem(draftKey(),JSON.stringify(drafts));renderRecommendationLog();});
 $('addClauseDraft').onclick=()=>{const drafts=clauseDrafts();drafts.push({title:`Clause ${drafts.length+1}`,text:''});localStorage.setItem(draftKey(),JSON.stringify(drafts));renderRecommendationLog();const last=$('clauseDraftList').lastElementChild;last.open=true;last.querySelector('textarea').focus();};
 $('exportRecommendations').onclick=()=>{const rows=[['Risk','Clause','Evidence','Recommendation','Impact','Decision'],...items.map(n=>[n.risk,n.title,n.clauses.join('\n'),n.ask,n.why,recommendationStatus[n.id] || 'pending'])];downloadFile('orbit-recommendations.csv',toCsv(rows),'text/csv');};
};
function toCsv(rows){return rows.map(row=>row.map(v=>'"'+String(v ?? '').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');}
// Task import previews are independent from the currently open contract.
const importDialog=document.createElement('dialog');importDialog.id='taskImportDialog';importDialog.className='task-import-dialog';importDialog.innerHTML=`<header><h2>Bring your tasks into Orbit</h2><button id="closeTaskImport" aria-label="Close task import">×</button></header><div class="import-actions"><label class="button-label">Upload spreadsheet / transcript<input id="taskFile" type="file" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt,.md,.json,.vtt,.srt" hidden></label><label class="button-label">Upload audio<input id="audioFile" type="file" accept=".mp3,.wav,.webm,.m4a,.ogg,.aac,.flac" hidden></label><button id="recordVoice">● Record voice</button><button id="stopVoice" hidden>Stop recording</button></div><p>Spreadsheets: XLSX, XLS, ODS, CSV, TSV. Audio: up to 2.5 MB; recording stops after 5 minutes. Transcription uses your OpenRouter credits.</p><label>Google Sheets link<input id="sheetUrl" type="url" placeholder="https://docs.google.com/spreadsheets/d/…"></label><button id="importSheet">Read Google Sheet</button><p class="help">Link imports require a publicly readable sheet. For a private sheet, export XLSX from Google Sheets and upload it. Orbit does not change sharing permissions.</p><label>Transcript or task notes<textarea id="taskTranscript" rows="6" placeholder="Paste meeting notes, a transcript, or describe what needs to be done…"></textarea></label><button class="primary" id="extractTasks">Find tasks</button><p id="importStatus" role="status"></p><div id="taskImportPreview"></div><button class="primary" id="confirmTaskImport" hidden>Add selected tasks</button>`;document.body.append(importDialog);
let importRows=[],pendingTasks=[],taskImportBusy=false,recorder=null,recordStream=null,recordTimeout;
function importStatus(text){$('importStatus').textContent=text;}
function setImportBusy(value){taskImportBusy=value;['extractTasks','taskFile','importSheet','audioFile','recordVoice','confirmTaskImport'].forEach(id=>$(id).disabled=value);}
function closeImport(){if(taskImportBusy){importStatus('Wait for the current import to finish.');return;}if(recorder?.state==='recording')recorder.stop();importDialog.close();}
$('closeTaskImport').onclick=closeImport;importDialog.addEventListener('cancel',e=>{e.preventDefault();closeImport();});
function showImport(){importDialog.showModal();}
async function sheets(){if(!window.XLSX)await loadScript('/assets/vendor/sheetjs/xlsx.full.min.js');return window.XLSX;}
async function readWorkbook(buffer,name){
 const owner=currentUser?.id;
 const XLSX=await sheets();if(currentUser?.id!==owner)throw Error('Account changed. Import again.');
 const book=XLSX.read(buffer,{type:'array',cellDates:true});importRows=[];
 for(const sheet of book.SheetNames){const rows=XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,raw:false,defval:''});rows.forEach((row,index)=>{if(row.some(v=>String(v).trim()))importRows.push({id:`${sheet}:row-${index+1}`,cells:row.map(String)});});}
 const text=`Spreadsheet: ${name}\n`+importRows.map(r=>`${r.id}: ${JSON.stringify(r.cells)}`).join('\n');
 if(text.length>120000)throw Error('This sheet is too large for one import. Split it into smaller workbooks; nothing was skipped.');
 $('taskTranscript').value=text;importStatus(`Read ${book.SheetNames.length} sheets and ${importRows.length} non-empty rows. Find tasks to preview the result.`);
}
$('taskFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;if(file.size>10000000)return importStatus('Import files up to 10 MB.');
 try{setImportBusy(true);pendingTasks=[];$('confirmTaskImport').hidden=true;const ext=file.name.split('.').pop().toLowerCase();
 if(['xlsx','xls','ods','csv','tsv'].includes(ext))await readWorkbook(await file.arrayBuffer(),file.name);
 else if(ext==='json'){const data=JSON.parse(await file.text());if(!Array.isArray(data))throw Error('Task JSON must be an exported task array.');pendingTasks=data.map(normalizeImportedTask);renderImportPreview();}
 else{importRows=[];$('taskTranscript').value=await file.text();importStatus('Transcript loaded. Select Find tasks.');}
 }catch(e){importStatus(e.message);}finally{setImportBusy(false);$('taskFile').value='';}
};
$('importSheet').onclick=async()=>{try{setImportBusy(true);importStatus('Reading sheet…');const r=await fetch('/api/sheet',{method:'POST',headers:{'Content-Type':'application/json',...await orbitAuthHeaders()},body:JSON.stringify({url:$('sheetUrl').value})});if(!r.ok)throw Error((await r.json()).error);await readWorkbook(await r.arrayBuffer(),'Google Sheet');}catch(e){importStatus(e.message);}finally{setImportBusy(false);}};
function normalizeImportedTask(t,i){return {id:crypto.randomUUID(),manual:true,title:String(t.title || 'Untitled task').slice(0,250),owner:String(t.owner || '').slice(0,150),due:/^\d{4}-\d{2}-\d{2}$/.test(t.due || '')?t.due:'',priority:['high','medium','low'].includes(t.priority)?t.priority:'medium',status:['To do','In progress','Blocked','Done'].includes(t.status)?t.status:'To do',next:String(t.next || ''),notes:String(t.notes || ''),blockers:String(t.blockers || ''),actions:Array.isArray(t.actions)?t.actions.map(a=>({text:String(a.text),done:Boolean(a.done)})):[],x:20+(i%3)*30,y:15+Math.floor(i/3)*20};}
$('extractTasks').onclick=async()=>{
 const owner=currentUser?.id;
 try{const text=$('taskTranscript').value;if(!text.trim())throw Error('Add a spreadsheet, recording or some notes first.');setImportBusy(true);importStatus('Reading your notes and finding actionable tasks…');
 const r=await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json',...await orbitAuthHeaders()},body:JSON.stringify({text})});const data=await r.json();if(!r.ok)throw Error(data.error);
 if(currentUser?.id!==owner)throw Error('Account changed. Import again.');
 pendingTasks=data.tasks.map((t,i)=>normalizeImportedTask({...t,notes:`Source evidence:\n${t.sourceQuote}\n\n${importRows.filter(row=>t.sourceRowIds.includes(row.id)).map(row=>`${row.id}: ${row.cells.join(' | ')}`).join('\n')}`},i));renderImportPreview();importStatus(`${pendingTasks.length} tasks found. Review dates and owners before adding. ${data.notes || ''}`);
 }catch(e){importStatus(e.message);}finally{setImportBusy(false);}
};
function renderImportPreview(){
 $('taskImportPreview').innerHTML=pendingTasks.length?`<table><thead><tr><th>Add</th><th>Task</th><th>Owner</th><th>Due date</th></tr></thead><tbody>${pendingTasks.map((t,i)=>`<tr><td><input type="checkbox" data-import-index="${i}" checked aria-label="Import ${escapeHtml(t.title)}"></td><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.owner || 'Unassigned')}</td><td>${escapeHtml(t.due || 'No due date — needs to be set')}</td></tr>`).join('')}</tbody></table>`:'<p>No actionable tasks found. Your existing tasks are unchanged.</p>';
 $('confirmTaskImport').hidden=!pendingTasks.length;
}
$('confirmTaskImport').onclick=()=>{const items=[...importDialog.querySelectorAll('[data-import-index]:checked')].map(b=>pendingTasks[Number(b.dataset.importIndex)]);taskItems.push(...items);taskSelected=items[0]?.id || taskSelected;saveTasks();pendingTasks=[];$('confirmTaskImport').hidden=true;importDialog.close();showPage('tasks');inform(`${items.length} tasks added. Contract mappings are unchanged.`);};
async function transcribeBlob(blob,format){
 const owner=currentUser?.id;
 if(blob.size>2500000)throw Error('Recording exceeds 2.5 MB. Split it into shorter recordings.');
 setImportBusy(true);importStatus('Transcribing audio…');
 const audio=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
 const r=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json',...await orbitAuthHeaders()},body:JSON.stringify({audio,format})});const data=await r.json();if(!r.ok)throw Error(data.error);
 if(currentUser?.id!==owner)throw Error('Account changed. Please transcribe again.');
 $('taskTranscript').value=data.text;importRows=[];importStatus('Transcript ready. Review it, then select Find tasks.');
}
$('audioFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{await transcribeBlob(file,file.name.split('.').pop().toLowerCase());}catch(e){importStatus(e.message);}finally{setImportBusy(false);$('audioFile').value='';}};
$('recordVoice').onclick=async()=>{
 const owner=currentUser?.id;
 try{if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)throw Error('Voice recording is not available in this browser. Upload an audio file instead.');recordStream=await navigator.mediaDevices.getUserMedia({audio:true});
 const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));recorder=new MediaRecorder(recordStream,mime?{mimeType:mime,audioBitsPerSecond:32000}:{});const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onstop=async()=>{clearTimeout(recordTimeout);recordStream.getTracks().forEach(t=>t.stop());$('stopVoice').hidden=true;if(currentUser?.id!==owner){setImportBusy(false);return;}try{await transcribeBlob(new Blob(chunks,{type:recorder.mimeType}),recorder.mimeType.includes('mp4')?'m4a':recorder.mimeType.includes('ogg')?'ogg':'webm');}catch(e){importStatus(e.message);}finally{setImportBusy(false);}};
 recorder.start();setImportBusy(true);$('stopVoice').hidden=false;importStatus('Recording your microphone. Stop when finished.');recordTimeout=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),300000);
 }catch(e){recordStream?.getTracks().forEach(t=>t.stop());setImportBusy(false);importStatus(e.message);}
};
$('stopVoice').onclick=()=>{if(recorder?.state==='recording')recorder.stop();};
const baseRenderTasks=renderTasks;
renderTasks=function(){
 baseRenderTasks();const title=$('tasksPage').querySelector('.page-title');$('newTask').classList.add('primary');$('newTask').textContent='+ Add task';
 const addImport=document.createElement('button');addImport.textContent='Import / voice';addImport.onclick=showImport;title.append(addImport);
 const csv=document.createElement('button');csv.textContent='Export CSV';csv.onclick=()=>downloadFile('orbit-tasks.csv',toCsv([['Task','Owner','Due date','Status','Priority','Next action','Notes','Blockers'],...taskItems.map(t=>[t.title,t.owner,t.due,t.status,t.priority,t.next,t.notes,t.blockers])]),'text/csv');title.append(csv);
 const selected=taskItems.find(t=>t.id===taskSelected);if(selected){const remove=document.createElement('button');remove.textContent='Delete task';remove.className='danger';remove.onclick=()=>{const index=taskItems.indexOf(selected);taskItems.splice(index,1);saveTasks();taskSelected=taskItems[0]?.id || '';renderTasks();inform('Task deleted.');const undo=document.createElement('button');undo.textContent='Undo';undo.onclick=()=>{taskItems.splice(index,0,selected);saveTasks();taskSelected=selected.id;renderTasks();inform('Task restored.');};notice.append(undo);};$('tasksPage').querySelector('.task-editor').append(remove);}
};
let calendarMonth=new Date();calendarMonth.setDate(1);
function eventsKey(){return `orbit-events-${currentUser?.id || 'local'}`;}
function getEvents(){try{return JSON.parse(localStorage.getItem(eventsKey()) || '[]');}catch{return [];}}
function saveEvents(events){localStorage.setItem(eventsKey(),JSON.stringify(events));}
function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function meetingLink(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}}
function renderCalendar(){
 const events=getEvents(),year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),first=new Date(year,month,1),offset=first.getDay(),days=new Date(year,month+1,0).getDate();
 calendarPage.innerHTML=`<div class="page-title"><div><span class="orbit-eyebrow">MAKE SPACE FOR WHAT MATTERS</span><h1>Calendar</h1><p>Meetings and task deadlines · saved in this browser</p></div><button class="primary" id="newMeeting">+ Add meeting</button><button id="exportCalendar">Export calendar</button></div><div class="calendar-navigation"><button id="previousMonth" aria-label="Previous month">‹</button><h2>${calendarMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><button id="nextMonth" aria-label="Next month">›</button><button id="calendarToday">Today</button></div><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<strong>${d}</strong>`).join('')}${'<div class="calendar-blank"></div>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const day=`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return `<div class="calendar-day ${day===dateKey(new Date())?'today':''}"><span>${i+1}</span>${events.filter(e=>e.date===day).map(e=>`<button data-event="${e.id}">◷ ${escapeHtml(e.time)} ${escapeHtml(e.title)}</button>`).join('')}${taskItems.filter(t=>t.due===day).map(t=>`<button class="calendar-task" data-calendar-task="${t.id}">✓ ${escapeHtml(t.title)}</button>`).join('')}</div>`;}).join('')}</div><p>${taskItems.filter(t=>!t.due).length} tasks need a due date. Set dates in Tasks to place them on the calendar.</p><section class="meeting-service-note"><h3>Orbit in your meetings</h3><p>Open a meeting from its calendar entry, then import the recording or transcript in Tasks to find actions. Record voice captures your microphone.</p><p>Automatic meeting attendance is not connected yet. Orbit will not join or record a meeting in your absence until a meeting-bot service is configured.</p></section>`;
 $('previousMonth').onclick=()=>{calendarMonth.setMonth(month-1);renderCalendar();};$('nextMonth').onclick=()=>{calendarMonth.setMonth(month+1);renderCalendar();};$('calendarToday').onclick=()=>{calendarMonth=new Date();calendarMonth.setDate(1);renderCalendar();};$('newMeeting').onclick=()=>editMeeting();
 calendarPage.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>editMeeting(events.find(e=>e.id===b.dataset.event)));
 calendarPage.querySelectorAll('[data-calendar-task]').forEach(b=>b.onclick=()=>{taskSelected=b.dataset.calendarTask;showPage('tasks');});
 $('exportCalendar').onclick=()=>{
  const esc=s=>String(s || '').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const entries=[...events.map(e=>({id:e.id,title:e.title,date:e.date,time:e.time,description:[e.time,e.url,e.notes].filter(Boolean).join('\n')})),...taskItems.filter(t=>t.due).map(t=>({id:t.id,title:t.title,date:t.due,description:t.next}))];
  downloadFile('orbit-calendar.ics',['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Orbit//Calendar//EN',...entries.flatMap(e=>['BEGIN:VEVENT',`UID:${e.id}@orbit`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,e.time?`DTSTART:${e.date.replaceAll('-','')}T${e.time.replace(':','')}00`:`DTSTART;VALUE=DATE:${e.date.replaceAll('-','')}`,`SUMMARY:${esc(e.title)}`,`DESCRIPTION:${esc(e.description)}`,'END:VEVENT']),'END:VCALENDAR'].join('\r\n'),'text/calendar');
 };
}
const meetingDialog=document.createElement('dialog');meetingDialog.className='task-import-dialog';document.body.append(meetingDialog);
function editMeeting(event){
 const data=event || {id:crypto.randomUUID(),title:'',date:dateKey(new Date()),time:'09:00',url:'',notes:''};
 meetingDialog.innerHTML=`<form id="meetingForm"><header><h2>${event?'Edit meeting':'Add a meeting'}</h2><button type="button" id="closeMeeting">×</button></header><label>Meeting name<input name="title" required value="${escapeHtml(data.title)}"></label><div class="task-fields"><label>Date<input type="date" required name="date" value="${data.date}"></label><label>Time (your local time)<input type="time" required name="time" value="${escapeHtml(data.time)}"></label></div><label>Meeting link<input name="url" type="url" placeholder="https://meet.google.com/…" value="${escapeHtml(data.url)}"></label><label>Notes<textarea name="notes">${escapeHtml(data.notes)}</textarea></label><div class="import-actions"><button class="primary">Save meeting</button>${data.url&&meetingLink(data.url)?`<a class="button-label" href="${escapeHtml(meetingLink(data.url))}" target="_blank" rel="noopener">Open meeting</a>`:''}${event?'<button type="button" id="deleteMeeting">Delete meeting</button>':''}</div></form>`;
 $('closeMeeting').onclick=()=>meetingDialog.close();$('meetingForm').onsubmit=e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.target));if(fields.url&&!meetingLink(fields.url))return inform('Use an HTTPS meeting link.');saveEvents([...getEvents().filter(e=>e.id!==data.id),{...data,...fields}]);meetingDialog.close();renderCalendar();};
 if($('deleteMeeting'))$('deleteMeeting').onclick=()=>{saveEvents(getEvents().filter(e=>e.id!==data.id));meetingDialog.close();renderCalendar();};meetingDialog.showModal();
}
window.addEventListener('orbit-user-change',()=>{if(recorder?.state==='recording')recorder.stop();importDialog.close();meetingDialog.close();$('taskTranscript').value='';pendingTasks=[];importRows=[];showPage('mapping');});
// Delay authentication until all workspace features are initialized.
initAuth();
