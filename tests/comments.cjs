const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output','comments-qa');fs.mkdirSync(out,{recursive:true});
const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'client/diagram-editor.js'),'utf8'),scope);
const valid=scope.window.AtlasDiagramEditor.validateComments;
assert.equal(valid(undefined,[]).length,0,'Legacy diagrams have no comments');
assert.throws(()=>valid([{id:'c1',x:10,y:10,nodeId:'missing',resolved:false,messages:[{id:'m1',author:'Я',text:'Вопрос',at:'2026-10-25T00:00:00Z'}]}],[]),'Unknown anchor is rejected on import');
function capture(port){
  const script=`$all=Get-CimInstance Win32_Process; $ids=@(${process.pid}); do { $next=@($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | Select-Object -ExpandProperty ProcessId); $ids+=$next } while($next.Count); $all | Where-Object { $_.ProcessId -in $ids } | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Depth 3`;
  fs.writeFileSync(path.join(out,`processes-${process.pid}.json`),execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8'}));fs.writeFileSync(path.join(out,'ports.json'),JSON.stringify([port]));
}
(async()=>{
  let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
  const {createAtlasServer}=await import('../server/app.mjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-comments-')),token='comments-test-'.padEnd(64,'c');
  const server=await createAtlasServer({token,dataFile:path.join(dir,'workspace.json'),htmlFile:path.join(root,'public/index.html')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,url=`http://127.0.0.1:${port}`;let browser,page;console.log(`PROCESS ${process.pid} PORT ${port}`);
  const read=()=>fetch(url+'/api/workspace',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  try{
    browser=await playwright.chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});capture(port);
    const context=await browser.newContext({viewport:{width:1500,height:1100},acceptDownloads:true});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'/#tasks/1/design');await page.getByLabel('Ключ доступа',{exact:true}).fill(token);await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByText('Синхронизировано',{exact:true}).waitFor();
    await page.evaluate(()=>{const ws=window.atlasWorkspace.read();ws.candidates[0].profile.candidate='Иван';ws.candidates[0].profile.tasks['1']={status:'design',checks:[],design:'Схема сервиса',reflection:'',work:'',repo:'',revealed:false,snapshot:null,sketch:{nodes:[{id:'client',kind:'client',label:'Клиент',x:80,y:100},{id:'api',kind:'api',label:'API + авторизация',x:420,y:100},{id:'db',kind:'database',label:'PostgreSQL',x:420,y:320}],edges:[{from:'client',to:'api',label:'HTTPS'},{from:'api',to:'db',label:'SQL'}]}};window.atlasWorkspace.replace(ws);});
    const graph=()=>page.evaluate(()=>window.atlasWorkspace.read().candidates[0].profile.tasks['1'].sketch);
    if(process.argv.includes('--responsive')){
      await page.setViewportSize({width:390,height:844});
      const editor=await page.locator('#sketch-editor').boundingBox();
      for(const button of await page.locator('.sketch-editor-toolbar button').all()){
        const b=await button.boundingBox();assert.ok(b.x>=editor.x&&b.x+b.width<=editor.x+editor.width+1,'Every toolbar button fits the mobile editor');
      }
      await page.getByRole('button',{name:'Комментарий',exact:true}).click();await page.locator('[data-node-id="api"]').click();
      await page.getByLabel('Текст комментария',{exact:true}).fill('Проверить права до запроса к данным.');await page.getByRole('button',{name:'Отправить комментарий',exact:true}).click();
      await page.getByLabel('Ответ',{exact:true}).fill('Проверка будет в middleware.');await page.getByRole('button',{name:'Отправить ответ',exact:true}).click();
      const inside=()=>page.locator('.sketch-comments-panel').evaluate(el=>{const p=el.getBoundingClientRect(),f=el.querySelector('form').getBoundingClientRect(),m=el.querySelector('.sketch-comment-messages').getBoundingClientRect();return f.top>=p.top&&f.bottom<=p.bottom&&m.height>=50;});
      assert.equal(await inside(),true,'Mobile panel has room for messages and the complete reply form');
      await page.locator('#sketch-editor').screenshot({path:path.join(out,'comments-mobile.png')});
      await page.getByRole('button',{name:'Полноэкранный режим',exact:true}).click();assert.equal(await inside(),true,'Mobile fullscreen retains a usable discussion panel');
      const full=await page.locator('.sketch-comments-panel').boundingBox();assert.ok(full.y>=0&&full.y+full.height<=844);
      await page.screenshot({path:path.join(out,'comments-mobile-fullscreen.png'),fullPage:false});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
      console.log('PASS mobile toolbar wrapping, messages/reply form, fullscreen discussion panel and width');return;
    }
    await page.getByRole('button',{name:'Выбор',exact:true}).click();await page.keyboard.press('c');assert.equal(await page.locator('.sketch-canvas').getAttribute('data-mode'),'comment');
    await page.locator('[data-node-id="api"]').click();
    const firstText='Где проверяются права? <img src=x onerror="window.badComment=true">';
    await page.getByLabel('Текст комментария',{exact:true}).fill(firstText);await page.getByLabel('Текст комментария',{exact:true}).press('Control+Enter');
    assert.equal(await page.locator('[data-comment-id]').count(),1);assert.equal(await page.locator('.sketch-comments-panel img').count(),0);
    await page.getByLabel('Ответ',{exact:true}).fill('В middleware; бизнес-ограничения — в сервисе.');await page.getByRole('button',{name:'Отправить ответ',exact:true}).click();
    const created=await graph(),thread=created.comments[0];assert.equal(thread.nodeId,'api');assert.equal(thread.messages.length,2);assert.equal(thread.messages[0].text,firstText);assert.equal(thread.messages[0].author,'Иван');
    await page.getByRole('button',{name:'Комментарий',exact:true}).click();
    const free=await page.locator('#sketch-svg').evaluate(el=>{const p=new DOMPoint(300,350).matrixTransform(el.getScreenCTM());return{x:p.x,y:p.y};});await page.mouse.click(free.x,free.y);
    await page.getByLabel('Текст комментария',{exact:true}).fill('Добавить таймауты и повтор запроса.');await page.getByRole('button',{name:'Отправить комментарий',exact:true}).click();
    assert.equal((await graph()).comments.length,2);assert.equal((await graph()).comments[1].nodeId,undefined);
    await page.getByRole('button',{name:'Выбор',exact:true}).click();
    const pinBefore=await page.locator(`[data-comment-id="${thread.id}"]`).getAttribute('transform'),node=await page.locator('[data-node-id="api"]').boundingBox();
    await page.mouse.move(node.x+55,node.y+25);await page.mouse.down();await page.mouse.move(node.x+110,node.y+75,{steps:7});await page.mouse.up();
    const moved=await graph();assert.notEqual(await page.locator(`[data-comment-id="${thread.id}"]`).getAttribute('transform'),pinBefore);
    assert.equal(moved.comments[0].x,thread.x);assert.equal(moved.comments[0].y,thread.y,'Anchor remains relative to the block');
    await page.keyboard.press('Control+z');assert.equal(await page.locator(`[data-comment-id="${thread.id}"]`).getAttribute('transform'),pinBefore);await page.keyboard.press('Control+y');
    await page.locator(`[data-comment-id="${thread.id}"]`).click();await page.getByRole('button',{name:'Изменить сообщение 1',exact:true}).click();
    await page.getByLabel('Редактировать комментарий',{exact:true}).fill('Проверить права до бизнес-операции.');await page.getByRole('button',{name:'Сохранить комментарий',exact:true}).click();
    assert.equal((await graph()).comments[0].messages[0].text,'Проверить права до бизнес-операции.');assert.equal((await graph()).comments[0].messages.length,2);
    await page.getByRole('button',{name:'Отметить решённым',exact:true}).click();assert.equal(await page.locator('[data-comment-id]').count(),1);
    await page.getByLabel('Показать решённые',{exact:true}).check();assert.equal(await page.locator('[data-comment-id]').count(),2);
    await page.getByRole('button',{name:/Открыть комментарий 1:/}).click();await page.getByRole('button',{name:'Открыть снова',exact:true}).click();
    assert.equal((await graph()).comments[0].resolved,false);
    await page.getByRole('button',{name:/Открыть комментарий 1:/}).click();await page.getByRole('button',{name:'Удалить обсуждение',exact:true}).click();assert.equal((await graph()).comments.length,1);
    await page.keyboard.press('Control+z');assert.equal((await graph()).comments.length,2);
    await page.getByRole('button',{name:'Выбор',exact:true}).click();await page.locator('.sketch-canvas').scrollIntoViewIfNeeded();await page.locator('[data-node-id="api"]').click({position:{x:30,y:35}});await page.keyboard.press('Delete');
    assert.equal((await graph()).comments[0].nodeId,undefined,'Deleting a block preserves its discussion at a free point');await page.keyboard.press('Control+z');assert.equal((await graph()).comments[0].nodeId,'api');
    await page.getByText('Синхронизировано',{exact:true}).waitFor();const saved=await read();assert.equal(saved.workspace.candidates[0].profile.tasks['1'].sketch.comments.length,2);
    await page.reload();await page.getByText('Синхронизировано',{exact:true}).waitFor();assert.equal((await graph()).comments[0].messages.length,2);
    await page.getByRole('button',{name:'Зафиксировать решение',exact:true}).click();await page.getByText('Синхронизировано',{exact:true}).waitFor();assert.equal((await read()).workspace.candidates[0].profile.tasks['1'].snapshot.sketch.comments.length,2);
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить атлас вместе с данными в HTML',exact:true}).click();const download=await downloadEvent;await download.saveAs(path.join(out,'comments-saved.html'));
    const exported=JSON.parse(fs.readFileSync(path.join(out,'comments-saved.html'),'utf8').match(/<script[^>]*id="atlas-profile-data"[^>]*>([\s\S]*?)<\/script>/)[1]);assert.equal(exported.candidates[0].profile.tasks['1'].sketch.comments[0].messages.length,2);
    await page.getByRole('button',{name:'Показать всю схему',exact:true}).click();await page.locator(`[data-comment-id="${thread.id}"]`).click();
    await page.getByRole('button',{name:'Полноэкранный режим',exact:true}).click();
    const panel=await page.locator('.sketch-comments-panel').boundingBox();assert.ok(panel.y>=0&&panel.y+panel.height<=1100);
    await page.locator('#sketch-editor').screenshot({path:path.join(out,'comments-desktop.png')});
    await page.getByRole('button',{name:'Полноэкранный режим',exact:true}).click();await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Показать всю схему',exact:true}).click();await page.locator('#sketch-editor').screenshot({path:path.join(out,'comments-mobile.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
    console.log('PASS C/pins, block/free comments, safe text, replies/edit, anchor move/detach/undo, resolve/reopen, delete/undo, API/reload, snapshot/HTML, fullscreen and mobile');
  }catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:false});throw error;}
  finally{capture(port);if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
