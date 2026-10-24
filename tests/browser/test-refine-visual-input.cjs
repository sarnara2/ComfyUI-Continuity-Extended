// Actual settings/request modules with in-memory API and queue adapters only.
// No live server, user settings, reference files, model or GPU is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.CONTINUITY_SOURCE_ROOT || path.join(__dirname, '../..'));
const web = path.join(root, 'web/creator');
const read = file => fs.readFileSync(path.join(web, file), 'utf8');
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-c',
  "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"],
  { cwd: root, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line => line.startsWith('{')));
const css = [...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)]
  .map(match => read(`styles/${match[1]}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
let browser;
const passed = [];
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(catalog => {
    window.__MMC_FAMILIES = catalog;
    window.app = { extensionManager: { setting: { get: key => key === 'Comfy.Locale' ? (window.locale || 'en') : undefined } } };
    window.stored = { refiner: { backend: 'local', model: 'sulphur.safetensors', remoteModel: 'remote-model',
      skill: 'fixture.md', skillModes: { 'fixture.md': 'add' }, temperature: .1, language: 'English' } };
    window.writes = []; window.jobs = []; window.pending = null;
    window.capability = 'supported'; window.capabilityReads = 0;
    window.piece = { prompt: '@subject walks', assets: [{ handle: 'img-1', kind: 'image', filename: 'fixture.png' }],
      subjects: [{ handle: 'subject', from: ['img-1'], description: 'Person', instruction: 'Retain face' }],
      segments: [{ prompt: 'Original detail', prompt_sections: { summary: 'Original summary' },
        refined: { body: 'Earlier rewrite', fields: ['prompt'], enabled: true } }] };
  }, catalog);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'continuity.test') { external.push(url.href); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark-theme"><head><style>${css}
      :root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
      body{margin:0;padding:24px;background:#171718}</style></head><body><button id="anchor">Settings</button></body></html>` });
    if (url.pathname === '/scripts/app.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const app=globalThis.app;' });
    if (url.pathname === '/scripts/widgets.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const ComfyWidgets={};' });
    if (url.pathname === '/scripts/api.js') return route.fulfill({ contentType: 'text/javascript', body: `export const api={
      apiURL:u=>u,addEventListener(){},removeEventListener(){},getUserData:async()=>({status:404,json:async()=>null}),
      storeUserData:async()=>({status:200}),deleteUserData:async()=>({status:204}),
      async fetchApi(url,options={}){
        let body={};
        if(url==='/continuity/refine/capabilities'){
          window.capabilityReads++;
          if(window.capability==='network')throw new Error('Fixture network failure');
          return {ok:window.capability!=='404',status:window.capability==='404'?404:200,
            json:async()=>{if(window.capability==='json')throw new Error('Fixture invalid JSON');
              return window.capability==='supported'?{reference_images:true}
                :window.capability==='false'?{reference_images:false}
                :window.capability==='string'?{reference_images:'true'}:{};}};
        }
        if(url==='/continuity/settings'){
          if(options.method==='POST'){const patch=JSON.parse(options.body);window.writes.push(patch);Object.assign(window.stored,patch);}
          body={settings:window.stored};
        }else if(url==='/continuity/refine/models')body={models:['sulphur.safetensors']};
        else if(url==='/continuity/refine/skills')body={entries:[{name:'fixture.md',kind:'prompt',mode:'add'}]};
        else if(url==='/continuity/refine/remote')body={url:'http://localhost:1234/v1',key_set:false};
        else if(url==='/continuity/refine/remote/models')body={models:['remote-model']};
        return {ok:true,status:200,json:async()=>structuredClone(body)};
      }};` });
    if (url.pathname === '/web/creator/queue.js') return route.fulfill({ contentType: 'text/javascript', body: `
      export const busy=()=>false;
      export const watch=()=>()=>{};
      export async function run(route,payload){
        window.jobs.push(structuredClone(payload));
        if(window.delayNext){window.delayNext=false;await new Promise(resolve=>window.pending=resolve);}
        return {scope:'field',target_scope:payload.scope,field:payload.field,index:payload.index,
          body:'New rewrite',sections:payload.field==='segment'?{summary:'New summary',retention_analysis:'Retain face'}:undefined};
      }` });
    if (url.pathname.startsWith('/web/creator/')) {
      const target = path.resolve(web, '.' + url.pathname.slice('/web/creator'.length));
      assert.ok(target.startsWith(web + path.sep));
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(target, 'utf8') });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://continuity.test/');
  await page.evaluate(async () => {
    window.R = await import('/web/creator/refine.js');
    window.API = await import('/web/creator/api.js'); API.noteSettings(window.stored);
    window.open = () => { window.closeSettings?.(); window.closeSettings = R.openSettings(document.querySelector('#anchor'), () => {}); };
    window.open();
  });
  const check = async (name, run) => { await run(); passed.push(name); console.log('PASS ' + name); };
  const toggle = () => page.locator('.mmc-refine-visual [role=switch]');
  const settle = () => page.waitForTimeout(100);
  await check('Old machine settings and explicit request snapshots default to images on without writes', async () => {
    assert.equal(await page.evaluate(() => R.settings().reference_images), true);
    assert.equal(await page.evaluate(() => R.refineRequest({ model: 'old-model' }).reference_images), true);
    assert.equal(await toggle().getAttribute('aria-checked'), 'true');
    assert.equal(await page.evaluate(() => writes.length), 0);
  });
  await check('The switch persists only refiner input policy and preserves model, skill, references and rewrites', async () => {
    const before = await page.evaluate(() => ({ settings: R.settings(), piece: JSON.stringify(piece) }));
    await toggle().click(); await settle();
    const after = await page.evaluate(() => ({ settings: R.settings(), piece: JSON.stringify(piece), stored }));
    assert.deepEqual(after.settings, { ...before.settings, reference_images: false });
    assert.equal(after.piece, before.piece);
    assert.equal(after.stored.refiner.reference_images, false);
    assert.equal(await toggle().getAttribute('aria-checked'), 'false');
    assert.match(await page.locator('.mmc-refine-visual').innerText(), /text, handles, reference descriptions and usage rules only/);
    assert.doesNotMatch(await page.locator('.mmc-refine-note').innerText(), /reads your attached images/);
    await page.evaluate(() => open()); await settle();
    assert.equal(await toggle().getAttribute('aria-checked'), 'false');
  });
  await check('Images off fails closed against old, unsupported or unreachable servers without submitting a job', async () => {
    const before = await page.evaluate(() => ({ jobs: jobs.length, piece: JSON.stringify(piece) }));
    for (const capability of ['404', 'missing', 'false', 'string', 'network', 'json']) {
      const message = await page.evaluate(async capability => {
        window.capability = capability;
        try { await R.refineField({ kind: 'segment', index: 0, data: piece }, 'summary'); return ''; }
        catch (error) { return error.message; }
      }, capability);
      assert.equal(message, 'Restart ComfyUI to enable text-only refining. No fields were changed.');
      assert.equal(await page.evaluate(() => jobs.length), before.jobs);
      assert.equal(await page.evaluate(() => JSON.stringify(piece)), before.piece);
    }
    assert.equal(await page.evaluate(() => capabilityReads), 6);
    await page.evaluate(() => { window.capability = 'supported'; });
  });
  await check('All six individual fields, a card and the whole timeline send images off', async () => {
    await page.evaluate(async () => {
      for (const field of ['summary', 'retention_analysis', 'prompt'])
        await R.refineField({ kind: 'segment', index: 0, data: piece }, field);
      for (const field of ['prompt', 'soundscape', 'music'])
        await R.refineField({ kind: 'timeline', data: piece }, field);
      await R.refineSegment({ kind: 'segment', index: 0, data: piece });
      await R.refine({ kind: 'field', scope: 'timeline', field: 'all', data: piece });
    });
    const jobs = await page.evaluate(() => window.jobs);
    assert.equal(jobs.length, 8);
    for (const job of jobs) { assert.equal(job.reference_images, false); assert.equal(job.model, 'sulphur.safetensors'); }
    assert.equal(await page.evaluate(() => R.refineRequest().reference_images), false);
    assert.equal(await page.evaluate(() => capabilityReads), 14);
  });
  await check('An in-flight request keeps its snapshot; only the next request uses the changed switch', async () => {
    await page.evaluate(() => { window.delayNext = true; window.inFlight = R.refineField({ kind: 'segment', index: 0, data: piece }, 'summary'); });
    await page.waitForFunction(() => !!pending);
    await toggle().focus(); await page.keyboard.press('Space'); await settle();
    assert.equal(await toggle().getAttribute('aria-checked'), 'true');
    assert.equal(await page.evaluate(() => jobs.at(-1).reference_images), false);
    await page.evaluate(async () => { pending(); await inFlight; await R.refineField({ kind: 'segment', index: 0, data: piece }, 'prompt'); });
    assert.equal(await page.evaluate(() => jobs.at(-1).reference_images), true);
    assert.match(await page.locator('.mmc-refine-note').innerText(), /reads your attached images/);
  });
  await check('Images on keeps its original request path and does not require a capability endpoint', async () => {
    const before = await page.evaluate(() => capabilityReads);
    await page.evaluate(async () => { window.capability = '404'; await R.refineField({ kind: 'segment', index: 0, data: piece }, 'summary'); });
    assert.equal(await page.evaluate(() => capabilityReads), before);
    assert.equal(await page.evaluate(() => jobs.at(-1).reference_images), true);
    await page.evaluate(() => { window.capability = 'supported'; });
  });
  await check('Remote requests honor the same switch without changing endpoint or model selections', async () => {
    await page.evaluate(() => R.saveSettings({ backend: 'remote', reference_images: false }));
    const request = await page.evaluate(() => R.refineRequest());
    assert.equal(request.reference_images, false); assert.equal(request.backend, 'remote'); assert.equal(request.model, 'remote-model');
    assert.equal(await page.evaluate(() => R.settings().model), 'sulphur.safetensors');
    await page.evaluate(() => R.saveSettings({ backend: 'local' }));
  });
  await check('English, Korean, Japanese and Chinese explain both states and retain keyboard switch semantics', async () => {
    for (const [locale, label] of [['en', 'Reference image analysis'], ['ko', '참조 이미지 분석'], ['ja', '参照画像の分析'], ['zh', '参考图像分析']]) {
      await page.evaluate(locale => { window.locale = locale; open(); }, locale); await settle();
      assert.equal(await toggle().getAttribute('aria-label'), label);
      for (const value of ['true', 'false']) { await toggle().click(); await settle(); assert.equal(await toggle().getAttribute('aria-checked'), value); }
      const hint = await page.locator('.mmc-refine-visual').innerText();
      if (locale !== 'en') assert.doesNotMatch(hint, /Off:|Generation references|Reference image analysis/);
    }
  });
  await check('No runtime error or external request occurred', async () => { assert.deepEqual(errors, []); assert.deepEqual(external, []); });
  console.log(JSON.stringify({ passed: passed.length, names: passed }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
