const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');
let playwright;
try { playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const {chromium}=playwright;
const root=path.resolve(__dirname,'..');
const out=path.join(root,'output','backend-qa');
fs.mkdirSync(out,{recursive:true});
function capture(ports){
  if(process.platform!=='win32'){
    fs.writeFileSync(path.join(out,`processes-${process.pid}.json`),JSON.stringify({pid:process.pid,processes:execFileSync('ps',['-eo','pid,ppid,args'],{encoding:'utf8'})}));
    fs.writeFileSync(path.join(out,'ports.json'),JSON.stringify(ports));return;
  }
  const script=`$all=Get-CimInstance Win32_Process; $ids=@(${process.pid}); do { $next=@($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | Select-Object -ExpandProperty ProcessId); $ids+=$next } while($next.Count); $all | Where-Object { $_.ProcessId -in $ids } | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Depth 3`;
  fs.writeFileSync(path.join(out,`processes-${process.pid}.json`),execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8'}));
  fs.writeFileSync(path.join(out,'ports.json'),JSON.stringify(ports));
}
(async()=>{
  const {createAtlasServer}=await import('../server/app.mjs');
  const token='browser-test-'.padEnd(64,'b');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-browser-'));
  const server=await createAtlasServer({token,dataFile:path.join(dir,'workspace.json'),htmlFile:path.join(root,'public','index.html')});
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,url=`http://127.0.0.1:${port}`;
  try{
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || (process.platform==='win32'?'msedge':undefined),headless:true});capture([port]);
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.locator('[data-sync-action="settings"]').waitFor();
    await page.locator('#candidate').fill('Алексей · сервер');
    await page.locator('#tech-api-1-yes').click();
    await page.locator('[data-sync-action="settings"]').click();
    await page.locator('#sync-url').fill(url);
    await page.locator('#sync-token').fill(token);
    await page.locator('[data-sync-action="connect"]').click();
    await page.locator('[data-sync-action="push"]').waitFor();
    await page.locator('[data-sync-action="push"]').click();
    await page.waitForFunction(()=>document.querySelector('#server-sync-status').textContent.includes('Синхронизировано'));
    await page.locator('#candidate').fill('Алексей · обновлён');
    await page.waitForFunction(()=>document.querySelector('#server-sync-status').textContent.includes('Синхронизировано'));
    const remote=await fetch(url+'/api/workspace',{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
    assert.equal(remote.workspace.candidates[0].profile.candidate,'Алексей · обновлён');
    const another=await browser.newContext();const second=await another.newPage();await second.goto(url);
    await second.locator('[data-sync-action="settings"]').click();
    await second.locator('#sync-token').fill(token);await second.locator('[data-sync-action="connect"]').click();
    await second.locator('[data-sync-action="pull"]').click();
    await second.waitForFunction(()=>document.querySelector('#candidate').value==='Алексей · обновлён');
    assert.equal(await second.locator('#tech-api-1-yes').getAttribute('aria-pressed'),'true');
    await second.locator('#candidate').fill('Алексей · второе устройство');
    await second.waitForFunction(()=>document.querySelector('#server-sync-status').textContent.includes('Синхронизировано'));
    const dump=await second.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));
    assert.ok(!dump.includes(token),'Token is kept only in memory');
    const downloadPromise=second.waitForEvent('download');
    await second.locator('.top-actions [data-x="atlas-export"]').click();
    const download=await downloadPromise;const saved=path.join(out,'saved.html');await download.saveAs(saved);
    assert.ok(!fs.readFileSync(saved,'utf8').includes(token));
    await page.locator('#candidate').fill('Локальные правки');
    await page.waitForFunction(()=>document.querySelector('#server-sync-status').textContent.includes('Конфликт'));
    const cloud=await fetch(url+'/api/workspace',{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
    assert.equal(cloud.workspace.candidates[0].profile.candidate,'Алексей · второе устройство');
    await second.setViewportSize({width:390,height:844});
    await second.locator('#mobile-toggle').click();
    await second.locator('[data-sync-action="settings"]').click();
    await second.screenshot({path:path.join(out,'sync-mobile.png')});
    assert.equal(await second.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    const offline=await browser.newContext();const local=await offline.newPage();await local.goto(pathToFileURL(saved).href);
    assert.equal(await local.locator('#candidate').inputValue(),'Алексей · второе устройство');
    assert.deepEqual(errors,[]);
    console.log('PASS server connection, autosave, second device, conflict, portable HTML and mobile settings');
  }finally{capture([port]);if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
