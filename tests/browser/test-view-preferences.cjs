/* Real frontend constructors, lifecycle/events and view store in isolated Chrome.
 * In-memory inventories only: no live ComfyUI, file import, render or network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, 'web/creator', name), 'utf8');
const strip = source => source.replace(/^import[^;]*;\r?\n/gm, '').replace(/^export /gm, '');
const exportNames = 'readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind';
const storeSource = strip(read('viewprefs.js'));
const storeCode = `(function(){${storeSource}\nreturn {${exportNames}}})()`;
const checkNames = 'pickerSelectionContext,readPickedPaths,writePickedPaths,clearPickedPaths';
const checkCode = `(function(){${strip(read('picker-checks.js'))}\nreturn {${checkNames}}})()`;
const key = 'continuity-extended-view-prefs-v1';
const results = [];
const syncCheck = (name, run) => { run(); results.push(name); console.log(`PASS ${name}`); };
function storeFixture({ raw = null, denied = false, quota = false } = {}) {
  const values = new Map(raw == null ? [] : [[key, raw]]);
  const context = vm.createContext({ localStorage: {
    getItem(name) { if (denied) throw new Error('Storage denied'); return values.get(name) ?? null; },
    setItem(name, value) { if (denied || quota) throw new Error('Storage denied'); values.set(name, value); },
  } });
  vm.runInContext(`globalThis.prefs=${storeCode}`, context);
  return { values, run: expression => {
    const value = vm.runInContext(`JSON.stringify(${expression})`, context);
    return value === undefined ? undefined : JSON.parse(value);
  } };
}
syncCheck('Corrupt/version/type storage safely starts empty, and unknown/non-view fields are excluded', () => {
  for (const raw of ['{bad', JSON.stringify({version:99,records:{'loras:normal':{tab:'stacks'}}}), '[]']) {
    const fixture = storeFixture({raw}); assert.deepEqual(fixture.run(`prefs.readViewPrefs('loras:normal')`), {});
  }
  const fixture = storeFixture();
  assert.deepEqual(fixture.run(`prefs.patchViewPrefs('loras:normal',{tab:'stacks',query:'Face',folder:':favorites',loras:['secret'],prompt:'secret',scope:'all',strength:9,selected:'file'})`), {tab:'stacks',query:'Face',folder:':favorites'});
  assert.deepEqual(fixture.run(`prefs.patchViewPrefs('unknown',{query:'no'})`), {});
  assert.deepEqual(fixture.run(`prefs.patchViewPrefs('loras:swap',{tab:'stacks',query:'x'.repeat(513),folder:7})`), {});
});
syncCheck('Fresh per-context patches merge external updates, own fields only, and bounded records/strings', () => {
  const fixture = storeFixture();
  fixture.run(`prefs.patchViewPrefs('loras:normal',{query:'old'})`);
  fixture.values.set(key, JSON.stringify({version:1,records:{'loras:normal':{query:'fresh'},'presets:browse':{scope:'cast'}}}));
  fixture.run(`prefs.patchViewPrefs('loras:normal',{tab:'stacks'})`);
  assert.deepEqual(fixture.run(`prefs.readViewPrefs('loras:normal')`), {query:'fresh',tab:'stacks'});
  assert.deepEqual(fixture.run(`prefs.readViewPrefs('presets:browse')`), {scope:'cast'});
  assert.deepEqual(fixture.run(`prefs.patchViewPrefs('wears:family',Object.create({family:'hidden'}))`), {});
  assert.deepEqual(fixture.run(`prefs.patchViewPrefs('wears:family',Object.defineProperty({},'family',{get(){throw new Error('Not a data property')}}))`), {});
  assert.deepEqual(fixture.run(`prefs.patchViewPrefs('wears:family',{family:'x'.repeat(97)})`), {});
  fixture.run(`prefs.clearViewPrefs('loras:normal')`);
  assert.deepEqual(fixture.run(`prefs.readViewPrefs('presets:browse')`), {scope:'cast'});
  fixture.run(`prefs.clearViewPrefs()`); assert.deepEqual(JSON.parse(fixture.values.get(key)).records, {});
  fixture.values.set(key, 'x'.repeat(65537)); assert.deepEqual(fixture.run(`prefs.readViewPrefs('presets:browse')`), {});
  fixture.run(`(()=>{prefs.clearViewPrefs();const kinds=['image','video','audio','renders','guides','refmods','meshes'];for(let mask=1;mask<128;mask++){const selected=kinds.filter((_,at)=>mask&(1<<at));prefs.patchViewPrefs(prefs.pickerViewContext({kinds:selected}),{query:'q'.repeat(512),kind:selected[0],sort:'name'});}prefs.patchViewPrefs('loras:normal',{query:'latest'});})()`);
  const bounded = JSON.parse(fixture.values.get(key));
  assert.ok(Object.keys(bounded.records).length <= 64);
  assert.ok(fixture.values.get(key).length <= 65536);
  assert.deepEqual(fixture.run(`prefs.readViewPrefs('loras:normal')`), {query:'latest'});
});
syncCheck('Denied/quota storage uses session fallback, while compatible contexts and semantic kinds stay separate', () => {
  for (const options of [{denied:true},{quota:true}]) {
    const fixture = storeFixture(options); fixture.run(`prefs.patchViewPrefs('loras:normal',{query:'kept'})`);
    fixture.run(`prefs.patchViewPrefs('presets:browse',{scope:'style'})`);
    assert.deepEqual(fixture.run(`prefs.readViewPrefs('loras:normal')`), {query:'kept'});
  }
  const fixture = storeFixture();
  assert.equal(fixture.run(`prefs.pickerViewContext({kinds:['video','image'],single:false})`), fixture.run(`prefs.pickerViewContext({kinds:['image','video'],single:false})`));
  assert.notEqual(fixture.run(`prefs.pickerViewContext({kinds:['image','video']})`), fixture.run(`prefs.pickerViewContext({kinds:['image']})`));
  assert.equal(fixture.run(`prefs.pickerViewKind({kinds:['image','video','renders'],kind:'video',only:'video'},'image')`), 'video');
  assert.equal(fixture.run(`prefs.pickerViewKind({kinds:['audio'],kind:'video',only:'audio'},'video')`), 'audio');
});

const dom = read('dom.js');
const fn = name => dom.match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'))[0].replace(/^export /, '');
const css = ['base','editor','picker','overlays','presets','loras'].map(name => read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const code = `
const {${exportNames}}=${storeCode};
const {${checkNames}}=${checkCode};
window.viewPrefs={${exportNames}};
${fn('el')}
const t=(text,values={})=>text.replace(/\\{([^}]+)\\}/g,(_,name)=>values[name]??name);
const icon=()=>el('span'),svg=()=>el('span'),ICONS={image:'',video:'',audio:'',cube:''};
const mountOverlay=node=>{document.body.append(node);return()=>node.remove();};
const dismissable=node=>()=>node.remove();
const drawFrame=()=>{};
const stillUrl=()=>null;
const viewUrl=()=>{throw new Error('Unexpected media fetch');};
const greyField=()=> '#222';
const queueState=()=>({remaining:0}),dropQueued=()=>{throw new Error('Unexpected queue change');};
const takeOptions=()=>['full','object','scene','style','edit'],takeWord=value=>value;
const trimLabel=()=>'',cropLabel=()=>'';
window.fixture={pickerPrefs:{favorites:[],lastShelf:{}},externalFolders:[],externalCalls:[],builtinCalls:[],prefsWrites:0,commits:0,
 assets:[{path:'clip2.mp4',name:'clip2.mp4',kind:'video',subfolder:'',mtime:2,size:1},{path:'clip1.mp4',name:'clip1.mp4',kind:'video',subfolder:'',mtime:1,size:1}],externalHold:[],holdExternal:false,
 loraPrefs:{folder:'real',favorites:[],used:{},pinned:{},wears:{}},folderCalls:[],loraHold:[],holdLora:false,
 presetRows:[{id:'p1',scope:'piece',folder:'Work',name:'First'}],presetHold:[],holdPresets:false};
const listAssets=async(options)=>{fixture.builtinCalls.push(options);return fixture.assets;};
const listedFolders=()=>[],listingTruncated=()=>false;
const loadPickerPrefs=async()=>fixture.pickerPrefs;
const savePickerPrefs=value=>{fixture.prefsWrites++;fixture.pickerPrefs=value;};
const listExternalFolders=async()=>({folders:fixture.externalFolders});
const listExternalAssets=async({folder,kind})=>{fixture.externalCalls.push({folder,kind});if(fixture.holdExternal)return new Promise(resolve=>fixture.externalHold.push({folder,resolve}));return {assets:[],truncated:false};};
const checkExternalAssets=async()=>{throw new Error('View-only compatibility fixture must not restore unscoped checks');};
const loraPrefsNow=()=>fixture.loraPrefs,loadLoraPrefs=async()=>fixture.loraPrefs;
const saveLoraPrefs=value=>(fixture.prefsWrites++,fixture.loraPrefs=value);
const primeSettings=callback=>callback(),uiSetting=(key,value)=>value,forgetLoraNames=()=>{};
const loraBody=()=>({loras:[],folders:[{path:'',count:0},{path:'real',count:0},{path:'other',count:0}]});
const listLoras=async({folder})=>{fixture.folderCalls.push(folder);if(fixture.holdLora)return new Promise(resolve=>fixture.loraHold.push({folder,resolve}));return loraBody();};
const listLorasNamed=async()=>({loras:[],folders:[]});
const listPresets=async()=>[],familyOf=()=>({label:'MiniMax H3'});
const S={DEFAULT_VIDEO_FAMILY:'h3',routing:()=>false,checkpointsOf:()=>[],checkpointsFor:()=>[],checkpointLabels:()=>({}),checkpointWhen:()=>({}),
 FAMILY_LABEL:{h3:'MiniMax H3'},subjectLoras:()=>[],sendFor:()=> 'pictures',isRefMod:()=>false};
const GUIDE_LORA_STRENGTH={default:0.75},ROLES=[],BUILTIN=[];
const P={SCOPES:['piece','shot','prestage','cast','style'],SCOPE_LABEL:{piece:'Piece',shot:'Shot',prestage:'Prestage',cast:'Cast',style:'Style'},
 listPresets:async()=>fixture.holdPresets?new Promise(resolve=>fixture.presetHold.push(resolve)):fixture.presetRows,
 starredStyles:async()=>new Set()};
const styleModule={styleRows:()=>[{id:'style1',scope:'style',folder:'Film',name:'Film style'}],ATLAS:{}};
const loraBase=entry=>entry.name;
(()=>{${strip(read('wears.js'))}\nwindow.WearsPanel=WearsPanel;})();
const WearsPanel=window.WearsPanel;
(()=>{${strip(read('picker.js'))}\nwindow.Picker=Picker;})();
(()=>{${strip(read('loras.js'))}\nwindow.LoraManager=LoraManager;})();
(()=>{${strip(read('presetlib.js')).replace('import("./presets/stylelib.js")','Promise.resolve(styleModule)')}\nwindow.PresetLibrary=PresetLibrary;})();
// Keep the real constructor/lifecycle/tab/filter/folder methods. The preset
// card inspector is irrelevant to view memory and need not load body files.
PresetLibrary.prototype.renderGrid=function(){this.grid.replaceChildren(el('div',{text:this.scope+' / '+this.shelf+' / '+this.query}));};
PresetLibrary.prototype.renderInspector=function(){};
PresetLibrary.prototype.loadMods=function(){};
PresetLibrary.prototype.renderBar=function(){this.bar.replaceChildren(this.search);};
window.openPickerFixture=(options={})=>{window.subject?.close(null);window.subject=new Picker({kinds:['image','video','audio'],kind:'video',...options},()=>{});subject.mount();};
window.openLoraFixture=(options={})=>{window.subject?.close(null);window.subject=new LoraManager({state:{loras:[],prompt:'unchanged',sound:[{at_s:0}]},onChange:()=>fixture.commits++,family:'h3',...options},()=>{});subject.mount();};
window.openPresetFixture=(options={})=>{window.subject?.close(null);window.subject=new PresetLibrary(options,()=>{});subject.mount();};
window.resetFixture=()=>{window.subject?.close(null);window.subject=null;viewPrefs.clearViewPrefs();clearPickedPaths();fixture.externalCalls=[];fixture.builtinCalls=[];fixture.folderCalls=[];fixture.prefsWrites=0;fixture.commits=0;fixture.pickerPrefs={favorites:[],lastShelf:{}};fixture.externalFolders=[];fixture.holdExternal=false;fixture.holdLora=false;fixture.holdPresets=false;fixture.loraPrefs={folder:'real',favorites:[],used:{},pinned:{},wears:{}};};
`;
new vm.Script(code,{filename:'real-view-preferences-fixture.js'});
let browser, requests=0;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/*',route=>{
   if(route.request().url()==='http://continuity.test/')return route.fulfill({contentType:'text/html',body:'<html><body></body></html>'});
   requests++;return route.abort();
 });
 const boot=async()=>{await page.goto('http://continuity.test/');await page.addStyleTag({content:css});await page.evaluate('(()=>{'+code+'})()');};
 const ready=async()=>page.waitForFunction(()=>subject.loaded||subject.rowsReady);
 const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
 await boot();
 await check('Picker resumes visible tab/query/sort after close/reopen, with no selection or import settings',async()=>{
  await page.evaluate(()=>{resetFixture();openPickerFixture({referenceOptions:{takes:'edit',ref_size:'match'}});});await ready();
  await page.locator('.mmc-search').fill('Clip');await page.locator('.mmc-picker-sort').selectOption('name');
  await page.evaluate(()=>{subject.selected=[subject.assets[0]];subject.selectTab('audio');subject.referenceDefaults.takes='style';subject.close(null);subject=null;openPickerFixture({referenceOptions:{takes:'edit',ref_size:'match'}});});await ready();
  assert.deepEqual(await page.evaluate(()=>({kind:subject.kind,query:subject.search.value,sort:subject.sortSelect.value,selected:subject.selected,marked:subject.marked,defaults:subject.referenceDefaults,organize:subject.organize,writes:fixture.prefsWrites})),
   {kind:'audio',query:'Clip',sort:'name',selected:[],marked:[],defaults:{takes:'edit',ref_size:'match'},organize:false,writes:0});
 });
 await check('Module reload retains local view; constrained contexts do not erase broader tab memory',async()=>{
  await boot();await page.evaluate(()=>openPickerFixture());await ready();
  assert.deepEqual(await page.evaluate(()=>({kind:subject.kind,query:subject.search.value,sort:subject.sortOrder})),{kind:'audio',query:'Clip',sort:'name'});
  await page.evaluate(()=>openPickerFixture({kinds:['image'],kind:'image',only:'image',single:true}));await ready();assert.equal(await page.evaluate(()=>subject.kind),'image');
  await page.evaluate(()=>openPickerFixture({kinds:['audio'],kind:'audio',only:'audio'}));await ready();assert.equal(await page.evaluate(()=>subject.kind),'audio');
  await page.evaluate(()=>openPickerFixture());await ready();assert.equal(await page.evaluate(()=>subject.kind),'audio');
 });
 await check('Display order stays separate from clicked attachment order and fixed semantic kind fallback',async()=>{
  await page.evaluate(()=>{resetFixture();openPickerFixture();});await ready();
  await page.evaluate(()=>{subject.toggle(subject.assets[0]);subject.toggle(subject.assets[1]);});
  await page.locator('.mmc-picker-sort').selectOption('name');
  assert.deepEqual(await page.evaluate(()=>({visible:subject.visible().map(row=>row.name),selected:subject.selected.map(row=>row.name)})),{visible:['clip1.mp4','clip2.mp4'],selected:['clip2.mp4','clip1.mp4']});
  await page.evaluate(()=>{const options={kinds:['image','video','renders'],kind:'video',only:'video'};viewPrefs.patchViewPrefs(viewPrefs.pickerViewContext(options),{kind:'image'});openPickerFixture(options);});await ready();
  assert.equal(await page.evaluate(()=>subject.kind),'video');
 });
 await check('Authoritative external folder alone refreshes on reopen/reclick; stale replies stay rejected',async()=>{
  await page.evaluate(()=>{resetFixture();fixture.externalFolders=[{id:'one',label:'One'},{id:'two',label:'Two'}];fixture.pickerPrefs.externalFolder='one';openPickerFixture();});await ready();
  assert.deepEqual(await page.evaluate(()=>fixture.externalCalls),[{folder:'one',kind:'video'}]);
  await page.evaluate(()=>openPickerFixture());await ready();assert.equal(await page.evaluate(()=>fixture.externalCalls.length),2);
  await page.evaluate(()=>subject.selectExternalFolder('one'));await ready();assert.equal(await page.evaluate(()=>fixture.externalCalls.length),3);
  await page.evaluate(()=>{fixture.holdExternal=true;subject.selectExternalFolder('one');subject.selectExternalFolder('two');});
  await page.evaluate(()=>{fixture.externalHold.find(x=>x.folder==='two').resolve({assets:[],truncated:false});});await ready();
  await page.evaluate(()=>{fixture.externalHold.find(x=>x.folder==='one').resolve({assets:[{path:'stale',kind:'video'}]});});
  assert.deepEqual(await page.evaluate(()=>({folder:subject.externalFolder,assets:subject.externalAssets})),{folder:'two',assets:[]});
  await page.evaluate(()=>{subject.close(null);subject=null;fixture.externalFolders=[];fixture.holdExternal=false;openPickerFixture();});await ready();assert.equal(await page.evaluate(()=>subject.externalFolder),null);
 });
 await check('LoRA query/tab/empty virtual shelf resume without changing workflow or semantic preferences',async()=>{
  await page.evaluate(()=>{resetFixture();openLoraFixture();});await ready();
  await page.locator('.mmc-search').fill('Face');await page.evaluate(()=>subject.setScope(':favorites'));await ready();
  await page.evaluate(()=>{subject.setTab('stacks');subject.close();subject=null;openLoraFixture();});await ready();
  assert.deepEqual(await page.evaluate(()=>({tab:subject.tab,scope:subject.scope,query:subject.search.value,display:subject.stacksPane.style.display,commits:fixture.commits,folder:fixture.loraPrefs.folder,state:subject.state})),
   {tab:'stacks',scope:':favorites',query:'Face',display:'',commits:0,folder:'real',state:{loras:[],prompt:'unchanged',sound:[{at_s:0}]}});
  await page.waitForFunction(()=>document.activeElement===subject.stackTab);
 });
 await check('LoRA reveal and swap force valid views but do not overwrite ordinary landing memory',async()=>{
  const saved=await page.evaluate(()=>JSON.stringify(viewPrefs.readViewPrefs('loras:normal')));
  await page.evaluate(()=>openLoraFixture({reveal:'other/look.safetensors'}));await ready();
  assert.deepEqual(await page.evaluate(()=>({tab:subject.tab,query:subject.search.value})),{tab:'loras',query:''});
  assert.equal(await page.evaluate(()=>JSON.stringify(viewPrefs.readViewPrefs('loras:normal'))),saved);
  await page.evaluate(()=>{viewPrefs.patchViewPrefs('loras:swap',{query:'Swap'});openLoraFixture({swapping:'original.safetensors'});subject.setTab('stacks');});await ready();
  assert.deepEqual(await page.evaluate(()=>({tab:subject.tab,tabs:subject.tabs.length,query:subject.search.value})),{tab:'loras',tabs:1,query:'Swap'});
  assert.equal(await page.evaluate(()=>JSON.stringify(viewPrefs.readViewPrefs('loras:normal'))),saved);
 });
 await check('Missing real LoRA folder falls back after inventory; stale old-folder reply never paints current scope',async()=>{
  await page.evaluate(()=>{resetFixture();viewPrefs.patchViewPrefs('loras:normal',{folder:'removed'});openLoraFixture();});await ready();
  assert.deepEqual(await page.evaluate(()=>({scope:subject.scope,calls:fixture.folderCalls,folder:fixture.loraPrefs.folder,commits:fixture.commits})),{scope:'',calls:['removed',''],folder:'real',commits:0});
  await page.evaluate(()=>{fixture.holdLora=true;subject.setScope('real');subject.setScope('other');});
  await page.evaluate(()=>fixture.loraHold.find(x=>x.folder==='other').resolve({loras:[],folders:[{path:'other'}]}));await ready();
  await page.evaluate(()=>fixture.loraHold.find(x=>x.folder==='real').resolve({loras:[{name:'stale.safetensors'}],folders:[{path:'real'}]}));
  assert.deepEqual(await page.evaluate(()=>({scope:subject.scope,rows:subject.rows})),{scope:'other',rows:[]});
 });
 await check('Preset generic scope and per-scope query/shelf resume with clean selection/style defaults',async()=>{
  await page.evaluate(()=>{resetFixture();openPresetFixture();});await ready();
  await page.locator('.mmc-search').fill('First');await page.locator('[data-shelf="Work"]').click();
  await page.evaluate(()=>subject.selectScope('shot'));await page.locator('.mmc-search').fill('Shot');
  await page.evaluate(()=>{subject.selectScope('piece');subject.selected={id:'ignored'};subject.body={prompt:'ignored'};subject.strength=99;subject.close();subject=null;openPresetFixture();});await ready();
  assert.deepEqual(await page.evaluate(()=>({scope:subject.scope,query:subject.search.value,shelf:subject.shelf,selected:subject.selected,body:subject.body,keys:[...subject.keys],strength:subject.strength,attributes:subject.attributes})),
   {scope:'piece',query:'First',shelf:'Work',selected:null,body:null,keys:[],strength:0.75,attributes:null});
  await page.evaluate(()=>subject.selectScope('shot'));assert.equal(await page.locator('.mmc-search').inputValue(),'Shot');
 });
 await check('Preset caller Cast/reveal and restyle Style win without overwriting generic landing',async()=>{
  const saved=await page.evaluate(()=>viewPrefs.readViewPrefs('presets:browse').scope);
  await page.evaluate(()=>openPresetFixture({scope:'cast',reveal:'refmod:cast/person'}));await ready();
  assert.deepEqual(await page.evaluate(()=>({scope:subject.scope,query:subject.search.value,shelf:subject.shelf})),{scope:'cast',query:'',shelf:'all'});
  await page.evaluate(()=>openPresetFixture({scope:'cast',restyle:{frame:'',onRestyle:()=>fixture.commits++}}));await ready();
  await page.waitForFunction(()=>subject.atlasReady);
  assert.equal(await page.evaluate(()=>subject.scope),'style');
  assert.equal(await page.evaluate(()=>viewPrefs.readViewPrefs('presets:browse').scope),saved);
  assert.equal(await page.evaluate(()=>fixture.commits),0);
 });
 await check('Module reload also restores LoRA, preset and Wears display records without applying anything',async()=>{
  await page.evaluate(()=>{viewPrefs.patchViewPrefs('loras:normal',{tab:'stacks',query:'Remember',folder:':recent'});viewPrefs.patchViewPrefs('presets:browse',{scope:'cast'});viewPrefs.patchViewPrefs('presets:scope:cast',{query:'Person',shelf:'fav'});viewPrefs.patchViewPrefs('wears:family',{family:'flux'});});
  await boot();await page.evaluate(()=>openLoraFixture());await ready();
  assert.deepEqual(await page.evaluate(()=>({tab:subject.tab,query:subject.search.value,folder:subject.scope,commits:fixture.commits})),{tab:'stacks',query:'Remember',folder:':recent',commits:0});
  await page.evaluate(()=>openPresetFixture());await ready();
  assert.deepEqual(await page.evaluate(()=>({scope:subject.scope,query:subject.search.value,shelf:subject.shelf,selected:subject.selected,commits:fixture.commits})),{scope:'cast',query:'Person',shelf:'fav',selected:null,commits:0});
  assert.equal(await page.evaluate(()=>new WearsPanel({families:()=>[{id:'flux'}]}).family().id),'flux');
 });
 await check('Preset folder validates only after current list/atlas, missing becomes All; close rejects pending list',async()=>{
  await page.evaluate(()=>{resetFixture();viewPrefs.patchViewPrefs('presets:scope:piece',{shelf:'Work'});fixture.holdPresets=true;openPresetFixture();subject.renderShelves();});
  assert.equal(await page.evaluate(()=>subject.shelf),'Work');
  await page.evaluate(()=>fixture.presetHold.shift()([{id:'x',scope:'piece',folder:'Work'}]));await ready();assert.equal(await page.evaluate(()=>subject.shelf),'Work');
  await page.evaluate(()=>{subject.close();subject=null;openPresetFixture();fixture.presetHold.shift()([]);});await ready();assert.equal(await page.evaluate(()=>subject.shelf),'all');
  await page.evaluate(()=>{openPresetFixture();const closed=subject;closed.close();window.closedPreset=closed;fixture.presetHold.shift()([{id:'stale',scope:'piece'}]);});
  assert.deepEqual(await page.evaluate(()=>closedPreset.rows),[]);
  await page.evaluate(()=>{fixture.holdPresets=false;viewPrefs.patchViewPrefs('presets:scope:style',{shelf:'Film'});openPresetFixture({scope:'style'});subject.renderShelves();});
  assert.equal(await page.evaluate(()=>subject.shelf),'Film');await page.waitForFunction(()=>subject.atlasReady);assert.equal(await page.evaluate(()=>subject.shelf),'Film');
 });
 await check('Wears remembers displayed family only, current-host fallback never writes member/send or commit',async()=>{
  const report=await page.evaluate(()=>{
   resetFixture();const member={handle:'person',send:{h3:'pictures'},wears:[{name:'keep.safetensors'}]};const before=JSON.stringify(member);
   const families=[{id:'h3',label:'H3',reads:{pictures:true}},{id:'flux',label:'Flux',reads:{pictures:true}}];
   const host={families:()=>families,looks:()=>[],redraw:()=>{},touch:()=>fixture.commits++,commit:()=>fixture.commits++};
   const first=new WearsPanel(host);first.tab(member,families[1],false).click();const reopened=new WearsPanel(host);
   const other=new WearsPanel({...host,families:()=>[families[0]]});
   return {family:reopened.family().id,fallback:other.family().id,unchanged:JSON.stringify(member)===before,commits:fixture.commits,record:viewPrefs.readViewPrefs('wears:family')};
  });assert.deepEqual(report,{family:'flux',fallback:'h3',unchanged:true,commits:0,record:{family:'flux'}});
 });
 assert.deepEqual(pageErrors,[]);assert.equal(requests,0);
 console.log(JSON.stringify({passed:results.length,requests,sourceRoot:root,checks:results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
