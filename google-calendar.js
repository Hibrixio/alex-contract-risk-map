/* Google access tokens stay in memory and are cleared on sign-out. */
(()=>{
 const scope='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
 let token='',expires=0,owner='',client,calendars=[],selected='',items=[],loaded='',generation=0,pending=false,status='';
 let ready=false,configured=false;
 const baseRender=renderCalendar;
 const dialog=document.createElement('dialog');dialog.className='task-import-dialog';document.body.append(dialog);
 const connected=()=>Boolean(token&&owner===currentUser?.id&&Date.now()<expires);
 const rangeKey=()=>`${selected}:${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}`;
 function clear(){token='';expires=0;owner='';calendars=[];items=[];selected='';loaded='';pending=false;generation++;dialog.close();}
 function refreshUI(){if(!calendarPage.hidden)renderCalendar();}
 async function api(path,options={}){
  if(!connected())throw Error('Your Google session expired. Connect Google Calendar again.');
  const r=await fetch(`https://www.googleapis.com/calendar/v3/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers}});
  if(r.status===401){clear();throw Error('Your Google session expired. Connect again.');}
  if(r.status===204)return {};
  const body=await r.json();if(!r.ok)throw Error(body.error?.message||'Google Calendar could not complete this request.');return body;
 }
 async function pages(path){let result=[],next;do{const body=await api(path+(next?`&pageToken=${encodeURIComponent(next)}`:''));result.push(...(body.items||[]));next=body.nextPageToken;}while(next);return result;}
 async function load(){
  if(!connected())return;const ticket=++generation,key=rangeKey();pending=true;status='Loading Google events…';refreshUI();
  try{
   const start=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1),end=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);
   const query=new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'2500'});
   const data=await pages(`calendars/${encodeURIComponent(selected)}/events?${query}`);
   if(ticket!==generation)return;items=data.filter(e=>e.status!=='cancelled');loaded=key;status=`${items.length} Google events loaded. Times shown in your local time.`;
  }catch(e){if(ticket!==generation)return;items=[];loaded=key;status=e.message;}
  finally{if(ticket===generation){pending=false;refreshUI();}}
 }
 async function authorizeResult(result){
  if(result.error){status=result.error_description||'Google access was not granted.';refreshUI();return;}
  if(!currentUser||owner!==currentUser.id)return;
  token=result.access_token;expires=Date.now()+Number(result.expires_in||3600)*1000;
  const ticket=++generation;
  try{const list=await pages('users/me/calendarList?maxResults=250');if(ticket!==generation)return;calendars=list;selected=(list.find(c=>c.primary)||list[0])?.id||'';loaded='';if(!selected)throw Error('No calendars are available for this account.');await load();}
  catch(e){status=e.message;refreshUI();}
 }
 fetch('/api/config').then(r=>r.json()).then(config=>{
  configured=Boolean(config.googleCalendarClientId);if(!configured){refreshUI();return;}
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{client=google.accounts.oauth2.initTokenClient({client_id:config.googleCalendarClientId,scope,callback:authorizeResult,error_callback:()=>{status='Google connection was cancelled or the popup was blocked. Try Connect again.';refreshUI();}});ready=true;refreshUI();};
  script.onerror=()=>{status='Google sign-in could not load. Check your connection and refresh.';refreshUI();};document.head.append(script);
 }).catch(()=>{status='Calendar configuration could not load. Refresh to retry.';refreshUI();});
 const localDate=value=>{const d=new Date(value);return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
 function daysFor(event){
  const allDay=Boolean(event.start?.date),start=allDay?event.start.date:dateKey(new Date(event.start?.dateTime));
  const end=allDay?event.end?.date:dateKey(new Date(event.end?.dateTime));
  return day=>day>=start&&(allDay?day<end:day<=end);
 }
 renderCalendar=function(){
  baseRender();const active=connected();
  const bar=document.createElement('section');bar.className='google-calendar-connection';
  bar.innerHTML=`<div><strong>Google Calendar</strong><p>${active?'Connected · changes you save here update Google Calendar.':'Connect your personal or work Google account to read and edit its events.'}</p></div><div class="import-actions">${active?`<label>Calendar <select id="googleCalendarSelect">${calendars.map(c=>`<option value="${escapeHtml(c.id)}" ${c.id===selected?'selected':''}>${escapeHtml(c.summary)}${['owner','writer'].includes(c.accessRole)?'':' (read only)'}</option>`).join('')}</select></label><button id="googleRefresh">Refresh events</button><button id="googleNew">+ Google event</button><button id="googleDisconnect">Disconnect</button>`:`<label class="google-account-hint">Google email (optional)<input id="googleAccountEmail" type="email" placeholder="you@example.com" autocomplete="email"></label><button id="googleConnect" class="primary" ${ready?'':'disabled'}>Connect Google Calendar</button>`}</div><p id="googleCalendarStatus" role="status">${escapeHtml(status||(!configured?'Google Calendar connection is awaiting the site’s Google app setup.':''))}</p>`;
  calendarPage.querySelector('.calendar-navigation').before(bar);
  if(!active){$('googleConnect').onclick=()=>{if(!currentUser)return;owner=currentUser.id;status='Choose your Google account and allow calendar access.';const loginHint=$('googleAccountEmail')?.value.trim();client.requestAccessToken({prompt:'select_account',...(loginHint?{login_hint:loginHint}:{})});};return;}
  $('googleCalendarSelect').onchange=e=>{selected=e.target.value;loaded='';items=[];load();};
  $('googleRefresh').onclick=()=>load();$('googleRefresh').disabled=pending;
  $('googleNew').onclick=()=>edit();$('googleNew').disabled=!['owner','writer'].includes(calendars.find(c=>c.id===selected)?.accessRole);
  $('googleDisconnect').onclick=()=>{const old=token;clear();status='Google Calendar disconnected.';google.accounts.oauth2.revoke(old,()=>{});refreshUI();};
  if(loaded===rangeKey())for(const e of items){const matches=daysFor(e);calendarPage.querySelectorAll('.calendar-day').forEach(cell=>{const day=`${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,'0')}-${cell.querySelector('span').textContent.padStart(2,'0')}`;if(matches(day)){const b=document.createElement('button');b.className='google-event';b.dataset.googleEvent=e.id;b.textContent=`G · ${e.start.date?'All day':new Date(e.start.dateTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} ${e.summary||'(Untitled event)'}`;b.onclick=()=>edit(e);cell.append(b);}});}
  if(loaded!==rangeKey()&&!pending)load();
 };
 function edit(event){
  const cal=calendars.find(c=>c.id===selected),calendarId=selected;
  const writable=['owner','writer'].includes(cal?.accessRole)&&(!event||!event.eventType||event.eventType==='default');
  const allDay=Boolean(event?.start?.date),start=event?(allDay?event.start.date:localDate(event.start.dateTime)):`${dateKey(new Date())}T09:00`,end=event?(allDay?event.end.date:localDate(event.end.dateTime)):`${dateKey(new Date())}T10:00`;
  dialog.innerHTML=`<form id="googleEventForm"><header><h2>${event?'Google event':'New Google event'}</h2><button type="button" id="googleEventClose" aria-label="Close Google event">×</button></header><p>${escapeHtml(cal?.summary||'Google Calendar')}${event?.recurringEventId?' · Editing this occurrence only':''}${writable?'':' · Read only'}</p><fieldset ${writable?'':'disabled'}><label>Title<input name="summary" required value="${escapeHtml(event?.summary||'')}"></label><label><span><input type="checkbox" name="allDay" ${allDay?'checked':''}> All day</span></label><label>Start<input name="start" type="${allDay?'date':'datetime-local'}" required value="${start}"></label><label>End ${allDay?'(exclusive date)':''}<input name="end" type="${allDay?'date':'datetime-local'}" required value="${end}"></label><label>Location<input name="location" value="${escapeHtml(event?.location||'')}"></label><label>Description<textarea name="description">${escapeHtml(event?.description||'')}</textarea></label></fieldset>${event?.attendees?.length?'<label><span><input name="notify" type="checkbox"> Email guests about this change</span></label>':''}<p id="googleEventStatus" role="status"></p><div class="import-actions">${writable?'<button class="primary" id="googleEventSave">Save to Google Calendar</button>':''}${event&&writable?'<button type="button" id="googleEventDelete">Delete from Google Calendar</button>':''}${event?.htmlLink&&meetingLink(event.htmlLink)?`<a class="button-label" href="${escapeHtml(meetingLink(event.htmlLink))}" target="_blank" rel="noopener">Open in Google Calendar</a>`:''}</div></form>`;
  $('googleEventClose').onclick=()=>dialog.close();const form=$('googleEventForm');
  form.elements.allDay.onchange=()=>{for(const name of ['start','end']){const input=form.elements[name],value=input.value;input.type=form.elements.allDay.checked?'date':'datetime-local';input.value=form.elements.allDay.checked?value.slice(0,10):`${value.slice(0,10)}T09:00`;}};
  async function write(method,body){
   const user=currentUser?.id;form.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{await api(`calendars/${encodeURIComponent(calendarId)}/events${event?'/'+encodeURIComponent(event.id):''}?sendUpdates=${form.elements.notify?.checked?'all':'none'}`,{method,headers:event?.etag?{'If-Match':event.etag}:{},...(body?{body:JSON.stringify(body)}:{})});if(user!==currentUser?.id)return;dialog.close();loaded='';await load();}
   catch(e){$('googleEventStatus').textContent=e.message;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  form.onsubmit=e=>{e.preventDefault();if(!writable)return;const f=Object.fromEntries(new FormData(form));if(f.end<=f.start){$('googleEventStatus').textContent='End must be after start.';return;}
   const body={summary:f.summary,location:f.location,description:f.description};
   // Preserve the original timezone and instant when dates were not edited.
   if(!event||f.start!==start||f.end!==end||Boolean(f.allDay)!==allDay){body.start=f.allDay?{date:f.start}:{dateTime:new Date(f.start).toISOString()};body.end=f.allDay?{date:f.end}:{dateTime:new Date(f.end).toISOString()};}
   write(event?'PATCH':'POST',body);
  };
  if($('googleEventDelete'))$('googleEventDelete').onclick=()=>{if(confirm('Delete this event from Google Calendar?'))write('DELETE');};dialog.showModal();
 }
 window.addEventListener('orbit-user-change',()=>{clear();status='';});
})();
