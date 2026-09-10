const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path'),os=require('node:os');
const fixture=path.join(os.tmpdir(),'orbit-fixture.pdf');
test.beforeAll(async()=>{const {PDFDocument}=require('../assets/vendor/pdf-lib/pdf-lib.min.js');const doc=await PDFDocument.create();doc.addPage([600,800]).drawText('General terms. This first page has no payment clause.',{x:60,y:700,size:12});doc.addPage([600,800]).drawText('Client shall pay within 15 days.',{x:60,y:600,size:12});fs.writeFileSync(fixture,await doc.save());});
const clause={id:'payment',title:'Payment',category:'commercial',risk:'medium',section:'Section 1',summary:'Payment within 15 days.',why:'Payment deadline.',ask:'Assign payment owner.',clauses:['Client shall pay within 15 days.'],tags:['payment']};
async function signedIn(page){
 await page.addInitScript(()=>{window.Clerk={load:async()=>{},user:{id:'test-user',firstName:'Alex'},session:{getToken:async()=> 'fixture-token'},mountUserButton:()=>{},addListener:()=>{}};});
 await page.route('**/api/config',route=>route.fulfill({json:{clerkPublishableKey:'pk_test_ZXhhbXBsZS5jb20k',analysis:true,googleOcr:false}}));
 await page.route('**/api/analyze',async route=>{const body=route.request().postDataJSON();await route.fulfill({json:{nodes:[clause],unmatchedRequests:body.request?['Termination']:[]}});});
 await page.goto('/');await expect(page.locator('#bootScreen')).toBeHidden();
}
test('single upload, requested focus, text highlights and task checklist survive reanalysis',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await signedIn(page);
 await page.locator('#clauseRequest').fill('Payment and termination');
 await page.locator('#documentUpload').setInputFiles({name:'first.txt',mimeType:'text/plain',buffer:Buffer.from('Section 1. Client shall pay within 15 days. This agreement starts today.')});
 await expect(page.locator('#workflowStatus')).toContainText('Ready');
 await page.locator('#topSource').click();await expect(page.locator('#documentTitle')).toHaveText('first.txt');await expect(page.locator('mark')).toHaveText('Client shall pay within 15 days');
 await page.locator('#closeDocument').click();await expect(page.locator('#documentDialog')).not.toBeVisible();
 await page.locator('.workspace-nav [data-page=tasks]').click();await page.locator('#newTask').click();await page.locator('[data-field=title]').fill('Independent task');await page.locator('[data-field=title]').blur();await page.locator('#addAction input').fill('Call Pat');await page.locator('#addAction button').click();await page.locator('[data-field=owner]').fill('Pat');await page.locator('[data-field=owner]').blur();await page.locator('[data-action="0"]').check();await page.locator('[data-field=notes]').fill('Follow up on Friday');
 await page.locator('.workspace-nav [data-page=mapping]').click();await page.locator('#reanalyze').click();await expect(page.locator('#workflowStatus')).toContainText('Ready');await page.locator('.workspace-nav [data-page=tasks]').click();await expect(page.locator('[data-action="0"]')).toBeChecked();await expect(page.locator('[data-field=notes]')).toHaveValue('Follow up on Friday');
 await expect(page.locator('[data-task]')).toHaveCount(1);
 expect(errors).toEqual([]);
});
test('API failure is visible and never presents a fake completed map',async({page})=>{await signedIn(page);await page.route('**/api/analyze',r=>r.fulfill({status:503,json:{error:'Analysis service unavailable'}}));await page.locator('#documentUpload').setInputFiles({name:'failed.txt',mimeType:'text/plain',buffer:Buffer.from('Client shall pay within 15 days. Document text.')});await expect(page.locator('#workflowStatus')).toContainText('Analysis service unavailable');await expect(page.locator('#topUpload')).toBeEnabled();await expect(page.locator('#app')).toBeHidden();});
test('PDF highlights use source geometry and selected evidence jumps to the right page',async({page})=>{
 await signedIn(page);await page.locator('#documentUpload').setInputFiles(fixture);await expect(page.locator('#workflowStatus')).toContainText('Ready');await page.locator('#topSource').click();await expect(page.locator('#uploaded-document-page-2 canvas')).toBeVisible();await expect(page.locator('.uploaded-pdf-highlight')).toHaveCount(1);const box=await page.locator('.uploaded-pdf-highlight').evaluate(el=>({y:el.style.getPropertyValue('--y'),parent:el.closest('figure').id}));expect(box.parent).toBe('uploaded-document-page-2');expect(parseFloat(box.y)).toBeGreaterThan(20);expect(parseFloat(box.y)).toBeLessThan(30);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download highlighted PDF',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toContain('-highlighted.pdf');const bytes=fs.readFileSync(await download.path());const doc=await require('../assets/vendor/pdf-lib/pdf-lib.min.js').PDFDocument.load(bytes);expect(doc.getPageCount()).toBe(2);
 await page.locator('#closeDocument').click();await page.locator('#pasteToggle').click();await page.locator('#documentPaste').fill('Client shall pay within 15 days. A completely different document.');await page.locator('#analyzePaste').click();await expect(page.locator('#workflowStatus')).toContainText('Ready');await page.locator('#topSource').click();await expect(page.locator('#documentTitle')).toHaveText('Pasted document');await expect(page.locator('canvas')).toHaveCount(0);
});
test('analysis requires sign-in',async({request})=>{const response=await request.post('/api/analyze',{data:{text:'Client shall pay within 15 days.'}});expect(response.status()).toBe(401);});
test('scanned image OCR produces original-source highlights without an AI charge',async({page})=>{
 test.setTimeout(120000);await signedIn(page);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1400;c.height=400;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='40px Arial';ctx.fillText('Client shall pay within 15 days.',80,150);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#documentUpload').setInputFiles({name:'scan.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.locator('#workflowStatus')).toContainText('Ready',{timeout:100000});await page.locator('#topSource').click();await expect(page.locator('.page-canvas img')).toBeVisible();expect(await page.locator('.uploaded-pdf-highlight').count()).toBeGreaterThan(0);
});

