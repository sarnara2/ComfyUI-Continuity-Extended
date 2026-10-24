// Real LoRA manager, controls, state edit helpers and CSS in isolated Chrome.
// Inventory/preferences/presets are in-memory fixtures, not a live render test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT, 'web/creator')
  : path.resolve(__dirname, '../../web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const fn = (source, name) => {
  const found = source.match(new RegExp(`(?:export )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Production function ${name}`);
  return found[0].replace(/^export /, '');
};
const manager = read('loras.js').replace(/^import [^;]+;\r?\n/gm, '').replace(/^export /gm, '');
const thumbnailHelpers = read('lora-thumbnails.js').replace(/^export /gm, '');
const viewHelpers = read('viewprefs.js').replace(/^export /gm, '');
const icons = read('dom.js').match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /,'');
const state = read('state.js');
const stateHelpers = ['loraModes','addLora','newLora','removeLora','toggleLora','replaceLora']
  .map(name => fn(state,name)).join('\n');
const findLora = state.match(/^export const findLora =[^]*?;/m)[0].replace(/^export /,'');
const css = ['base','editor','picker','overlays','loras'].map(name => {
  const found = read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/);
  assert.ok(found, `Production CSS ${name}`); return found[1];
}).join('\n');
const ko = read('locales/ko.js').replace(/^export const /m,'window.ko = ');
const code = `
${fn(read('dom.js'),'el')}
// Production helper imported by the manager, isolated from fixture bindings.
const {readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind}=(()=>{
${viewHelpers}
return {readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind};
})();
const DEFAULT_VIDEO_FAMILY = 'h3';
const checkpointsOf = family => family === 'single' ? [] : ['plain','ref'];
const turboStrength = () => 1;
${findLora}
${stateHelpers}
const S = {DEFAULT_VIDEO_FAMILY,DEFAULT_STRENGTH:1,findLora,loraModes,addLora,removeLora,toggleLora,replaceLora,
  checkpointsOf,claimsBoth:(entry,family)=>loraModes(entry,family).length === checkpointsOf(family).length,
  routing:family=>family!=='single',checkpointsFor:()=>['ref'],checkpointLabels:()=>({plain:'Plain',ref:'Ref2VA'}),
  checkpointWhen:()=>({plain:'Patch plain',ref:'Patch reference'}),loraAudioOf:family=>family==='h3',loraUncondOf:family=>family==='ideogram4',
  serializeLoras:entries=>JSON.parse(JSON.stringify(entries)),FAMILY_LABEL:{h3:'MiniMax H3',single:'Single model'},
};
${icons}
${fn(read('dom.js'),'svg')}
const drawFrame = () => {};
const familyOf = family => ({label:family==='h3'?'MiniMax H3':'Single model'});
let locale='en';
const t = (text,values={})=>(locale==='ko'?window.ko[text]||text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
const fixtureRows = [
 {name:'style/face_v1.safetensors',title:'Face identity',base:'face_v1',version:'v1',model_id:42,strength:0.4,trained_words:['faceword'],sources:['sidecar']},
 {name:'style/face_v2.safetensors',title:'Face identity',base:'face_v2',version:'v2',model_id:42,strength:0.6,trained_words:['faceword2'],sources:['sidecar']},
 {name:'library/camera.safetensors',title:'Camera motion',base:'camera',strength:0.8,trained_words:['cam'],sources:['sidecar']},
 {name:'library/light.safetensors',title:'Light style',base:'light',strength:0.5,trained_words:['light'],sources:['sidecar']},
 {name:'library/swap.safetensors',title:'New identity',base:'swap',strength:0.7,trained_words:['newword'],sources:['sidecar']},
 {name:'style/turbo.safetensors',base:'turbo',strength:4,trained_words:[],sources:[]},
];
let prefs,commits=0,details=[],presetRows=[],presetBodies={},saved=[],deleted=[],namedCalls=[],folderCalls=[];
let namedHold=false,namedDeferred=[];
const loraPrefsNow=()=>prefs;
const loadLoraPrefs=async()=>prefs;
const saveLoraPrefs=value=>(prefs=value);
const primeSettings=callback=>callback();
const uiSetting=(key,fallback)=>fallback;
const forgetLoraNames=()=>{};
const listLoras=async({folder,force})=>{folderCalls.push({folder,force});return{loras:fixtureRows.filter(row=>!folder||row.name.startsWith(folder+'/')),folders:[{path:'library',count:3},{path:'style',count:3},{path:'',count:6}]};};
const namedBody=names=>({loras:fixtureRows.filter(row=>names.includes(row.name)),missing:names.filter(name=>!fixtureRows.some(row=>row.name===name)),folders:[]});
const listLorasNamed=async names=>{namedCalls.push([...names]);if(namedHold)return new Promise(resolve=>namedDeferred.push({names:[...names],resolve}));return namedBody(names);};
const loraPreviewUrl=()=> 'data:video/mp4;base64,';
const openLoraDetail=async(row,options)=>{details.push({name:row.name,options});};
const listPresets=async()=>presetRows;
const loadBody=async row=>presetBodies[row.id];
const savePreset=async body=>{saved.push(body);};
const deletePreset=async id=>{deleted.push(id);};
const mountOverlay=overlay=>{document.body.append(overlay);return()=>overlay.remove();};
const NativeObserver=window.IntersectionObserver;
window.IntersectionObserver=class{constructor(){this.targets=new Set();}observe(v){this.targets.add(v);}unobserve(v){this.targets.delete(v);}disconnect(){this.targets.clear();this.disconnected=true;}};
${thumbnailHelpers}
${manager}
window.Subject=LoraManager;
window.closeFixture=()=>{for(const overlay of document.querySelectorAll('.mmc-overlay'))overlay.remove();};
window.setFixture=(options={})=>{
 if(window.subject&&!subject.closed)subject.close();
 // Each pre-existing manager scenario starts independently. Do not clear or
 // mock the original LoRA/application prefs; only the new view-only store.
 clearViewPrefs();
 locale=options.language||'en';commits=0;details=[];namedCalls=[];folderCalls=[];saved=[];deleted=[];namedHold=!!options.hold;namedDeferred=[];
 prefs={folder:options.folder??'library',favorites:[],used:{},pinned:{},wears:{}};
 const entries=options.entries??[
  {name:'style/face_v1.safetensors',strength:1.23,enabled:true,modes:['ref'],triggers:['kept'],audio:0.35},
  {name:'style/face_v2.safetensors',strength:0.63,enabled:false,modes:['plain'],triggers:['second'],audio:0.7},
  {name:'missing/gone.safetensors',strength:-0.4,enabled:true,modes:['plain'],triggers:['oldword']},
 ];
 const state={loras:JSON.parse(JSON.stringify(entries)),prompt:'Unchanged @subject',segments:[{prompt:'Keep original',duration_s:14.2}],sound:[{filename:'source.mp4',at_s:0,in_s:0,out_s:14.2}]};
 window.subject=new Subject({state,onChange:()=>{commits++;},unified:options.unified!==false,family:options.family||'h3',
  targets:options.targets||['ref'],swapping:options.swapping||null,turbo:options.turbo||null,
  contextLabel:options.contextLabel?t(options.contextLabel):''},()=>{});
 subject.mount();
 return JSON.stringify(state);
};
window.fixtureReport=()=>({state:subject.state,commits,details:details.map(x=>x.name),namedCalls,folderCalls,prefs,saved,deleted});
window.pickDetailVersion=name=>details.at(-1).options.onPick(name);
window.resolveNamed=()=>{for(const deferred of namedDeferred.splice(0))deferred.resolve(namedBody(deferred.names));};
window.prepareStacks=()=>{presetRows=[{id:'stack1',name:'My saved stack',builtin:false,sections:['loras']}];presetBodies={stack1:{loras:[{name:'library/light.safetensors',strength:0.92,enabled:false,modes:['plain'],triggers:['presetword'],audio:0.2}]}};};
setFixture();
`;
new vm.Script(code,{filename:'lora-unified-production-fixture.js'});
let browser,requests=0;const checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});}
const artifacts=process.env.CONTINUITY_UX_SCREENSHOT_DIR;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',error=>{throw error;});
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><head><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}@media(max-width:640px){.mmc-overlay{padding:12px}}</style></head><body></body></html>');
 await page.evaluate(ko);
 await page.evaluate('(()=>{'+code+'})()');
 const ready=async()=>page.waitForFunction(()=>subject.loaded&&subject.attachedPending.size===0);
 const reset=async options=>{await page.evaluate(options=>setFixture(options),options||{});await ready();};
 await ready();
 await check('Three separate tabs, unified grouping, exact attached patch order, no opening edits',async()=>{
  assert.deepEqual(await page.evaluate(()=>({tabs:[...subject.tabs].map(x=>x.textContent),names:[...subject.addedGrid.children].map(x=>x.dataset.loraName),commits:fixtureReport().commits})),
   {tabs:['LoRAs','LoRA library','Stacks'],names:['style/face_v1.safetensors','style/face_v2.safetensors','missing/gone.safetensors'],commits:0});
  assert.equal(await page.locator('.mmc-lora-added .mmc-lora-ctl').count(),3);
  assert.equal(await page.locator('.mmc-lora-grid .mmc-lora-ctl').count(),0);
  assert.equal(await page.locator('.mmc-lora-added-status').last().textContent(),'Metadata unavailable — the saved settings are kept.');
  if(artifacts){fs.mkdirSync(artifacts,{recursive:true});await page.locator('.mmc-modal').screenshot({path:path.join(artifacts,'lora-unified-desktop.png')});}
 });
 await check('Named hydration only reads attached names outside current library folder',async()=>{
  assert.deepEqual(await page.evaluate(()=>fixtureReport().namedCalls),[['style/face_v1.safetensors','style/face_v2.safetensors','missing/gone.safetensors']]);
  assert.equal(await page.locator('.mmc-lora-grid [data-lora-name="style/face_v1.safetensors"]').count(),0);
 });
 await check('Search and folder filtering never hide attached controls',async()=>{
  await page.getByRole('button',{name:'LoRA library',exact:true}).click();
  await page.locator('.mmc-search').fill('notfound');assert.equal(await page.locator('.mmc-lora-added-card').count(),3);
  await page.locator('.mmc-search').fill('');await page.locator('.mmc-folder').selectOption('style');await ready();
  assert.equal(await page.locator('.mmc-lora-added-card').count(),3);
  assert.equal(await page.locator('.mmc-lora-grid .mmc-lora-ctl').count(),0);
 });
 await check('Selected library click removes only its exact file and never unmutes another held entry',async()=>{
  const before=await page.evaluate(()=>JSON.parse(JSON.stringify(subject.state)));
  await page.locator('.mmc-lora-grid .mmc-lora-art').first().click();await page.waitForTimeout(440);
  assert.deepEqual(await page.evaluate(()=>subject.state),{...before,loras:before.loras.filter(entry=>entry.name!=='style/face_v1.safetensors')});
  assert.equal(await page.evaluate(()=>fixtureReport().commits),1);
 });
 await check('Library version browsing and detail version choice are view only',async()=>{
  const before=await page.evaluate(()=>JSON.stringify(subject.state));
  await page.locator('.mmc-lora-grid .mmc-ver').last().click();
  assert.equal(await page.evaluate(()=>JSON.stringify(subject.state)),before);
  await page.locator('.mmc-lora-grid .mmc-lora-art').first().dblclick();
  await page.evaluate(()=>pickDetailVersion('style/face_v1.safetensors'));
  assert.equal(await page.evaluate(()=>JSON.stringify(subject.state)),before);
 });
 await check('Unselected double-click is preview-only; next add cannot replay its cancelled first click',async()=>{
  await reset({entries:[]});
  await page.getByRole('button',{name:'LoRA library',exact:true}).click();
  await page.locator('.mmc-lora[data-lora-name="library/camera.safetensors"] .mmc-lora-art').dblclick();
  await page.waitForTimeout(440);
  assert.deepEqual(await page.evaluate(()=>({names:subject.state.loras.map(e=>e.name),details:fixtureReport().details})),{names:[],details:['library/camera.safetensors']});
  await page.locator('.mmc-lora[data-lora-name="library/light.safetensors"] .mmc-lora-art').click();await page.waitForTimeout(440);await ready();
  assert.deepEqual(await page.evaluate(()=>subject.state.loras.map(e=>e.name)),['library/light.safetensors']);
 });
 await check('Single add preserves actual sidecar defaults and canonical attached-tab list after gesture',async()=>{
  const report=await page.evaluate(()=>fixtureReport());assert.equal(report.state.loras[0].strength,0.5);assert.deepEqual(report.state.loras[0].triggers,['light']);
  assert.equal(await page.locator('.mmc-lora-added-card').count(),1);assert.equal(report.commits,1);
 });
 await check('Fast intentional adds to different files do not cancel each other',async()=>{
  await reset({entries:[]});
  await page.getByRole('button',{name:'LoRA library',exact:true}).click();
  await page.locator('.mmc-lora[data-lora-name="library/camera.safetensors"] .mmc-lora-art').click();
  await page.locator('.mmc-lora[data-lora-name="library/light.safetensors"] .mmc-lora-art').click();await page.waitForTimeout(440);
  assert.deepEqual(await page.evaluate(()=>subject.state.loras.map(e=>e.name)),['library/camera.safetensors','library/light.safetensors']);
 });
 await check('Keyboard selection is immediate; a second intentional activation deselects the exact file',async()=>{
  await reset({entries:[]});await page.getByRole('button',{name:'LoRA library',exact:true}).click();const art=page.locator('.mmc-lora[data-lora-name="library/camera.safetensors"] .mmc-lora-art');
  await art.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.mmc-lora-added-card').count(),1);
  await page.locator('.mmc-lora[data-lora-name="library/camera.safetensors"] .mmc-lora-art').focus();await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>fixtureReport().commits),2);assert.equal(await page.locator('.mmc-lora-added-card').count(),0);
 });
 await check('Top strength, checkpoint, soundtrack and triggers use original canonical controls',async()=>{
  await reset();const top=()=>page.locator('.mmc-lora-added-card[data-lora-name="style/face_v1.safetensors"]');
  await top().locator('.mmc-lora-num').fill('1.75');await top().locator('.mmc-lora-num').dispatchEvent('change');
  await top().locator('.mmc-seg-btn').first().click();
  await top().locator('.mmc-lora-sound input').fill('0.15');await top().locator('.mmc-lora-sound input').dispatchEvent('input');await top().locator('.mmc-lora-sound input').dispatchEvent('change');
  await top().locator('.mmc-trig-add').fill('myword');await top().locator('.mmc-trig-add').press('Enter');
  const entry=await page.evaluate(()=>subject.state.loras[0]);assert.equal(entry.strength,1.75);assert.deepEqual(entry.modes,['plain']);assert.equal(entry.audio,0.15);assert.deepEqual(entry.triggers,['kept','myword']);
 });
 await check('Mute keeps setup and top remove only removes chosen entry, including missing file',async()=>{
  const before=await page.evaluate(()=>JSON.parse(JSON.stringify(subject.state.loras[0])));
  await page.locator('.mmc-lora-added-card').first().locator('.mmc-lora-mute').click();
  const after=await page.evaluate(()=>subject.state.loras[0]);assert.deepEqual(after,{...before,enabled:false});
  await page.locator('.mmc-lora-added-card[data-lora-name="missing/gone.safetensors"] button[title="Remove missing/gone.safetensors"]').click();
  assert.deepEqual(await page.evaluate(()=>subject.state.loras.map(e=>e.name)),['style/face_v1.safetensors','style/face_v2.safetensors']);
 });
 await check('Custom trigger vocabulary survives switching off and refreshing a top-only file',async()=>{
  await reset();const top=()=>page.locator('.mmc-lora-added-card').first();
  await top().locator('.mmc-trig-word').click();
  await top().locator('.mmc-lora-num').fill('0.9');await top().locator('.mmc-lora-num').dispatchEvent('change');
  assert.equal(await top().locator('.mmc-trig-word').textContent(),'kept');
  assert.equal(await top().locator('.mmc-trig.own').getAttribute('aria-pressed'),'false');
  assert.deepEqual(await page.evaluate(()=>fixtureReport().prefs.used['style/face_v1.safetensors'].custom),['kept']);
 });
 await check('Family pin and unpin retain original policy and prevent unusable pinned removal',async()=>{
  await reset();const top=()=>page.locator('.mmc-lora-added-card').first();
  await top().locator('button[title^="Pin "]').click();
  assert.equal(await top().locator('button[title^="Remove "]').count(),0);
  assert.equal(await page.evaluate(()=>fixtureReport().prefs.wears.h3[0].name),'style/face_v1.safetensors');
  await top().locator('button[title^="Pinned to "]').click();
  assert.equal(await top().locator('button[title^="Remove "]').count(),1);assert.equal(await page.evaluate(()=>fixtureReport().prefs.wears.h3),undefined);
 });
 await check('Top swap opens unchanged one-shot manager and updates upper list from canonical result',async()=>{
  await reset();await page.locator('.mmc-lora-added-card').first().locator('button[title^="Swap "]').click();
  const swap=page.locator('.mmc-modal:not(.mmc-lora-unified)');await swap.locator('.mmc-lora[data-lora-name="library/swap.safetensors"] .mmc-lora-art').click();
  assert.equal(await swap.count(),0);assert.equal(await page.locator('.mmc-lora-added-card').first().getAttribute('data-lora-name'),'library/swap.safetensors');
  const first=await page.evaluate(()=>subject.state.loras[0]);assert.equal(first.strength,0.7);assert.deepEqual(first.modes,['ref']);assert.deepEqual(first.triggers,['newword']);
 });
 await check('Saved Stacks keep browse/add/replace/save; returning LoRAs redraws applied settings',async()=>{
  await page.evaluate(()=>prepareStacks());await page.getByRole('button',{name:'Stacks',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.mmc-stack-title')?.textContent==='My saved stack');
  assert.equal(await page.locator('.mmc-lora-added').isVisible(),false);assert.equal(await page.locator('.mmc-modal-bar').isVisible(),false);
  await page.locator('.mmc-stack .mmc-add').click();
  assert.equal(await page.locator('.mmc-lora-added-card').count(),1);
  assert.equal(await page.locator('.mmc-lora-added-card .mmc-lora-num').inputValue(),'0.92');
  assert.equal(await page.locator('.mmc-lora-added-card .mmc-lora-mute').getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Stacks',exact:true}).click();await page.locator('.mmc-stack-name').fill('Saved setup');await page.locator('.mmc-stack-save .mmc-add').click();
  assert.equal(await page.evaluate(()=>fixtureReport().saved[0].name),'Saved setup');assert.equal(await page.evaluate(()=>fixtureReport().saved[0].data.loras[0].strength),0.92);
 });
 await check('Default caller and swapping keep original grid controls, version switching and removal',async()=>{
  await reset({unified:false,folder:'style'});assert.equal(await page.locator('.mmc-lora-added').count(),0);
  assert.equal(await page.locator('.mmc-lora-grid .mmc-lora-ctl').count(),1);
  await page.locator('.mmc-lora-grid .mmc-lora-art').first().click();
  assert.equal(await page.evaluate(()=>subject.state.loras.length),2);
  await reset({unified:true,swapping:'style/face_v1.safetensors'});assert.equal(await page.locator('.mmc-lora-unified').count(),0);assert.equal(await page.locator('.mmc-tab').count(),1);
 });
 await check('Late metadata and closing cannot re-open modal, edit data or discard focused trigger typing',async()=>{
  await page.evaluate(()=>setFixture({hold:true}));await page.waitForFunction(()=>subject.loaded);await page.waitForTimeout(50);
  const input=page.locator('.mmc-lora-added-card').first().locator('.mmc-trig-add');await input.fill('in progress');
  await page.evaluate(()=>resolveNamed());await page.waitForTimeout(30);assert.equal(await input.inputValue(),'in progress');assert.equal(await input.evaluate(element=>element===document.activeElement),true);
  await page.evaluate(()=>subject.close());await page.evaluate(()=>resolveNamed());await page.waitForTimeout(30);assert.equal(await page.locator('.mmc-overlay').count(),0);
  assert.equal(await page.evaluate(()=>subject.thumbnails.watch.disconnected),true);
 });
 await check('320px Korean large-type layout gives each selected tab its own bounded scroll area with no horizontal overflow',async()=>{
  await page.setViewportSize({width:320,height:850});await page.evaluate(()=>document.documentElement.style.setProperty('--mmc-type','1.6'));
  const entries=Array.from({length:18},(_,at)=>({name:'missing/long_filename_'+at+'.safetensors',strength:0.8,enabled:at%2===0,modes:['ref'],triggers:['word'+at]}));
  await reset({entries,language:'ko'});
  const dimensions=await page.evaluate(()=>({body:document.body.scrollWidth,viewport:innerWidth,modal:subject.modal.scrollWidth,modalWidth:subject.modal.clientWidth,
   added:subject.addedGrid.scrollHeight>subject.addedGrid.clientHeight,grid:subject.grid.clientHeight,addedHeight:subject.addedGrid.clientHeight,
   panes:[subject.addedGrid,subject.grid].map(element=>getComputedStyle(element).overflowY)}));
  assert.ok(dimensions.body<=dimensions.viewport);assert.ok(dimensions.modal<=dimensions.modalWidth+1);assert.ok(dimensions.added);assert.equal(dimensions.grid,0);assert.ok(dimensions.addedHeight>70);assert.deepEqual(dimensions.panes,['auto','auto']);
  await page.getByRole('button',{name:'LoRA 라이브러리',exact:true}).click();
  assert.equal(await page.locator('.mmc-lora-added').isVisible(),false);assert.ok(await page.locator('.mmc-lora-grid').evaluate(element=>element.clientHeight>80));
  if(artifacts)await page.locator('.mmc-modal').screenshot({path:path.join(artifacts,'lora-unified-ko-320-large.png')});
 });
 await check('Current render inputs, generation schema and unrelated sound/segment settings are never rewritten by view',async()=>{
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>document.documentElement.style.removeProperty('--mmc-type'));await reset();
  const before=await page.evaluate(()=>JSON.stringify(subject.state));await page.getByRole('button',{name:'LoRA library',exact:true}).click();await page.locator('.mmc-search').fill('light');
  assert.equal(await page.evaluate(()=>JSON.stringify(subject.state)),before);
  assert.deepEqual(await page.evaluate(()=>Object.keys(subject.state)),['loras','prompt','segments','sound']);
 });
 await check('Global context label, tabs and close remain visible at desktop and 320px with enlarged Korean type',async()=>{
  for(const [width,height,scale] of [[1366,768,1.25],[320,850,1.25],[320,850,1.6]]) {
   await page.setViewportSize({width,height});
   await page.evaluate(value=>document.documentElement.style.setProperty('--mmc-type',String(value)),scale);
   await reset({language:'ko',contextLabel:'Global LoRAs · all segments'});
   const dimensions=await page.evaluate(()=>{
    const head=subject.modal.querySelector('.mmc-modal-head'),rect=head.getBoundingClientRect();
    const controls=[...head.children].map(element=>{
     const box=element.getBoundingClientRect();
     return{text:element.textContent,left:box.left,right:box.right,top:box.top,bottom:box.bottom,
      width:box.width,height:box.height,scroll:element.scrollWidth,client:element.clientWidth};
    });
    return{viewport:innerWidth,head:{left:rect.left,right:rect.right},controls,
     body:document.body.scrollWidth,modal:subject.modal.scrollWidth,modalClient:subject.modal.clientWidth};
   });
   assert.ok(dimensions.body<=dimensions.viewport,JSON.stringify({width,scale,dimensions}));
   assert.ok(dimensions.modal<=dimensions.modalClient+1,JSON.stringify({width,scale,dimensions}));
   assert.equal(dimensions.controls.filter(item=>item.text==='전역 LoRA · 모든 세그먼트').length,1);
   assert.ok(dimensions.controls.every(item=>item.width>0&&item.height>0&&item.left>=dimensions.head.left-1
    &&item.right<=dimensions.head.right+1&&item.scroll<=item.client+1),JSON.stringify({width,scale,dimensions}));
   const close=dimensions.controls.find(item=>item.text==='✕');
   for(const item of dimensions.controls.filter(item=>item!==close)) {
    assert.ok(item.right<=close.left||item.left>=close.right||item.bottom<=close.top||item.top>=close.bottom,
     JSON.stringify({width,scale,overlap:[item,close]}));
   }
  }
 });
 assert.equal(requests,0);console.log(JSON.stringify({checks,passed:checks.length,requests,scope:'isolated production-source UI/state helpers; not live ComfyUI/GPU'},null,2));
 await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
