import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAtlasServer } from '../server/app.mjs';

const token = 'test-only-'.padEnd(64, 'a');
const fixture = () => ({version:5,activeCandidate:'candidate-one',roles:[{id:'role-one',name:'Backend',requirements:{},hidden:{tech:[],questions:[],topics:[]},interviewTemplate:[]}],candidates:[{id:'candidate-one',roleId:'role-one',profile:{version:1,candidate:'Алексей',tech:{'api-1':'yes'},techReview:{},techComments:{},topics:{},scores:{},notes:{},favorites:[],tasks:{}}}],catalog:{tech:[],questions:[],topics:[]},packets:[],updatedAt:null});

test('authenticated persistence, conflict protection and public boundary', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-api-'));
  const file = join(dir, 'workspace.json');
  const html = join(dir, 'index.html');
  await writeFile(html, '<!doctype html><title>Atlas</title>');
  let server;
  let url;
  async function start() {
    server = await createAtlasServer({token, dataFile:file, htmlFile:html, allowedOrigins:['https://owner.github.io']});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
    console.log(`PROCESS ${process.pid} PORT ${server.address().port}`);
  }
  async function stop() { await new Promise(resolve => server.close(resolve)); }
  const headers = () => ({Authorization:`Bearer ${token}`, 'Content-Type':'application/json'});
  const put = (revision, workspace) => fetch(url+'/api/workspace', {method:'PUT', headers:{...headers(),'If-Match':`"${revision}"`},body:JSON.stringify(workspace)});
  try {
    await start();
    await t.test('token required and origin allowlist applies', async () => {
      assert.equal((await fetch(url+'/api/workspace')).status,401);
      assert.equal((await fetch(url+'/api/workspace',{headers:{Authorization:'Bearer wrong'}})).status,401);
      assert.equal((await fetch(url+'/api/workspace',{headers:{...headers(),Origin:'https://evil.example'}})).status,403);
      const cors = await fetch(url+'/api/workspace',{method:'OPTIONS',headers:{Origin:'https://owner.github.io','Access-Control-Request-Method':'PUT'}});
      assert.equal(cors.status,204);
      assert.equal(cors.headers.get('access-control-allow-origin'),'https://owner.github.io');
      assert.equal(cors.headers.get('access-control-allow-credentials'),null);
      assert.equal((await fetch(url+'/.env')).status,404);
      assert.equal((await fetch(url+'/data/workspace.json')).status,404);
      assert.equal((await fetch(url+'/')).status,200);
    });
    await t.test('one profile survives a server restart', async () => {
      const empty=await fetch(url+'/api/workspace',{headers:headers()});
      assert.equal(empty.headers.get('etag'),'"0"');
      assert.equal((await empty.json()).workspace,null);
      const write=await put(0,fixture());
      assert.equal(write.status,200);
      assert.equal((await write.json()).revision,1);
      await stop();
      await start();
      const response=await fetch(url+'/api/workspace',{headers:headers()});
      const body=await response.json();
      assert.equal(body.workspace.candidates[0].profile.candidate,'Алексей');
      assert.equal(body.revision,1);
    });
    await t.test('concurrent clients cannot overwrite a newer revision', async () => {
      const a=fixture(),b=fixture();
      a.candidates[0].profile.candidate='Первый';
      b.candidates[0].profile.candidate='Второй';
      const responses=await Promise.all([put(1,a),put(1,b)]);
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
      assert.equal(JSON.parse(await readFile(file,'utf8')).revision,2);
      const old=JSON.parse(await readFile(file+'.bak','utf8'));
      assert.equal(old.revision,1);
    });
    await t.test('invalid documents and missing preconditions are rejected', async () => {
      const invalid=fixture();invalid.candidates.push(structuredClone(invalid.candidates[0]));
      assert.equal((await put(2,invalid)).status,400);
      assert.equal((await fetch(url+'/api/workspace',{method:'PUT',headers:headers(),body:JSON.stringify(fixture())})).status,428);
      assert.equal((await fetch(url+'/api/workspace',{method:'PUT',headers:{...headers(),'If-Match':'"2"'},body:'{oops'})).status,400);
      assert.equal(JSON.parse(await readFile(file,'utf8')).revision,2);
    });
    await t.test('a corrupt disk snapshot is preserved instead of silently reset', async () => {
      const broken=join(dir,'broken.json');
      await writeFile(broken,'{broken');
      await assert.rejects(createAtlasServer({token,dataFile:broken,htmlFile:html}),/Хранилище не прочитано/);
      assert.equal(await readFile(broken,'utf8'),'{broken');
    });
  } finally {if(server?.listening)await stop();await rm(dir,{recursive:true,force:true});}
});
