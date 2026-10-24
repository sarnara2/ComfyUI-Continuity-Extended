/* Actual Picker, DOM, view/check stores and cascade. All listing/metadata/media
 * adapters are RAM-only; no ComfyUI, user folders, imports or GPU work. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const out = process.env.CONTINUITY_ARTIFACT_DIR ? path.resolve(process.env.CONTINUITY_ARTIFACT_DIR) : null;
if (out) fs.mkdirSync(out, {recursive:true});
const read = file => fs.readFileSync(path.join(root, 'web/creator', file), 'utf8');
const strip = source => source.replace(/^import[^;]*;\r?\n/gm, '').replace(/^export /gm, '');
const locales={en:{}};
for(const name of ['ko','ja','zh'])locales[name]=vm.runInNewContext(`${strip(read(`locales/${name}.js`))}\nJSON.parse(JSON.stringify(${name}));`);
const cssOrder = read('styles.js').match(/const CSS = \[([^]*?)\]\.join/)[1]
  .replace(/\/\/[^\r\n]*/g,'').split(',').map(name=>name.trim()).filter(Boolean);
const css = cssOrder
  .map(file => read(`styles/${file}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const code = `
${strip(read('dom.js'))}
const {readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind}=(()=>{
${strip(read('viewprefs.js'))}
return {readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerViewKind};})();
const {pickerSelectionContext,readPickedPaths,writePickedPaths,clearPickedPaths}=(()=>{
${strip(read('picker-checks.js'))}
return {pickerSelectionContext,readPickedPaths,writePickedPaths,clearPickedPaths};})();
const t=(text,values={})=>(window.translations?.[text]||text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
const pixel='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#315b6d"/></svg>');
const stillUrl=asset=>asset.kind==='audio'?null:pixel;
const viewUrl=()=>pixel; // RAM thumbnail for the existing explicit crop setting.
const greyField=()=> '#222';
const trimLabel=setting=>setting.trim?'Configured range':'';
const cropLabel=crop=>crop?'Crop':'';
const takeOptions=asset=>asset.kind==='audio'?['full','style']:['full','object','scene','style','edit'];
const takeWord=key=>key;
const queueState=()=>({remaining:0});
const dropQueued=()=>{throw Error('Unexpected queue change');};
const listingTruncated=()=>false;
const listedFolders=()=>[];
window.rows=[
 {path:'one.mp4',name:'one.mp4',kind:'video',subfolder:'',size:2048,mtime:10,width:480,height:832,duration:12.012},
 {path:'two.mp4',name:'two.mp4',kind:'video',subfolder:'',size:4096,mtime:20,width:768,height:432,duration:7},
 {path:'three.mp4',name:'three.mp4',kind:'video',subfolder:'',size:128,mtime:30},
 {path:'portrait.png',name:'portrait.png',kind:'image',subfolder:'',mtime:40,width:512,height:512},
 {path:'voice.wav',name:'voice.wav',kind:'audio',subfolder:'',mtime:50,duration:9},
 {path:'continuity/control/guide.png',name:'guide.png',kind:'image',subfolder:'continuity/control',mtime:60},
];
window.outputRows=[{path:'output:render.mp4',name:'render.mp4',kind:'video',subfolder:'',mtime:90}];
window.modRows=[{path:'refmod:person.safetensors',name:'person.safetensors',kind:'image',mod:true,tokens:30,mtime:10}];
window.meshRows=[{path:'mesh:person.glb',name:'person.glb',kind:'mesh',lift:{faces:200000},mtime:10}];
window.registry=[{id:'grant',name:'Registered root'},{id:'other',name:'Second root'}];
const externalRow=(directory,name,kind)=>({path:'external:grant/'+(directory?directory+'/':'')+name,name,kind,subfolder:directory,size:1234,mtime:11,width:640,height:480,duration:kind==='video'?8:undefined});
window.tree={
 '':{folders:[{name:'empty',directory:'empty'},{name:'nested',directory:'nested'},{name:'<script>safe</script>',directory:'safe'}],assets:[externalRow('','root.mp4','video'),externalRow('','root.png','image')]},
 nested:{folders:[{name:'inner',directory:'nested/inner'}],assets:[externalRow('nested','deep.mp4','video'),externalRow('nested','deep.wav','audio')]},
 'nested/inner':{folders:[],assets:[externalRow('nested/inner','leaf.mp4','video')]},
 empty:{folders:[],assets:[]},safe:{folders:[],assets:[]},
};
window.serverPrefs={favorites:[],lastShelf:{}};
window.calls={listing:[],directory:[],metadata:[],imports:[],build:0,resolve:0,serverWrites:0};
const clone=value=>JSON.parse(JSON.stringify(value));
const loadPickerPrefs=async()=>clone(serverPrefs);
const savePickerPrefs=value=>{serverPrefs=clone(value);calls.serverWrites++;};
const listExternalFolders=async()=>({folders:clone(registry)});
const listAssets=async options=>{calls.listing.push(clone(options));return clone(options.root==='output'?outputRows:options.root==='refmods'?modRows:options.root==='meshes'?meshRows:rows);};
const matches=(row,kind)=>kind==='renders'||kind==='refmods'||row.kind===kind;
const listExternalAssets=async options=>{
 calls.directory.push(clone(options));
 if(window.directoryPending&&options.directory===directoryPending.path){await new Promise(resolve=>directoryPending.release=resolve);}
 const entry=tree[options.directory];if(!entry)throw Error('Directory missing');
 return {directory:options.directory,parent:options.directory?options.directory.split('/').slice(0,-1).join('/'):null,
   folders:clone(entry.folders),assets:clone(entry.assets.filter(row=>matches(row,options.kind))),truncated:false};
};
const checkExternalAssets=async options=>{
 calls.metadata.push(clone(options));
 if(window.metadataPending)await new Promise(resolve=>metadataPending.release=resolve);
 if(window.metadataError)throw Error('Metadata temporarily unavailable');
 const all=Object.values(tree).flatMap(entry=>entry.assets);
 const assets=options.paths.map(token=>all.find(row=>row.path===token&&matches(row,options.kind))).filter(Boolean);
 return {assets:clone(assets),missing:options.paths.filter(token=>!assets.some(row=>row.path===token))};
};
const importExternalAssets=async picks=>{calls.imports.push(clone(picks));return picks.map((row,index)=>({...row,path:'imported/copy'+index+'.mp4',subfolder:'imported'}));};
const buildPlate=()=>{calls.build++;throw Error('Unexpected sheet build');};
const removeExternalFolder=async id=>{registry=registry.filter(row=>row.id!==id);};
const chooseExternalFolder=()=>{throw Error('Unexpected OS chooser');};
const revealFolder=()=>{throw Error('Unexpected folder launch');};
const revealExternalFolder=revealFolder;
${strip(read('picker.js'))}
const productionLoad=Picker.prototype.load;
Picker.prototype.load=function(...args){return this.loading=productionLoad.apply(this,args);};
Picker.prototype.view=function(asset){window.previews.push(asset.path);};
// This fixture exercises explicit legacy persistence. Production attachment
// pickers now use fresh checks on every opening; covered by test_cast_picker_selection.
window.baseOptions={kinds:['image','video','audio','renders','guides','refmods','meshes'],kind:'video',selectionPurpose:'test-attachments',rememberSelection:true};
window.mountFixture=async (options={})=>{
 window.subject?.close(null);window.previews=[];
 window.subject=new Picker({...baseOptions,...options},result=>{calls.resolve++;window.result=result;});subject.mount();
 await subject.loading;return subject.kind;
};
window.reset=()=>{
 window.subject?.close(null);window.subject=null;clearViewPrefs();clearPickedPaths();
 registry=[{id:'grant',name:'Registered root'},{id:'other',name:'Second root'}];
 serverPrefs={favorites:[],lastShelf:{}};window.metadataPending=null;window.metadataError=false;window.directoryPending=null;
 calls={listing:[],directory:[],metadata:[],imports:[],build:0,resolve:0,serverWrites:0};
};
window.checkContext=(kind,options={})=>pickerSelectionContext({...baseOptions,...options},kind);
window.paths=()=>subject.selected.map(row=>row.path);
window.pick=path=>subject.toggle(subject.activeAssets().find(row=>row.path===path));
window.cell=path=>subject.cells.get(path);
window.saveChecks=(kind,paths,options={})=>writePickedPaths(checkContext(kind,options),paths);
window.fixtureStore={readViewPrefs,patchViewPrefs,clearViewPrefs,pickerViewContext,pickerSelectionContext,readPickedPaths,writePickedPaths,clearPickedPaths};
Object.assign(window,fixtureStore);
`;
new vm.Script(code,{filename:'picker-hierarchy-memory-fixture.js'});
const tests=[],geometries=[],errors=[];
let browser,requests=0,navigations=0;
const check=async(name,run)=>{await run();tests.push(name);console.log('PASS '+name);};
const html=`<html class="dark-theme" style="--comfy-menu-bg:#191919;--fg-color:#ededed;--input-text:#ddd;--descrip-text:#aaa;--bg-color:#191919;--primary-background:#0b8ce9;--mmc-type:1"><style>${css}</style><body style="background:#111;margin:0"></body></html>`;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.route('**/*',route=>{
   if(route.request().url()==='http://picker.fixture.invalid/'){navigations++;return route.fulfill({contentType:'text/html',body:html});}
   requests++;return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
 const initialize=async()=>{await page.goto('http://picker.fixture.invalid/');await page.evaluate(`(()=>{${code}})()`);};
 await initialize();
 await check('Registered root lists immediate folders plus direct files; folder cells never claim attachment checks',async()=>{
   await page.evaluate(async()=>{reset();await mountFixture();await subject.selectExternalFolder('grant');});
   assert.deepEqual(await page.evaluate(()=>calls.directory[0]),{folder:'grant',kind:'video',directory:''});
   assert.equal(await page.locator('.mmc-picker-folder').count(),3);
   assert.deepEqual(await page.evaluate(()=>[...subject.cells.keys()]),['external:grant/root.mp4']);
   assert.equal(await page.locator('.mmc-picker-folder input,.mmc-picker-folder[aria-selected]').count(),0);
   assert.equal(await page.locator('.mmc-picker-folder script').count(),0);
   assert.deepEqual(await page.evaluate(()=>paths()),[]);
 });
 await check('Empty directory, parent and breadcrumb/root navigation work independently of kind and checks',async()=>{
   await page.locator('.mmc-picker-folder').filter({hasText:'empty'}).click();
   await page.waitForFunction(()=>subject.loaded&&subject.externalDirectory==='empty');
   assert.equal(await page.locator('.mmc-empty').count(),1);
   await page.locator('.mmc-picker-directory-up').click();
   await page.waitForFunction(()=>subject.loaded&&subject.externalDirectory==='');
   await page.locator('.mmc-picker-folder').filter({hasText:'nested'}).click();
   await page.waitForFunction(()=>subject.loaded&&subject.externalDirectory==='nested');
   await page.evaluate(()=>pick('external:grant/nested/deep.mp4'));
   await page.locator('.mmc-picker-folder').click();
   await page.waitForFunction(()=>subject.loaded&&subject.externalDirectory==='nested/inner');
   assert.equal(await page.locator('.mmc-picker-directory-crumb').count(),2);
   assert.deepEqual(await page.evaluate(()=>paths()),['external:grant/nested/deep.mp4']);
   await page.locator('.mmc-picker-directory-root').click();
   await page.waitForFunction(()=>subject.loaded&&subject.externalDirectory==='');
   assert.equal(await page.locator('.mmc-picker-directory-up').isDisabled(),true);
 });
 await check('Stale directory responses cannot replace a newer navigation and unsafe relative paths are ignored',async()=>{
   assert.equal(await page.evaluate(async()=>{
     directoryPending={path:'nested'};const old=subject.openExternalDirectory('nested');
     while(!directoryPending.release)await new Promise(resolve=>setTimeout(resolve,0));
     await subject.openExternalDirectory('empty');directoryPending.release();await old;directoryPending=null;
     const before=calls.directory.length;subject.openExternalDirectory('../escape');subject.openExternalDirectory('/absolute');subject.openExternalDirectory('a\\b');
     return subject.externalDirectory==='empty'&&subject.externalAssets.length===0&&before===calls.directory.length;
   }),true);
 });
 await check('External view reopens at remembered grant/directory without scanning builtin roots; revoked grant falls back safely',async()=>{
   const before=await page.evaluate(async()=>{
     await subject.openExternalDirectory('nested/inner');subject.setViewMode('small');subject.sortSelect.value='name';subject.sortSelect.dispatchEvent(new Event('change'));
     subject.close(null);calls.listing=[];await mountFixture();return {directory:subject.externalDirectory,folder:subject.externalFolder,view:subject.viewMode,sort:subject.sortOrder,walks:calls.listing.length};
   });
   assert.deepEqual(before,{directory:'nested/inner',folder:'grant',view:'small',sort:'name',walks:0});
   assert.equal(await page.evaluate(async()=>{subject.close(null);registry=registry.filter(row=>row.id!=='grant');await mountFixture();const safe=subject.externalFolder===null&&subject.externalDirectory===''&&subject.builtinLoaded;registry.unshift({id:'grant',name:'Registered root'});return safe;}),true);
 });
 await check('All three modes reuse per-file controls and never change settings, selection order, sheets or source metadata',async()=>{
   assert.equal(await page.evaluate(async()=>{
     reset();await mountFixture({referenceOptions:{takes:'full',ref_size:'max'}});pick('two.mp4');pick('one.mp4');
     subject.settings.set('one.mp4',{trim:{start:1,end:3},track:'picture+sound',takes:'edit',ref_size:'match',crop:{x:.1,y:0,w:.8,h:1}});subject.cuts.set('portrait.png',false);subject.sheet=['portrait.png'];
     const before=JSON.stringify([subject.assets,paths(),[...subject.settings],[...subject.cuts],subject.sheet]);
     for(const mode of ['small','details','large']){subject.setViewMode(mode);const tile=cell('one.mp4');if(!tile.querySelector('.mmc-cell-trim')||!tile.querySelector('.mmc-cell-crop')||!tile.querySelector('.mmc-cell-star')||!tile.querySelector('.mmc-cell-reference'))return false;}
     return before===JSON.stringify([subject.assets,paths(),[...subject.settings],[...subject.cuts],subject.sheet]);
   }),true);
 });
 await check('Details expose fresh listed facts and native checkbox selection without preview/bubbling; capacity refusal leaves it unchecked',async()=>{
   await page.evaluate(()=>subject.setViewMode('details'));
   assert.match(await page.locator('.mmc-picker-detail-meta').first().innerText(),/File path/);
   await page.evaluate(()=>{subject.options.capacity=()=>({used:0,max:2,filesLeft:2});subject.options.single=false;});
   const checkbox=page.locator('.mmc-cell').filter({hasText:'three.mp4'}).locator('.mmc-picker-check');
   await checkbox.click();assert.equal(await checkbox.isChecked(),false);
   assert.deepEqual(await page.evaluate(()=>paths()),['two.mp4','one.mp4']);
   await page.locator('.mmc-cell').filter({hasText:'one.mp4'}).locator('.mmc-picker-check').click();
   await checkbox.focus();await page.keyboard.press('Space');
   assert.deepEqual(await page.evaluate(()=>paths()),['two.mp4','three.mp4']);
   assert.deepEqual(await page.evaluate(()=>previews),[]);
 });
 await check('Details keep audio filenames and image/mod/mesh/render actions and permit selected-checkbox deselection',async()=>{
   for(const kind of ['audio','image','refmods','meshes','renders']){
     await page.evaluate(async kind=>{reset();await mountFixture({kind});subject.setViewMode('details');},kind);
     assert.equal(await page.locator('.mmc-cell-name').count()>0,true,kind);
     assert.equal(await page.locator('.mmc-picker-detail-meta').count()>0,true,kind);
     const checkBox=page.locator('.mmc-picker-check').first();await checkBox.click();assert.equal(await checkBox.isChecked(),true);await checkBox.click();assert.equal(await checkBox.isChecked(),false);
   }
 });
 await check('Changing view breaks file double-click pairing; actual details double-click still views without changing picks',async()=>{
   assert.deepEqual(await page.evaluate(async()=>{
     reset();await mountFixture();cell('one.mp4').click();subject.setViewMode('details');cell('one.mp4').click();
     const single={paths:paths(),previews:[...previews]};subject.lastClick=null;cell('two.mp4').click();cell('two.mp4').click();return {single,after:paths(),previews};
   }),{single:{paths:[],previews:[]},after:[],previews:['two.mp4']});
 });
 await check('Ordered checks survive close and current-kind reopen; old trim/crop/reference recipes are not restored',async()=>{
   assert.deepEqual(await page.evaluate(async()=>{
     reset();await mountFixture({referenceOptions:{takes:'full',ref_size:'max'}});pick('two.mp4');pick('one.mp4');subject.settings.set('two.mp4',{track:'sound',trim:{start:1,end:2},takes:'style',ref_size:'match'});subject.cuts.set('portrait.png',true);
     subject.close(null);await mountFixture({referenceOptions:{takes:'object',ref_size:'match'}});
     return {paths:paths(),settings:subject.settings.size,cuts:subject.cuts.size,defaults:subject.referencePick(subject.selected[0]),imports:calls.imports.length,build:calls.build};
   }),{paths:['two.mp4','one.mp4'],settings:0,cuts:0,defaults:{path:'two.mp4',name:'two.mp4',kind:'video',subfolder:'',size:4096,mtime:20,width:768,height:432,duration:7,takes:'object',ref_size:'match'},imports:0,build:0});
 });
 await check('Per-tab checks are independent and returns restore their order; organize marks are never remembered',async()=>{
   await page.evaluate(()=>subject.selectTab('image'));await page.waitForFunction(()=>subject.checksReady);
   await page.evaluate(()=>{pick('portrait.png');subject.setOrganize(true);subject.mark(subject.assets.find(row=>row.path==='continuity/control/guide.png'));subject.setOrganize(false);subject.selectTab('video');});
   await page.waitForFunction(()=>subject.checksReady);
   assert.deepEqual(await page.evaluate(()=>paths()),['two.mp4','one.mp4']);
   await page.evaluate(()=>subject.selectTab('image'));await page.waitForFunction(()=>subject.checksReady);
   assert.deepEqual(await page.evaluate(()=>paths()),['portrait.png']);
   assert.deepEqual(await page.evaluate(()=>readPickedPaths(checkContext('image'))),['portrait.png']);
 });
 await check('Restore respects current single, capacity, missing/wrong-kind files and restricted render/guide contexts',async()=>{
   assert.deepEqual(await page.evaluate(async()=>{
     reset();saveChecks('video',['missing.mp4','portrait.png','three.mp4','two.mp4','one.mp4']);await mountFixture({capacity:()=>({used:1,max:2,filesLeft:2})});const capped=paths();subject.close(null);
     saveChecks('video',['two.mp4','one.mp4'],{single:true});await mountFixture({single:true});const single=paths();subject.close(null);
     saveChecks('renders',['output:render.mp4','one.mp4'],{only:'video'});await mountFixture({kind:'renders',only:'video'});const render=paths();subject.close(null);
     saveChecks('guides',['portrait.png','continuity/control/guide.png'],{only:'image'});await mountFixture({kind:'guides',only:'image'});return {capped,single,render,guide:paths()};
   }),{capped:['three.mp4'],single:['two.mp4'],render:['output:render.mp4'],guide:['continuity/control/guide.png']});
 });
 await check('Purpose/only/single isolate file-check records; view-only and seeded sheet panels take precedence',async()=>{
   assert.deepEqual(await page.evaluate(async()=>{
     reset();saveChecks('video',['one.mp4']);await mountFixture({selectionPurpose:'different-slot'});const isolated=paths();subject.close(null);
     await mountFixture({viewOnly:true});const viewOnly=paths();subject.close(null);
     saveChecks('image',['portrait.png']);await mountFixture({kind:'image',plate:{panels:[{path:'continuity/control/guide.png',cut:true,crop:{x:0,y:0,w:1,h:1}}]}});
     return {isolated,viewOnly,seeded:paths(),cut:subject.cuts.get('continuity/control/guide.png'),sheet:subject.sheet};
   }),{isolated:[],viewOnly:[],seeded:['continuity/control/guide.png'],cut:true,sheet:['continuity/control/guide.png']});
 });
 await check('Registered tokens restore from fresh bounded metadata across directories without attachment, import or build',async()=>{
   assert.deepEqual(await page.evaluate(async()=>{
     reset();saveChecks('video',['external:grant/nested/inner/leaf.mp4','external:grant/nested/deep.mp4','external:revoked/missing.mp4','external:grant/root.png']);
     const view=pickerViewContext(baseOptions);patchViewPrefs(view,{externalFolder:'grant',directory:''});await mountFixture();
     return {paths:paths(),metadata:calls.metadata,walks:calls.listing.length,imports:calls.imports.length,build:calls.build,resolve:calls.resolve,settings:subject.settings.size};
   }),{paths:['external:grant/nested/inner/leaf.mp4','external:grant/nested/deep.mp4'],metadata:[{paths:['external:grant/nested/inner/leaf.mp4','external:grant/nested/deep.mp4','external:revoked/missing.mp4','external:grant/root.png'],kind:'video'}],walks:0,imports:0,build:0,resolve:0,settings:0});
 });
 await check('Explicit import remembers original registered token while preserving the active imported copy and action settings',async()=>{
   assert.deepEqual(await page.evaluate(async()=>{
     reset();await mountFixture();await subject.selectExternalFolder('grant');pick('external:grant/root.mp4');subject.settings.set('external:grant/root.mp4',{track:'picture',trim:{start:1,end:2}});
     await subject.materializeRows(subject.selected);const copy=paths(),settings=subject.settings.get(copy[0]),memory=readPickedPaths(checkContext('video'));subject.close(null);await mountFixture();
     return {copy,settings,memory,reopened:paths(),imports:calls.imports.length,build:calls.build};
   }),{copy:['imported/copy0.mp4'],settings:{track:'picture',trim:{start:1,end:2}},memory:['external:grant/root.mp4'],reopened:['external:grant/root.mp4'],imports:1,build:0});
 });
 await check('Pending metadata cannot overwrite manual picks or a different tab, and close cannot erase unseen saved checks',async()=>{
   assert.equal(await page.evaluate(async()=>{
     reset();saveChecks('video',['external:grant/nested/deep.mp4']);metadataPending={};const mount=mountFixture();
     while(!metadataPending.release)await new Promise(resolve=>setTimeout(resolve,0));const interactive=Boolean(cell('one.mp4'));cell('one.mp4').click();metadataPending.release();await mount;
     const manual=interactive&&paths().join(',')==='one.mp4';subject.close(null);
     saveChecks('video',['external:grant/nested/deep.mp4']);metadataPending={};const tabPending=mountFixture();while(!metadataPending.release)await new Promise(resolve=>setTimeout(resolve,0));
     subject.selectTab('image');metadataPending.release();await tabPending;
     const tab=subject.kind==='image'&&paths().length===0;subject.close(null);
     patchViewPrefs(pickerViewContext(baseOptions),{kind:'video'});
     saveChecks('video',['external:grant/nested/deep.mp4']);metadataPending={};const pending=mountFixture();while(!metadataPending.release)await new Promise(resolve=>setTimeout(resolve,0));
     subject.close(null);metadataPending.release();await pending;metadataPending=null;
     return manual&&tab&&readPickedPaths(checkContext('video')).join(',')==='external:grant/nested/deep.mp4';
   }),true);
 });
 await check('Temporary metadata failure preserves saved checks; retry restores without hidden action side effects',async()=>{
   assert.equal(await page.evaluate(async()=>{
     reset();saveChecks('video',['external:grant/nested/deep.mp4']);metadataError=true;await mountFixture();subject.close(null);
     const preserved=readPickedPaths(checkContext('video')).length===1;metadataError=false;await mountFixture();return preserved&&paths()[0]==='external:grant/nested/deep.mp4'&&calls.imports.length===0&&calls.build===0;
   }),true);
 });
 await check('A metadata response pending at grant removal cannot restore revoked files or erase still-valid ordered checks',async()=>{
   assert.equal(await page.evaluate(async()=>{
     reset();const second={path:'external:other/valid.mp4',name:'valid.mp4',kind:'video',mtime:1};tree.second={folders:[],assets:[second]};
     saveChecks('video',['external:grant/nested/deep.mp4',second.path,'external:grant/root.mp4']);metadataPending={};const mount=mountFixture();
     while(!metadataPending.release)await new Promise(resolve=>setTimeout(resolve,0));await subject.forgetExternalFolder('grant');
     metadataPending.release();await mount;metadataPending=null;delete tree.second;
     const selected=paths().join(',')===second.path;subject.close(null);return selected&&readPickedPaths(checkContext('video')).join(',')===second.path;
   }),true);
 });
 await check('Native localStorage survives a fresh document restart with display/check state only, no old workflow edits',async()=>{
   await page.evaluate(async()=>{reset();await mountFixture();pick('two.mp4');subject.setViewMode('details');subject.sortSelect.value='name';subject.sortSelect.dispatchEvent(new Event('change'));subject.search.value='two';subject.search.dispatchEvent(new Event('input'));subject.close(null);});
   await initialize();await page.evaluate(()=>mountFixture());
   assert.deepEqual(await page.evaluate(()=>({paths:paths(),mode:subject.viewMode,query:subject.query,sort:subject.sortOrder,settings:subject.settings.size,imports:calls.imports.length,build:calls.build})),{paths:['two.mp4'],mode:'details',query:'two',sort:'name',settings:0,imports:0,build:0});
 });
 await check('Invalid/corrupt and unavailable storage are safe; bounded store accepts only ordered paths',async()=>{
   assert.equal(await page.evaluate(async()=>{
     reset();localStorage.setItem('continuity-picker-checks-v1','{bad');await mountFixture();const corrupt=paths().length===0;subject.close(null);
     const context=checkContext('video');const ordered=writePickedPaths(context,['one.mp4','one.mp4',null,{path:'two.mp4'},'bad\u0000path','two.mp4']);
     const proto=Object.getPrototypeOf(localStorage),oldGet=proto.getItem,oldSet=proto.setItem;
     proto.getItem=()=>{throw new DOMException('Denied','SecurityError');};proto.setItem=()=>{throw new DOMException('Denied','SecurityError');};
     try{writePickedPaths(context,['three.mp4']);await mountFixture();return corrupt&&ordered.join(',')==='one.mp4,two.mp4'&&paths().join(',')==='three.mp4';}
     finally{proto.getItem=oldGet;proto.setItem=oldSet;}
   }),true);
 });
 await check('Three modes remain lazy/paged and use a native scrollport; switching mode does not materialize every file',async()=>{
   await page.evaluate(async()=>{reset();window.rows=Array.from({length:350},(_,i)=>({path:'video'+i+'.mp4',name:'video'+i+'.mp4',kind:'video',mtime:i}));await mountFixture();});
   for(const mode of ['large','small','details']){
     const state=await page.evaluate(mode=>{subject.setViewMode(mode);return {total:subject.gridRows.length,cells:subject.cells.size,pages:subject.pages,scrollbar:getComputedStyle(subject.grid).scrollbarWidth};},mode);
     assert.deepEqual(state,{total:240,cells:60,pages:2,scrollbar:'thin'});
     await page.evaluate(()=>subject.grid.scrollTop=subject.grid.scrollHeight);await page.waitForFunction(()=>subject.cells.size>60);
     await page.evaluate(()=>{subject.setPage(1);subject.setPage(0);});
   }
 });
 await check('Large/small/details fit narrow EN/KO/JA/ZH and enlarged-type viewports; native controls stay within each cell',async()=>{
   for(const width of [320,640,1600])for(const scale of [1,1.6])for(const locale of Object.keys(locales))for(const mode of ['large','small','details']){
     await page.setViewportSize({width,height:width===320?760:width===640?800:900});
     await page.evaluate(async({scale,translations,mode})=>{reset();document.documentElement.style.setProperty('--mmc-type',scale);window.translations=translations;await mountFixture({kinds:['image','video','audio'],referenceOptions:{takes:'full',ref_size:'max'}});subject.setViewMode(mode);subject.toggle(subject.visible()[0]);subject.hideFileInfo();}, {scale,translations:locales[locale],mode});
     const dimensions=await page.evaluate(()=>{
       const m=subject.modal.getBoundingClientRect(),g=subject.grid.getBoundingClientRect(),f=subject.foot.getBoundingClientRect(),tile=subject.cells.values().next().value,r=tile.getBoundingClientRect();
       const controls=[...tile.querySelectorAll('input,button,select')].filter(node=>node.getClientRects().length&&node.getBoundingClientRect().width>0).map(node=>node.getBoundingClientRect());
       const noOverlap=controls.every((a,i)=>controls.slice(i+1).every(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1));
       const facts=tile.querySelector('.mmc-picker-detail-meta');
       const readable=!facts||[...facts.querySelectorAll('dd')].every(node=>node.getBoundingClientRect().width>=60);
       const pager=subject.pager.getBoundingClientRect(),pagerVisible=subject.pager.getClientRects().length&&pager.width>0;
       const pagerSeparate=!pagerVisible||Math.min(pager.right,f.right)-Math.max(pager.left,f.left)<=1||Math.min(pager.bottom,f.bottom)-Math.max(pager.top,f.top)<=1;
       const uncovered=Math.min(g.bottom,f.top,pagerVisible?pager.top:g.bottom)-g.top;
       const footButtons=[...subject.foot.querySelectorAll('button')];
       subject.foot.scrollTop=subject.foot.scrollHeight;
       const footerHit=footButtons.every(button=>{const b=button.getBoundingClientRect(),target=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return button===target||button.contains(target);});
       return {overflow:document.documentElement.scrollWidth>innerWidth,modal:m.left>=0&&m.right<=innerWidth&&m.bottom<=innerHeight,grid:g.height>40&&g.right<=m.right,inside:controls.every(c=>c.left>=r.left-1&&c.right<=r.right+1&&c.top>=r.top-1&&c.bottom<=r.bottom+1),mode:subject.modal.classList.contains('mmc-picker-view-'+subject.viewMode),noOverlap,readable,tabs:[...subject.tabs].every(node=>node.scrollHeight<=parseFloat(getComputedStyle(node).fontSize)*2+1),footerInside:f.left>=m.left&&f.right<=m.right&&f.bottom<=m.bottom,pagerSeparate,footerHit,usableGrid:innerWidth>640||uncovered>=120};
     });
     if(dimensions.overflow||Object.entries(dimensions).some(([name,value])=>name!=='overflow'&&!value)){
       const debug=await page.evaluate(()=>{const tile=subject.cells.values().next().value;return {modal:subject.modal.getBoundingClientRect().toJSON(),grid:subject.grid.getBoundingClientRect().toJSON(),footer:subject.foot.getBoundingClientRect().toJSON(),pager:subject.pager.getBoundingClientRect().toJSON(),tile:tile.getBoundingClientRect().toJSON(),controls:[...tile.querySelectorAll('input,button,select')].filter(node=>node.getClientRects().length&&node.getBoundingClientRect().width>0).map(node=>({class:node.className,rect:node.getBoundingClientRect().toJSON()}))};});
       console.log('GEOMETRY',JSON.stringify(debug));
       if(out)await page.screenshot({path:path.join(out,'geometry-failure.png')});
     }
     assert.deepEqual(dimensions,{overflow:false,modal:true,grid:true,inside:true,mode:true,noOverlap:true,readable:true,tabs:true,footerInside:true,pagerSeparate:true,footerHit:true,usableGrid:true},JSON.stringify({width,scale,locale,mode}));geometries.push({width,scale,locale,mode});
     if(out&&scale===1&&locale==='ko'&&[320,1600].includes(width))await page.screenshot({path:path.join(out,`picker-${width}-ko-${mode}.png`)});
     if(out&&scale===1.6&&locale==='ja'&&width===320&&mode==='details')await page.screenshot({path:path.join(out,'picker-320-ja-enlarged-details.png')});
     if(out&&scale===1.6&&locale==='ja'&&width===1600&&mode==='large')await page.screenshot({path:path.join(out,'picker-1600-ja-enlarged-large.png')});
     if(out&&scale===1.6&&locale==='en'&&width===640&&mode==='large')await page.screenshot({path:path.join(out,'picker-640-en-enlarged-large.png')});
   }
 });
 await check('External breadcrumb/root rail and selected native controls remain usable in every narrow view',async()=>{
   for(const width of [320,640,1600])for(const scale of [1,1.6])for(const mode of ['large','small','details']){
     await page.setViewportSize({width,height:width===320?760:width===640?800:900});
     await page.evaluate(async({scale,mode,translations})=>{reset();document.documentElement.style.setProperty('--mmc-type',scale);window.translations=translations;await mountFixture({kinds:['image','video','audio']});await subject.selectExternalFolder('grant');await subject.openExternalDirectory('nested/inner');subject.setViewMode(mode);pick('external:grant/nested/inner/leaf.mp4');subject.hideFileInfo();},{scale,mode,translations:locales.ko});
     assert.deepEqual(await page.evaluate(()=>{const m=subject.modal.getBoundingClientRect(),n=subject.directoryBar.getBoundingClientRect(),g=subject.grid.getBoundingClientRect(),f=subject.foot.getBoundingClientRect();subject.foot.scrollTop=subject.foot.scrollHeight;const footerHit=[...subject.foot.querySelectorAll('button')].every(button=>{const b=button.getBoundingClientRect(),target=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return button===target||button.contains(target);});return {noOverflow:document.documentElement.scrollWidth<=innerWidth,nav:n.width>30&&n.height>20&&n.left>=m.left&&n.right<=m.right,grid:g.height>40&&g.right<=m.right,bar:getComputedStyle(subject.directoryBar).scrollbarWidth,footerInside:f.left>=m.left&&f.right<=m.right&&f.bottom<=m.bottom,footerHit,usableGrid:innerWidth>640||Math.min(g.bottom,f.top)-g.top>=120,selected:paths()};}),{noOverflow:true,nav:true,grid:true,bar:'thin',footerInside:true,footerHit:true,usableGrid:true,selected:['external:grant/nested/inner/leaf.mp4']},JSON.stringify({width,scale,mode}));
     geometries.push({width,scale,mode,external:true});
     if(out&&width===320&&scale===1)await page.screenshot({path:path.join(out,`picker-external-${width}-${mode}.png`)});
   }
 });
 assert.equal(requests,0);assert.deepEqual(errors,[]);
 const report={suite:'picker-hierarchy-memory',passed:tests.length,geometries:geometries.length,requests,navigations,pageErrors:errors,tests};
 if(out)fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
