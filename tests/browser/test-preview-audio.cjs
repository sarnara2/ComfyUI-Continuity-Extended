// Actual ES modules and native HTMLVideoElement properties. Synthetic settings
// and empty media only; no live server, user data, generation or audio playback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const web = path.join(root, 'web/creator');
const catalogRun = spawnSync(process.env.PYTHON_EXECUTABLE_PATH || 'python', ['-c', "import sys;sys.path.insert(0,'tests');import layout;print(layout.catalog_json())"], {cwd:root,encoding:'utf8'});
assert.equal(catalogRun.status, 0, catalogRun.stderr);
const catalog = JSON.parse(catalogRun.stdout.split(/\r?\n/).find(line=>line.startsWith('{')));
let browser;
(async()=>{
  browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors = [], external = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(catalog=>{
    window.__MMC_FAMILIES=catalog;
    window.app={extensionManager:{setting:{get:()=> 'en'}}};
    window.stored={autoplay_previews:false};window.writes=[];
  },catalog);
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='continuity.test'){external.push(url.href);return route.abort();}
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><body><button id="outside">Outside</button><div id="settings"></div><div id="players"></div></body>'});
    if(url.pathname==='/scripts/app.js')return route.fulfill({contentType:'text/javascript',body:'export const app=window.app;'});
    if(url.pathname==='/scripts/widgets.js')return route.fulfill({contentType:'text/javascript',body:'export const ComfyWidgets={};'});
    if(url.pathname==='/scripts/api.js')return route.fulfill({contentType:'text/javascript',body:`export const api={apiURL:u=>u,addEventListener(){},removeEventListener(){},async fetchApi(url,options={}){let body={};if(url==='/continuity/settings'){if(options.method==='POST'){const patch=JSON.parse(options.body);writes.push(patch);Object.assign(stored,patch);}body={settings:stored};}return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(body))};}};`});
    if(url.pathname.startsWith('/web/creator/')){
      const target=path.resolve(web,'.'+url.pathname.slice('/web/creator'.length));
      assert.ok(target.startsWith(web+path.sep));
      let body=fs.readFileSync(target,'utf8');
      if(url.pathname.endsWith('/settings.js'))body=body.replace('class SettingsPage {','export class SettingsPage {');
      if(url.pathname.endsWith('/fullscreen.js'))body=body.replace('class Fullscreen {','export class Fullscreen {');
      return route.fulfill({contentType:'text/javascript',body});
    }
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://continuity.test/');
  await page.evaluate(async()=>{
    window.API=await import('/web/creator/api.js');
    const {SettingsPage}=await import('/web/creator/settings.js');
    const {Stage}=await import('/web/creator/stage.js');
    const {Fullscreen}=await import('/web/creator/fullscreen.js');
    API.noteSettings(stored);
    window.panel=Object.create(SettingsPage.prototype);panel.settings={...stored};
    panel.render=()=>document.querySelector('#settings').replaceChildren(panel.nodesCard());
    panel.render();
    window.stage=Object.create(Stage.prototype);stage.result={url:'',name:'fixture.mp4',isImage:false};
    document.querySelector('#players').append(stage.video());
    window.shell=Object.create(Fullscreen.prototype);shell.dock=document.querySelector('#players');
    const tile=document.createElement('button');document.body.append(tile);shell.review(stage.result,tile);
    for(const video of document.querySelectorAll('video'))Object.assign(video.style,{display:'block',width:'200px',height:'100px',background:'#222'});
  });
  const setting=page.locator('[data-key="preview_audio"]');
  const selected=()=>setting.locator('[aria-pressed="true"]').allTextContents();
  assert.deepEqual(await selected(),['Muted by default']);
  const video=page.locator('.mmc-stage-video');
  const review=page.locator('.mmc-fs-review-media');
  for(const player of [video,review]){
    assert.equal(await player.evaluate(node=>node.muted),true);
    await player.hover();assert.equal(await player.evaluate(node=>node.muted),true);
    await page.locator('#outside').hover();assert.equal(await player.evaluate(node=>node.muted),true);
    await player.evaluate(node=>{node.muted=false;node.volume=.35;});
    await player.hover();await page.locator('#outside').hover();
    assert.equal(await player.evaluate(node=>node.muted),false,'Native manual choice survives default pointer movement');
  }
  await setting.getByRole('button',{name:'Sound on hover',exact:true}).click();
  await page.waitForFunction(()=>stored.preview_audio==='hover');
  assert.deepEqual(await selected(),['Sound on hover']);
  assert.deepEqual(await page.evaluate(()=>writes.at(-1)),{preview_audio:'hover'});
  assert.equal(await page.evaluate(()=>stored.autoplay_previews),false);
  for(const player of [video,review]){
    await player.hover();assert.equal(await player.evaluate(node=>node.muted),false);
    await page.locator('#outside').hover();assert.equal(await player.evaluate(node=>node.muted),true);
  }
  await setting.getByRole('button',{name:'Muted by default',exact:true}).click();
  await page.waitForFunction(()=>stored.preview_audio==='muted');
  assert.deepEqual(await selected(),['Muted by default']);
  await page.evaluate(async()=>{panel.settings=await API.loadSettings();panel.render();});
  assert.deepEqual(await selected(),['Muted by default'],'Synthetic save/reopen retains only the selected audio mode');
  for(const player of [video,review]){
    await player.hover();assert.equal(await player.evaluate(node=>node.muted),true);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS native Stage/review default, opt-in hover, manual volume, exclusive setting and synthetic persistence');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
