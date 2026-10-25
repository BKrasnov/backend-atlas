const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output','calendar-qa');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'backend-atlas-single-candidate.html'),'utf8');
const json=id=>JSON.parse(source.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))[1]);
const data=json('atlas-data'),lab=json('atlas-tasks-data'),technologies=data.techGroups.flatMap(g=>g.items);
const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'client/learning-calendar.js'),'utf8'),scope);
const calendar=scope.window.AtlasLearningCalendar;
const model=(today,profile={})=>calendar.schedule({tasks:lab.tasks,technologies,profile,today});
const plain=v=>JSON.parse(JSON.stringify(v));
function dates(){
  const initial=model('2026-10-26');assert.equal(initial.weeks.length,18);
  assert.deepEqual(plain(calendar.weekRange(1)),{start:'2026-10-26',due:'2026-11-01'});
  assert.equal(initial.weeks[0].task.id,1);assert.equal(initial.weeks[1].due,'2026-11-08');assert.equal(initial.weeks[17].due,'2027-02-28');
  assert.equal(initial.weeks.some(w=>w.task.project),false);
  const ids=initial.weeks.flatMap(w=>w.technologies.map(t=>t.id));assert.equal(ids.length,58);assert.equal(new Set(ids).size,58);
  assert.equal(model('2026-11-01').overdueTasks,0);assert.equal(model('2026-11-02').overdueTasks,1);
  const done=model('2026-11-02',{tasks:{1:{status:'done'}},calendar:{learnedTech:['api-1']}});
  assert.equal(done.overdueTasks,0);assert.equal(done.weeks[0].technologies.find(t=>t.id==='api-1').overdue,false);
  assert.ok(done.overdueTech>0,'Task completion does not silently complete technologies');
  assert.equal(calendar.localDay(new Date('2026-11-01T17:30:00Z')),'2026-11-02','Uses the device calendar day (test TZ Asia/Krasnoyarsk)');
  assert.ok(calendar.monthCells('2026-10').some(c=>c.date==='2026-11-01'),'October view includes the first Sunday deadline');
  console.log('PASS calendar dates, Sunday boundary, local day, progress independence, 18 tasks and 58 unique technologies');
}
function capture(port){
  const script=`$all=Get-CimInstance Win32_Process; $ids=@(${process.pid}); do { $next=@($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | Select-Object -ExpandProperty ProcessId); $ids+=$next } while($next.Count); $all | Where-Object { $_.ProcessId -in $ids } | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Depth 3`;
  fs.writeFileSync(path.join(out,`processes-${process.pid}.json`),execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8'}));
  fs.writeFileSync(path.join(out,'ports.json'),JSON.stringify([port]));
}
async function browserChecks(){
  let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
  const {createAtlasServer}=await import('../server/app.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-calendar-'));
  const token='calendar-test-'.padEnd(64,'c'),server=await createAtlasServer({token,dataFile:path.join(dir,'workspace.json'),htmlFile:path.join(root,'public/index.html')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,url=`http://127.0.0.1:${port}`;
  let browser,page;console.log(`PROCESS ${process.pid} PORT ${port}`);
  const read=()=>fetch(url+'/api/workspace',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  try{
    browser=await playwright.chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});capture(port);
    const context=await browser.newContext({viewport:{width:1500,height:1100},timezoneId:'Asia/Krasnoyarsk',acceptDownloads:true});page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+07:00'));
    await page.goto(url+'/#calendar');await page.getByLabel('Ключ доступа',{exact:true}).fill(token);await page.getByRole('button',{name:'Войти',exact:true}).click();
    await page.getByText('Синхронизировано',{exact:true}).waitFor();
    await page.evaluate(()=>{const old=window.atlasWorkspace.read();delete old.candidates[0].profile.calendar;window.atlasWorkspace.replace(old);});
    assert.equal(await page.getByRole('heading',{name:'Календарь обучения',exact:true}).count(),1);
    assert.equal(await page.locator('[data-calendar-week]').count(),18);
    const first=page.locator('#calendar-week-1');assert.ok((await first.innerText()).includes('01.11.2026'));
    assert.equal(await first.getByRole('link',{name:'Первый сервис: задачи и пользователи',exact:true}).getAttribute('href'),'#tasks/1/brief');
    await first.getByLabel('Изучено: HTTP / HTTPS',{exact:true}).check();
    await page.getByText('Синхронизировано',{exact:true}).waitFor();
    const saved=await read();assert.deepEqual(saved.workspace.candidates[0].profile.calendar.learnedTech,['api-1']);assert.equal(saved.workspace.candidates[0].profile.tech['api-1'],undefined);
    await page.reload();await page.getByText('Синхронизировано',{exact:true}).waitFor();assert.equal(await first.getByLabel('Изучено: HTTP / HTTPS',{exact:true}).isChecked(),true);
    await first.getByRole('link',{name:'Первый сервис: задачи и пользователи',exact:true}).click();
    assert.ok((await page.locator('.lab-aside').innerText()).includes('01.11.2026'));
    await page.goto(url+'/#technologies');await page.getByLabel('Поиск технологий и комментариев',{exact:true}).fill('HTTP / HTTPS');
    await page.locator('[data-tech-item="api-1"] [data-calendar-learn]').waitFor();
    assert.equal(await page.getByLabel('Изучено: HTTP / HTTPS',{exact:true}).isChecked(),true);
    await page.goto(url+'/#calendar');await page.getByRole('button',{name:'Следующий месяц',exact:true}).click();assert.ok((await page.locator('#calendar-month-title').innerText()).toLocaleLowerCase('ru').includes('ноябрь'));
    await page.clock.setFixedTime(new Date('2026-11-01T23:59:00+07:00'));await page.reload();await page.getByText('Синхронизировано',{exact:true}).waitFor();
    assert.equal(await page.locator('#calendar-week-1 [data-calendar-task-state]').getAttribute('data-calendar-task-state'),'today');
    await page.clock.setFixedTime(new Date('2026-11-02T00:01:00+07:00'));await page.goto(url+'/#tasks');
    assert.equal(await page.locator('[data-lab-card="1"] .cal-deadline').getAttribute('data-deadline-state'),'overdue');
    await page.getByRole('button',{name:/Просрочено/}).click();assert.equal(await page.locator('[data-lab-card]').count(),1);
    await page.goto(url+'/#calendar');assert.equal(await page.locator('#calendar-week-1 [data-calendar-task-state]').getAttribute('data-calendar-task-state'),'overdue');
    await page.getByRole('button',{name:/Просрочено/}).click();assert.equal(await page.locator('[data-calendar-week]').count(),1);
    await page.screenshot({path:path.join(out,'calendar-overdue.png'),fullPage:true});
    await page.goto(url+'/#tasks/1/test');
    for(const box of await page.locator('[data-lab-check^="test-"]').all())await box.check();
    await page.getByRole('button',{name:'Завершить по самопроверке',exact:true}).click();
    await page.goto(url+'/#calendar');assert.equal(await page.locator('[data-calendar-week]').count(),1,'Remaining overdue technologies keep the week visible');
    assert.equal(await page.locator('#calendar-week-1 [data-calendar-task-state]').getAttribute('data-calendar-task-state'),'done');
    await page.goto(url+'/#tasks');assert.equal(await page.locator('[data-lab-card]').count(),0,'Completed task leaves overdue filter');
    await page.goto(url+'/#calendar');await page.getByRole('button',{name:/Все недели/}).click();
    await page.getByText('Синхронизировано',{exact:true}).waitFor();
    const final=await read();assert.equal(final.workspace.candidates[0].profile.tasks['1'].status,'done');assert.deepEqual(final.workspace.candidates[0].profile.calendar.learnedTech,['api-1']);
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить атлас вместе с данными в HTML',exact:true}).click();const download=await downloadEvent;await download.saveAs(path.join(out,'calendar-saved.html'));
    const exportedHtml=fs.readFileSync(path.join(out,'calendar-saved.html'),'utf8');
    const embedded=JSON.parse(exportedHtml.match(/<script[^>]*id="atlas-profile-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(embedded.candidates[0].profile.calendar.learnedTech,['api-1']);
    await page.screenshot({path:path.join(out,'calendar-desktop.png'),fullPage:false});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'calendar-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.deepEqual(errors,[]);console.log('PASS calendar navigation, deadlines, overdue filter/badges, independent tech progress, API/reload, task completion, HTML and mobile');
  }catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:false});throw error;}
  finally{capture(port);if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
}
process.env.TZ='Asia/Krasnoyarsk';dates();browserChecks().catch(error=>{console.error(error);process.exitCode=1;});