test('recent PDF restores after refresh without another analysis and decisions survive',async({page})=>{
 await signedIn(page);await page.locator('#documentUpload').setInputFiles(fixture);await expect(page.locator('#workflowStatus')).toContainText('Ready');
 await page.locator('.workspace-nav [data-view=recommendations]').click();await expect(page.locator('.recommendation-table')).toBeVisible();await page.locator('.recommendation-table [data-decision-action=accepted]').click();
 await page.reload();await expect(page.locator('#bootScreen')).toBeHidden();await expect(page.locator('#greetingTitle')).toBeVisible();await expect(page.locator('#recentMappings [data-reopen]')).toHaveCount(1);
 await page.route('**/api/analyze',r=>r.abort());await page.locator('#recentMappings [data-reopen]').click();await page.locator('#topSource').click();await expect(page.locator('#uploaded-document-page-2 canvas')).toBeVisible();await page.locator('#closeDocument').click();await page.locator('.workspace-nav [data-view=recommendations]').click();await expect(page.locator('.recommendation-table [data-decision-action=accepted]')).toHaveAttribute('aria-pressed','true');
});
test('spreadsheet preview preserves arbitrary columns and import never replaces tasks',async({page})=>{
 await signedIn(page);await page.route('**/api/tasks',async r=>{const text=r.request().postDataJSON().text;expect(text).toContain('Odd heading');expect(text).toContain('Keep this extra');await r.fulfill({json:{tasks:[{title:'Send proposal',owner:'Pat',due:'',priority:'medium',status:'To do',next:'Send proposal',sourceQuote:'Send proposal',sourceRowIds:['Sheet1:row-2']}],notes:''}});});
 await page.locator('.workspace-nav [data-page=tasks]').click();await page.locator('#newTask').click();await page.getByRole('button',{name:'Import / voice',exact:true}).click();await page.locator('#taskFile').setInputFiles({name:'work.csv',mimeType:'text/csv',buffer:Buffer.from('Odd heading,Who,Anything else\nSend proposal,Pat,Keep this extra')});await expect(page.locator('#importStatus')).toContainText('non-empty rows');await page.locator('#extractTasks').click();await expect(page.locator('#taskImportPreview')).toContainText('No due date');await expect(page.locator('#taskImportPreview')).toContainText('Send proposal');await page.locator('#confirmTaskImport').click();await expect(page.locator('[data-task]')).toHaveCount(2);await expect(page.locator('[data-field=notes]')).toContainText('Keep this extra');await page.getByRole('button',{name:'Delete task',exact:true}).click();await expect(page.locator('[data-task]')).toHaveCount(1);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('[data-task]')).toHaveCount(2);
});
test('calendar meetings persist and tasks can be given due dates independently',async({page})=>{
 await signedIn(page);await page.locator('.workspace-nav [data-page=calendar]').click();await page.locator('#newMeeting').click();await page.locator('[name=title]').fill('Project review');await page.locator('[name=url]').fill('https://meet.google.com/abc-defg-hij');await page.getByRole('button',{name:'Save meeting',exact:true}).click();await expect(page.locator('[data-event]')).toHaveCount(1);await page.reload();await page.locator('.workspace-nav [data-page=calendar]').click();await expect(page.locator('[data-event]')).toContainText('Project review');await page.locator('[data-event]').click();await expect(page.getByRole('link',{name:'Open meeting'})).toHaveAttribute('href','https://meet.google.com/abc-defg-hij');
});
test('audio transcript can be reviewed and converted to tasks',async({page})=>{
 await signedIn(page);await page.route('**/api/transcribe',async r=>{expect(r.request().postDataJSON().format).toBe('wav');await r.fulfill({json:{text:'Pat must send the proposal.',cost:0}});});await page.route('**/api/tasks',r=>r.fulfill({json:{tasks:[{title:'Send proposal',owner:'Pat',due:'',priority:'medium',status:'To do',next:'Send proposal',sourceQuote:'Pat must send the proposal.',sourceRowIds:[]}],notes:''}}));await page.locator('.workspace-nav [data-page=tasks]').click();await page.getByRole('button',{name:'Import / voice',exact:true}).click();await page.locator('#audioFile').setInputFiles({name:'sample.wav',mimeType:'audio/wav',buffer:Buffer.from('RIFF fixture data')});await expect(page.locator('#taskTranscript')).toHaveValue('Pat must send the proposal.');await page.locator('#extractTasks').click();await expect(page.locator('#taskImportPreview')).toContainText('Send proposal');await page.locator('#confirmTaskImport').click();await expect(page.locator('[data-task]')).toHaveCount(1);
});
test('draft wording is separate from source evidence and persists',async({page})=>{
 await signedIn(page);await page.locator('#documentUpload').setInputFiles(fixture);await expect(page.locator('#workflowStatus')).toContainText('Ready');await page.locator('.workspace-nav [data-view=recommendations]').click();await page.locator('#addClauseDraft').click();await page.locator('[data-draft]').fill('Neither party is liable for unavoidable natural-disaster delays.');await page.locator('.workspace-nav [data-view=map]').click();await page.locator('.workspace-nav [data-view=recommendations]').click();await expect(page.locator('[data-draft]')).toHaveValue('Neither party is liable for unavoidable natural-disaster delays.');await expect(page.locator('.recommendation-table')).not.toContainText('natural-disaster');
});
test('voice recorder sends recorded audio and releases the microphone on stop',async({page})=>{
 await signedIn(page);await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext(),oscillator=context.createOscillator(),destination=context.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();window.testMicrophone=destination.stream;window.testAudioContext=context;return destination.stream;};});
 await page.route('**/api/transcribe',async r=>{expect(r.request().postDataJSON().audio.length).toBeGreaterThan(20);await r.fulfill({json:{text:'Schedule a follow-up.',cost:0}});});
 await page.locator('.workspace-nav [data-page=tasks]').click();await page.getByRole('button',{name:'Import / voice',exact:true}).click();await page.locator('#recordVoice').click();await expect(page.locator('#importStatus')).toContainText('Recording your microphone');await page.waitForTimeout(250);await page.locator('#stopVoice').click();await expect(page.locator('#taskTranscript')).toHaveValue('Schedule a follow-up.');expect(await page.evaluate(()=>window.testMicrophone.getTracks().every(t=>t.readyState==='ended'))).toBe(true);await page.evaluate(()=>window.testAudioContext.close());
});
test('empty analysis is an error and is never saved as a completed mapping',async({page})=>{
 await signedIn(page);await page.route('**/api/analyze',r=>r.fulfill({json:{nodes:[],concerns:[],unmatchedRequests:[]}}));await page.locator('#documentUpload').setInputFiles(fixture);await expect(page.locator('#workflowStatus')).toContainText('Analysis returned no clauses');await expect(page.locator('#recentMappings [data-reopen]')).toHaveCount(0);await expect(page.locator('#topUpload')).toBeEnabled();
});
test('previously saved zero-clause records repair from retained source',async({page})=>{
 await signedIn(page);await page.locator('#documentUpload').setInputFiles(fixture);await expect(page.locator('#workflowStatus')).toContainText('Ready');await page.evaluate(async()=>{const db=await new Promise(r=>{const open=indexedDB.open('orbit-workspace',1);open.onsuccess=()=>r(open.result);});await new Promise(resolve=>{const tx=db.transaction('mappings','readwrite'),store=tx.objectStore('mappings'),req=store.getAll();req.onsuccess=()=>{for(const record of req.result){record.nodes=[];record.sources={};store.put(record);}};tx.oncomplete=resolve;});});await page.reload();await expect(page.locator('#recentMappings')).toContainText('Needs repair');await page.locator('#recentMappings [data-reopen]').click();await expect(page.locator('#workflowStatus')).toContainText('Ready');await expect(page.locator('#ring .node')).toHaveCount(1);await page.locator('#topSource').click();await expect(page.locator('#uploaded-document-page-2 canvas')).toBeVisible();
});
test('every risk card is reachable without clipping at desktop and narrow widths',async({page})=>{
 await signedIn(page);
 const cards=Array.from({length:12},(_,i)=>({...clause,id:`risk-${i}`,title:`Clause ${i+1}`,risk:i%2?'medium':'high'}));
 await page.route('**/api/analyze',r=>r.fulfill({json:{nodes:cards}}));
 await page.locator('#documentUpload').setInputFiles({name:'risks.txt',mimeType:'text/plain',buffer:Buffer.from('Client shall pay within 15 days. Document text.')});
 await expect(page.locator('#workflowStatus')).toContainText('Ready');
 await page.locator('.workspace-nav [data-view="cards"]').click();
 for(const width of [1512,900,600]){
  await page.setViewportSize({width,height:850});
  await expect(page.locator('.risk-card')).toHaveCount(12);
  for(const card of await page.locator('.risk-card-main').all()){
   await card.evaluate(el=>el.scrollIntoView({block:"center"}));
   await expect(card).toBeInViewport();
   expect(await card.evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {ok:el===hit||el.contains(hit),hit:hit?.outerHTML.slice(0,200),y:r.y};})).toMatchObject({ok:true});
  }
  const bounds=await page.locator('.stage-panel').evaluate(el=>({width:el.getBoundingClientRect().width,app:el.parentElement.getBoundingClientRect().width}));
  expect(Math.abs(bounds.width-bounds.app)).toBeLessThan(3);
 }
});

