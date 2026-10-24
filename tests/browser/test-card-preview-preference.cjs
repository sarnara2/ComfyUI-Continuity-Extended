// Actual constructor/navigation toggle, actual viewprefs and source resolver.
// Native browser localStorage at a Playwright-fulfilled synthetic origin only.
// Ready-player roots are inert; playback/volume are covered by the media suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const root = path.join(sourceRoot, 'web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const method = (text, name) => {
  const found = text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Production ${name}`); return found[0];
};
const fn = (text, name) => {
  const found = text.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Production ${name}`); return found[0].replace(/^export /, '');
};
const source = read('timeline.js'), prefs = read('viewprefs.js'), preview = read('card-preview.js');
assert.match(method(source, 'constructor'), /this\.previewMode = readViewPrefs\("timeline:preview"\)\.preview !== "off";/);
assert.match(method(source, 'renderNavigation'), /patchViewPrefs\("timeline:preview", \{ preview: this\.previewMode \? "on" : "off" \}\);/);
assert.match(prefs, /context === "timeline:preview"[^\n]*preview: \["on", "off"\]/);
const store = prefs.match(/^const STORE = "([^"]+)";/m)[1];
const adapter = fs.readFileSync(path.join(__dirname, 'test-timeline-header-layout.cjs'), 'utf8');
const prefix = adapter.slice(0, adapter.indexOf('new vm.Script(code,'));
const base = vm.runInNewContext(prefix + ';({code,css});', { require, __dirname, process });
assert.ok(base.code.includes(prefs.replace(/^export /gm, '')), 'Maintained adapter injects actual viewprefs without substitutes');
const code = base.code + `
${preview.match(/^const finite =[^\r\n]*;/m)[0]}
${preview.match(/^const savedRange =[^]*?^\};/m)[0]}
${fn(preview, 'cardPreviewSource')}
window.previewPlayerCreates=0;window.previewVolumeSentinel=Object.freeze({volume:0,muted:true});
const createCardPreview=(source)=>{
 window.previewPlayerCreates++;
 const root=el('div',{class:'mmc-card-preview',text:'Inert ready player','data-source':source.filename});
 return{root,media:window.previewVolumeSentinel,pause(){},suspend(){},resume(){},destroy(){root.remove();}};
};
const pauseCardPreviews=()=>{};
const openReferencePreview=()=>{throw new Error('No media/viewer in preference fixture');};
class RealPreviewBridge {${method(source, 'cardPreview')}}
Subject.prototype.cardPreview=RealPreviewBridge.prototype.cardPreview;
Subject.prototype.renderStrip=function(){
 this.clearCardPreviews();this.stripHost.classList.toggle('individual-preview',this.previewMode);
 this.stripHost.replaceChildren(...this.timeline.segments.map((segment,index)=>el('div',{class:'mmc-tl-card','data-mmc-segment-index':String(index)},
  [el('span',{text:this.cardLabel(segment)}),this.cardPreview(segment,index,{start:index,segments:[segment]})].filter(Boolean))));
};
window.preferenceSegments=[
 {prompt:'Keep raw text unchanged',name:'Custom card',card_id:'ready-1',duration_s:4,hold:true,take:{filename:'adopted.mp4',seed:77}},
 {prompt:'Changed after adoption',duration_s:4,hold:true,refined:{body:'Existing rewrite',enabled:true},take:{filename:'modified-adopted.mp4',seed:88}},
 {kind:'clip',filename:'supplied.mp4',duration_s:4,sound:true},
 {prompt:'Not generated yet',duration_s:4},
];
window.mountReady=options=>{setFixture({segments:preferenceSegments,...options});window.preferenceBefore=JSON.stringify(subject.timeline);return preferenceState();};
window.preferenceState=()=>({on:subject.previewMode,pressed:subject.navigationHost.querySelector('.mmc-tl-individual-preview').getAttribute('aria-pressed'),
 ready:subject.stripHost.querySelectorAll('.mmc-card-preview').length,missing:subject.stripHost.querySelectorAll('.mmc-card-preview-unavailable').length,
 unchanged:JSON.stringify(subject.timeline)===preferenceBefore,commits:subject.commits,calls:subject.calls,volume:previewVolumeSentinel});
mountReady();
`;
new vm.Script(code, { filename: 'preview-preference-actual-source-fixture.js' });
let browser, context, requests = 0, fixtureNavigations = 0;
const errors = [], checks = [];
const check = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
const origin = 'http://continuity-preview-fixture.test/';
const html = `<style>${base.css}:root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0}</style>`;
const configure = async (options = {}) => {
  context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, ...options });
  await context.route('**/*', route => {
    if (route.request().url() === origin) { fixtureNavigations++; return route.fulfill({ contentType: 'text/html', body: html }); }
    requests++; return route.abort();
  });
};
const make = async ({ seed, denied } = {}) => {
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  if (denied) await page.addInitScript(mode => {
    if (mode === 'all') Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Storage denied','SecurityError');}});
    else Storage.prototype.setItem=function(){throw new DOMException('Storage denied','QuotaExceededError');};
  }, denied);
  await page.goto(origin);
  if (seed !== undefined) await page.evaluate(({store,seed})=>{localStorage.clear();if(seed!==null)localStorage.setItem(store,seed);},{store,seed});
  await page.evaluate(`(()=>{${code}})()`); return page;
};
const state = page => page.evaluate(() => preferenceState());
const button = page => page.locator('.mmc-tl-individual-preview');
const stored = page => page.evaluate(store => localStorage.getItem(store), store);
const assertState = async (page,on) => {
  const value=await state(page);assert.equal(value.on,on);assert.equal(value.pressed,String(on));assert.equal(value.ready,on?3:0);assert.equal(value.missing,on?1:0);
  assert.equal(value.unchanged,true);assert.equal(value.commits,0);assert.deepEqual(value.calls,[]);assert.deepEqual(value.volume,{volume:0,muted:true});
};
const reload = async page => {await page.reload();await page.evaluate(`(()=>{${code}})()`);};
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});await configure();
  let page;
  await check('Fresh default ON reveals saved adopted/modified videos and supplied clips without writing preferences or workflow',async()=>{
    page=await make({seed:null});await assertState(page,true);assert.equal(await stored(page),null);
    assert.deepEqual(await page.locator('.mmc-card-preview').evaluateAll(nodes=>nodes.map(node=>node.dataset.source)),['adopted.mp4','modified-adopted.mp4','supplied.mp4']);
  });
  await check('Turning OFF stores only the display enum, removes inert players, and retains every input/media/volume field',async()=>{
    await page.evaluate(()=>{localStorage.setItem('workflow-fixture',JSON.stringify(subject.timeline));localStorage.setItem('unrelated-key','keep-original');window.storageWrites=[];const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){storageWrites.push([key,value]);return original.call(this,key,value);};});
    await button(page).click();await assertState(page,false);
    assert.deepEqual(JSON.parse(await stored(page)),{version:1,records:{'timeline:preview':{preview:'off'}}});
    assert.deepEqual(await page.evaluate(()=>storageWrites.map(row=>row[0])),[store]);
    assert.equal(await page.evaluate(()=>localStorage.getItem('workflow-fixture')===JSON.stringify(subject.timeline)),true);assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-key')),'keep-original');
  });
  await check('Saved OFF survives modal close/reopen, actual page reload and a fresh browser context with persisted native storage',async()=>{
    await page.evaluate(()=>{subject.close();mountReady();});await assertState(page,false);await reload(page);await assertState(page,false);
    const persisted=await context.storageState();await context.close();await configure({storageState:persisted});page=await make();await assertState(page,false);
  });
  await check('Explicit ON survives rerender/reopen/reload and preserves the native button focus and label',async()=>{
    await button(page).focus();await page.keyboard.press('Enter');await assertState(page,true);assert.equal(await button(page).getAttribute('aria-pressed'),'true');
    assert.equal(await button(page).evaluate(node=>node===document.activeElement),true);assert.equal(await button(page).textContent(),'Ready preview');
    await page.evaluate(()=>{subject.render();subject.close();mountReady({language:'ko'});});await assertState(page,true);assert.equal(await button(page).textContent(),'준비된 미리보기');
    await reload(page);await assertState(page,true);assert.deepEqual(JSON.parse(await stored(page)).records['timeline:preview'],{preview:'on'});
  });
  await check('Other saved view contexts remain intact and unsupported audio/workflow fields are never accepted',async()=>{
    await page.close();page=await make({seed:JSON.stringify({version:1,records:{'loras:normal':{tab:'library',query:'swap'},'timeline:preview':{preview:'off',volume:1,muted:false,filename:'do-not-apply.mp4',prompt:'do-not-apply'}}})});
    await assertState(page,false);assert.deepEqual(await page.evaluate(()=>previewViewPrefs.readViewPrefs('timeline:preview')),{preview:'off'});
    await button(page).click();await assertState(page,true);const value=JSON.parse(await stored(page));assert.deepEqual(value.records['loras:normal'],{tab:'library',query:'swap'});assert.deepEqual(value.records['timeline:preview'],{preview:'on'});
  });
  await check('Corrupt, old-version, oversized, array and invalid preview records safely fall back ON and are repairable',async()=>{
    const cases=['{not JSON',JSON.stringify({version:99,records:{'timeline:preview':{preview:'off'}}}),JSON.stringify({version:1,records:{'timeline:preview':{preview:'off'}},padding:'x'.repeat(66000)}),JSON.stringify({version:1,records:[]}),JSON.stringify({version:1,records:{'timeline:preview':{preview:'false'}}})];
    for(const seed of cases){await page.close();page=await make({seed});await assertState(page,true);assert.equal(await stored(page),seed);await button(page).click();await assertState(page,false);assert.deepEqual(JSON.parse(await stored(page)),{version:1,records:{'timeline:preview':{preview:'off'}}});}
  });
  await check('Unavailable or full storage uses safe session-only OFF/ON memory without mutating workflow or throwing',async()=>{
    await context.close();await configure();let denied=await make({denied:'all'});await assertState(denied,true);await button(denied).click();await assertState(denied,false);await denied.evaluate(()=>{subject.close();mountReady();});await assertState(denied,false);await button(denied).click();await assertState(denied,true);await reload(denied);await assertState(denied,true);
    await denied.close();await context.close();await configure();denied=await make({denied:'write'});await assertState(denied,true);await button(denied).click();await assertState(denied,false);await denied.evaluate(()=>{subject.close();mountReady();});await assertState(denied,false);assert.equal(await stored(denied),null);await denied.close();
  });
  assert.equal(requests,0);assert.deepEqual(errors,[]);
  const out=process.env.CONTINUITY_UX_SCREENSHOT_DIR||process.env.CONTINUITY_ARTIFACT_DIR;
  if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'card-preview-preference-results.json'),JSON.stringify({passed:checks.length,checks,requests,fixtureNavigations,errors},null,2));}
  console.log(JSON.stringify({passed:checks.length,requests,fixtureNavigations,errors}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await context?.close();await browser?.close();});
