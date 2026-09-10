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
 await page.locator('.workspace-nav [data-page=tasks]').click();await page.locator('[data-field=owner]').fill('Pat');await page.locator('[data-field=owner]').blur();await page.locator('[data-action="0"]').check();await page.locator('[data-field=notes]').fill('Follow up on Friday');
 await page.locator('.workspace-nav [data-page=mapping]').click();await page.locator('#reanalyze').click();await expect(page.locator('#workflowStatus')).toContainText('Ready');await page.locator('.workspace-nav [data-page=tasks]').click();await expect(page.locator('[data-action="0"]')).toBeChecked();await expect(page.locator('[data-field=notes]')).toHaveValue('Follow up on Friday');
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