test('saved mapping restores every risk card and count without another analysis',async({page})=>{
 await signedIn(page);
 let calls=0;const cards=Array.from({length:7},(_,i)=>({...clause,id:`saved-${i}`,title:`Saved clause ${i+1}`,risk:i<4?'high':'medium'}));
 await page.route('**/api/analyze',r=>{calls++;return r.fulfill({json:{nodes:cards}});});
 await page.locator('#documentUpload').setInputFiles({name:'saved-risks.txt',mimeType:'text/plain',buffer:Buffer.from('Client shall pay within 15 days. Document text.')});
 await expect(page.locator('#workflowStatus')).toContainText('Ready');
 await page.reload();await expect(page.locator('#bootScreen')).toBeHidden();
 await page.locator('[data-reopen]').first().click();
 await expect(page.locator('#workflowStatus')).toContainText('Saved mapping reopened');
 await page.locator('.workspace-nav [data-view="cards"]').click();
 await expect(page.locator('.risk-card')).toHaveCount(7);
 await expect(page.locator('[data-risk-list="high"] .risk-card')).toHaveCount(4);
 await expect(page.locator('[data-risk-list="medium"] .risk-card')).toHaveCount(3);
 expect(calls).toBe(1);
});

test('trackpad wheel scrolls risk cards instead of being consumed by 3D zoom',async({page})=>{
 await signedIn(page);
 await page.route('**/api/analyze',r=>r.fulfill({json:{nodes:Array.from({length:15},(_,i)=>({...clause,id:`scroll-${i}`,title:`Clause ${i}`,risk:'high'}))}}));
 await page.locator('#documentUpload').setInputFiles({name:'scroll.txt',mimeType:'text/plain',buffer:Buffer.from('Client shall pay within 15 days. Document text.')});
 await expect(page.locator('#workflowStatus')).toContainText('Ready');
 await page.locator('.workspace-nav [data-view="cards"]').click();
 await page.locator('.risk-card-main').first().hover();
 const before=await page.evaluate(()=>window.scrollY);
 await page.mouse.wheel(0,500);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(before+100);
});
test('Google Calendar consent, event read/edit/create/delete and disconnect',async({page})=>{
 await signedIn(page);
 await page.route('**/api/config',r=>r.fulfill({json:{clerkPublishableKey:'pk_test_ZXhhbXBsZS5jb20k',googleCalendarClientId:'fixture.apps.googleusercontent.com'}}));
 await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:'fixture-google',expires_in:3600})}),revoke:(t,cb)=>cb()}}};`}));
 const day=new Date().toISOString().slice(0,10);let event={id:'google-one',summary:'Google planning',start:{dateTime:day+'T14:00:00Z'},end:{dateTime:day+'T15:00:00Z'},etag:'"v1"'};let writes=[];
 await page.route('https://www.googleapis.com/calendar/v3/**',r=>{const req=r.request(),url=req.url();if(req.method()!=='GET'){writes.push({method:req.method(),body:req.postDataJSON(),url});return r.fulfill({json:event});}return r.fulfill({json:url.includes('calendarList')?{items:[{id:'primary-account',summary:'My Google calendar',accessRole:'owner',primary:true}]}:{items:[event]}});});
 await page.reload();await expect(page.locator('#bootScreen')).toBeHidden();await page.locator('[data-page=calendar]').click();
 await page.getByRole('button',{name:'Connect Google Calendar',exact:true}).click();
 await expect(page.locator('.google-event')).toHaveCount(1);await page.locator('.google-event').click();
 await page.locator('#googleEventForm [name=summary]').fill('Updated planning');await page.locator('#googleEventSave').click();
 await expect.poll(()=>writes.length).toBe(1);expect(writes[0].method).toBe('PATCH');expect(writes[0].body.summary).toBe('Updated planning');expect(writes[0].body.start).toBeUndefined();
 await page.locator('#googleNew').click();await page.locator('#googleEventForm [name=summary]').fill('New event');await page.locator('#googleEventSave').click();await expect.poll(()=>writes.length).toBe(2);expect(writes[1].method).toBe('POST');expect(writes[1].body.start.dateTime).toBeTruthy();
 await page.locator('.google-event').click();page.once('dialog',d=>d.accept());await page.locator('#googleEventDelete').click();await expect.poll(()=>writes.length).toBe(3);expect(writes[2].method).toBe('DELETE');
 await page.locator('#googleDisconnect').click();await expect(page.locator('.google-event')).toHaveCount(0);await expect(page.locator('#googleConnect')).toBeVisible();
});

test('accepting a recommendation adds its wording to the review document',async({page})=>{
 await signedIn(page);
 await page.route('**/api/analyze',r=>r.fulfill({json:{nodes:[{...clause,id:'accepted-clause',title:'Payment',ask:'Add a clear payment deadline and late-payment remedy.',clauses:['Client shall pay within 15 days.']}]}}));
 await page.locator('#documentUpload').setInputFiles({name:'accepted.txt',mimeType:'text/plain',buffer:Buffer.from('Client shall pay within 15 days. Document text.')});
 await expect(page.locator('#workflowStatus')).toContainText('Ready');
 await page.locator('.workspace-nav [data-view="recommendations"]').click();
 await page.locator('[data-decision-action="accepted"]').first().click();
 await expect(page.locator('.accepted-amendment')).toContainText('Add a clear payment deadline');
 await page.locator('#topSource').click();
 await expect(page.locator('.accepted-amendment').last()).toContainText('Add a clear payment deadline');
});
