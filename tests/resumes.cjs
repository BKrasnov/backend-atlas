const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output','resumes-qa');fs.mkdirSync(out,{recursive:true});
const pdf=Buffer.from('%PDF-1.4\n% Resume fixture\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const preview='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6V8AAAAASUVORK5CYII=';
const resume={id:'python-backend',title:'Python Backend Developer',summary:'Учебный образец с условным стажем 5 лет. Компании и контакты нужно заполнить.',tags:['Python','FastAPI','PostgreSQL'],draft:true,experienceYears:5,pages:1,fileName:'python-backend-resume.pdf',addedAt:'2026-10-30T08:00:00Z',pdfChunks:[pdf.toString('base64')],previewChunks:[preview]};
const scope={window:{},atob:s=>Buffer.from(s,'base64').toString('binary')};vm.runInNewContext(fs.readFileSync(path.join(root,'client/resumes.js'),'utf8'),scope);
const validate=scope.window.AtlasResumes.validate;
assert.equal(validate(undefined).length,0);
assert.equal(validate([resume])[0].title,resume.title);
assert.equal(validate([{...resume,pages:2}])[0].additionalPreviewPages.length,0,'Legacy two-page PDF remains readable');
const twoPageResume={...resume,pages:2,additionalPreviewPages:[[preview]]};
assert.equal(validate([twoPageResume])[0].additionalPreviewPages.length,1);
assert.throws(()=>validate([{...resume,additionalPreviewPages:[[preview]]}]),'Cannot attach more previews than PDF pages');
assert.throws(()=>validate([{...twoPageResume,additionalPreviewPages:[['invalid!']]}]),'Broken additional preview is rejected');
assert.throws(()=>validate([{...resume,pdfChunks:['invalid!']}]),'Invalid base64 is rejected');
assert.throws(()=>validate([{...resume,pdfChunks:[Buffer.from('<html>not a pdf</html>').toString('base64')]}]),'Only PDF documents are accepted');
assert.throws(()=>validate([resume,resume]),'Duplicate IDs are rejected');
const largePDF=Buffer.concat([pdf,Buffer.alloc(120000)]).toString('base64');
assert.equal(validate([{...resume,pdfChunks:largePDF.match(/.{1,32000}/g)}])[0].pdfChunks.join(''),largePDF,'Chunked documents fit the existing API string limit');
function capture(port){
 const script=`$all=Get-CimInstance Win32_Process; $ids=@(${process.pid}); do { $next=@($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | Select-Object -ExpandProperty ProcessId); $ids+=$next } while($next.Count); $all | Where-Object { $_.ProcessId -in $ids } | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Depth 3`;
 fs.writeFileSync(path.join(out,`processes-${process.pid}.json`),execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8'}));fs.writeFileSync(path.join(out,'ports.json'),JSON.stringify([port]));
}
(async()=>{
 let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
 const {createAtlasServer}=await import('../server/app.mjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-resumes-')),token='resumes-test-'.padEnd(64,'r');
 const server=await createAtlasServer({token,dataFile:path.join(dir,'workspace.json'),htmlFile:path.join(root,'public/index.html')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port,url=`http://127.0.0.1:${port}`;let browser,page;console.log(`PROCESS ${process.pid} PORT ${port}`);
 const read=()=>fetch(url+'/api/workspace',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
 try{
  browser=await playwright.chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});capture(port);
  const context=await browser.newContext({viewport:{width:1450,height:1000},acceptDownloads:true});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/#resume');assert.equal(await page.locator('.app').isVisible(),false);
  await page.getByLabel('Ключ доступа',{exact:true}).fill(token);await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByText('Синхронизировано',{exact:true}).waitFor();
  await page.evaluate(()=>{const ws=window.atlasWorkspace.read();delete ws.candidates[0].profile.resumes;window.atlasWorkspace.replace(ws);});
  assert.equal(await page.getByRole('heading',{name:'Список резюме',exact:true}).count(),1);assert.equal(await page.getByText('Резюме пока нет',{exact:true}).count(),1);
  assert.equal(new URL(page.url()).hash,'#resumes','The shared singular resume link opens the canonical list');
  const secondPreview=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');context.fillStyle='#8350da';context.fillRect(0,0,1,1);return canvas.toDataURL('image/png').split(',')[1];});
  const documentResume={...twoPageResume,additionalPreviewPages:[[secondPreview]]};
  await page.evaluate(resume=>{const ws=window.atlasWorkspace.read();ws.candidates[0].profile.resumes=[resume];ws.candidates[0].profile.tech['api-1']='yes';window.atlasWorkspace.replace(ws);},documentResume);
  assert.equal(await page.locator('.resume-card').count(),1);assert.ok((await page.locator('.resume-card').innerText()).includes('Условный стаж: 5 лет'));
  await page.getByRole('button',{name:'Просмотреть резюме',exact:true}).click();
  assert.equal(await page.locator('.resume-preview img').count(),2);await page.waitForFunction(()=>[...document.querySelectorAll('.resume-preview img')].every(image=>image.naturalWidth>0));
  assert.equal(await page.getByText('Страница 2 из 2',{exact:true}).count(),1);
  const secondImageBytes=await page.locator('.resume-preview img').nth(1).evaluate(async image=>Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer())));assert.deepEqual(Buffer.from(secondImageBytes),Buffer.from(secondPreview,'base64'),'Second page displays its own image');
  await page.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();assert.equal(await page.locator('.resume-preview').count(),0);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать резюме PDF',exact:true}).click();const download=await downloadEvent;await download.saveAs(path.join(out,'download.pdf'));
  assert.deepEqual(fs.readFileSync(path.join(out,'download.pdf')),pdf,'Download preserves the exact PDF bytes');
  await page.getByText('Синхронизировано',{exact:true}).waitFor();const saved=await read();assert.equal(saved.workspace.candidates[0].profile.resumes.length,1);assert.equal(saved.workspace.candidates[0].profile.tech['api-1'],'yes');
  assert.equal(saved.workspace.candidates[0].profile.resumes[0].additionalPreviewPages[0].join(''),secondPreview);
  await page.reload();await page.getByText('Синхронизировано',{exact:true}).waitFor();assert.equal(await page.locator('.resume-card').count(),1);
  const second=await browser.newContext();const secondPage=await second.newPage();await secondPage.goto(url+'/#resumes');await secondPage.getByLabel('Ключ доступа',{exact:true}).fill(token);await secondPage.getByRole('button',{name:'Войти',exact:true}).click();await secondPage.getByText('Синхронизировано',{exact:true}).waitFor();assert.equal(await secondPage.locator('.resume-card').count(),1,'Fresh browser loads the resume from the API');await second.close();
  const htmlDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить атлас вместе с данными в HTML',exact:true}).click();const html=await htmlDownload;await html.saveAs(path.join(out,'atlas-saved.html'));
  const text=fs.readFileSync(path.join(out,'atlas-saved.html'),'utf8'),embedded=JSON.parse(text.match(/<script[^>]*id="atlas-profile-data"[^>]*>([\s\S]*?)<\/script>/)[1]);assert.equal(embedded.candidates[0].profile.resumes[0].pdfChunks.join(''),pdf.toString('base64'));assert.equal(text.includes(token),false);
  assert.equal(embedded.candidates[0].profile.resumes[0].additionalPreviewPages[0].join(''),secondPreview);
  assert.equal((await read()).revision,saved.revision,'View and downloads do not change server data');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Просмотреть резюме',exact:true}).click();assert.equal(await page.locator('.resume-preview img').count(),2);await page.waitForFunction(()=>[...document.querySelectorAll('.resume-preview img')].every(image=>image.naturalWidth>0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  for(const b of await page.locator('.resume-card button').all()){const box=await b.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);}
  await page.screenshot({path:path.join(out,'resumes-mobile.png'),fullPage:false});assert.deepEqual(errors,[]);
  console.log('PASS legacy profile, private login, resume card/draft, preview, exact PDF download, API/reload/fresh browser, HTML without key and mobile');
 }catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:false});throw error;}
 finally{capture(port);if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
