// Actual count helpers, Timeline.renderPool, CastShelf header callbacks and
// disclosure in isolated Chrome. Card/catalog adapters only; no server/GPU/media.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sourceRoot=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(sourceRoot,'web/creator'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const strip=text=>text.replace(/^import\b[^]*?;\r?\n/gm,'').replace(/^export /gm,'');
const method=(name,source)=>{const found=source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));assert.ok(found,name);return found[0];};
const fn=(name,source)=>{const found=source.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`,'m'));assert.ok(found,name);return found[0].replace(/^export /,'');};
const timeline=read('timeline.js'),cast=read('cast.js'),dom=read('dom.js'),state=read('state.js');
assert.match(timeline,/import \{ mediaCountPills \} from "\.\/media-counts\.js";/);
assert.match(cast,/import \{ mediaCountPills, resolvedReferenceFiles \} from "\.\/media-counts\.js";/);
assert.match(method('render',cast),/\[\.\.\.S\.subjectFiles\(subject\), \.\.\.S\.replacesOf\(subject\)\]/);
assert.match(method('renderPool',timeline),/\{family\} reads no attached references — detach these, or put the piece "\r?\n        \+ "back on a model that reads them\./);
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR,'web/creator'):path.resolve(__dirname,'../../../baseline/web/creator');
if(fs.existsSync(path.join(baseline,'disclosure.js'))){
 const noNodes=text=>text.replace(/^    setHintNodes\(\.\.\.nodes\) \{\r?\n      const visible = nodes\.filter\(Boolean\);\r?\n      detail\.replaceChildren\(\.\.\.visible\);\r?\n      detail\.hidden = !visible\.length;\r?\n    \},\r?\n/m,'');
 assert.equal(noNodes(read('disclosure.js')),noNodes(fs.readFileSync(path.join(baseline,'disclosure.js'),'utf8')),'The optional node setter is the only shared disclosure change');
 const oldCast=fs.readFileSync(path.join(baseline,'cast.js'),'utf8');
 for(const name of ['addSubject','save','typing','reveal'])assert.equal(method(name,cast),method(name,oldCast),name+' callback stays exact');
}
const css=[...read('styles.js').matchAll(/import \{ css as \w+ \} from "\.\/styles\/(\w+)\.js";/g)].map(match=>read(`styles/${match[1]}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const ko=vm.runInNewContext(read('locales/ko.js').replace(/^export const /m,'const ')+';ko;',{});
const code=`
${['el','svg','floatAbove','dismissable','placeNear','closeOwnedPopovers'].map(name=>fn(name,dom)).join('\n')}
const popoverOwners=new WeakMap(),popoverClosers=new Map();
${dom.match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /,'')}
const icon=(name,size=13)=>svg(ICONS[name]||ICONS.effect,size);
let language='en';const ko=${JSON.stringify(ko)};
const t=(text,values={})=>(language==='ko'?ko[text]??text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??'{'+key+'}');
${strip(read('media-counts.js'))}
${strip(read('disclosure.js'))}
${['motionOf','subjectFiles','replacesOf','castAssets'].map(name=>fn(name,state)).join('\n')}
const S={subjectFiles,replacesOf,castAssets,DEFAULT_VIDEO_FAMILY:'h3',takesReferences:piece=>piece.takesRefs!==false,familyOf:()=>({label:'Unsupported family'}),seedFeatures:()=>[]};
const WearsPanel=class{};
class Shelf {
 ${['constructor','render','typing','save','reveal','addSubject'].map(name=>method(name,cast)).join('\n')}
 problem(member){return member.problem||'';}
 card(member){return el('div',{class:'mmc-cast-card'},[el('input',{class:'mmc-cast-name',value:member.handle})]);}
}
class Pool {
 ${method('renderPool',timeline)}
 poolChip(asset){return el('span',{class:'mmc-asset',text:'@'+asset.handle});}
 addPoolAssets(){window.addCalls++;this.timeline.assets.push({handle:'added',kind:'image',filename:'added.png'});this.renderPool();}
}
window.cleanup=()=>{if(window.shelf)clearTimeout(shelf.pending);document.querySelector('.fixture-host')?.remove();};
window.setFixture=(options={})=>{
 cleanup();language=options.language||'en';document.documentElement.style.setProperty('--mmc-type',String(options.scale||1));
 window.piece=structuredClone(options.piece||{assets:[],subjects:[],segments:[{}]});window.addCalls=0;window.commits=0;window.libraryCalls=0;window.foldCalls=0;
 window.pool=Object.assign(new Pool(),{timeline:piece,poolError:options.poolError||''});
 pool.poolSection=createDisclosure({title:t('Piece references'),actionsBeforeHint:true,initialOpen:options.open!==false,onOpenChange:()=>foldCalls++});
 pool.poolWarning=el('div',{class:'mmc-tl-pool-bad',role:'status'});pool.poolHost=el('div',{class:'mmc-tl-pool'},[pool.poolSection.root,pool.poolWarning]);
 window.shelf=new Shelf({getCast:()=>piece.subjects??[],setCast:value=>piece.subjects=value,getAssets:()=>S.castAssets(piece),disclosure:options.native!==true,actionsBeforeHint:true,
  initialOpen:options.open!==false,onOpenChange:()=>foldCalls++,commit:()=>commits++,library:options.library?async()=>libraryCalls++:null});
 const host=el('div',{class:'fixture-host '+(options.native?'mmc-root':'mmc-modal mmc-tl-modal'),style:{width:'100%',maxWidth:'100%'}},[pool.poolHost,shelf.root]);document.body.append(host);pool.renderPool();shelf.render();return JSON.stringify(piece);
};
window.snapshot=()=>({data:JSON.stringify(piece),addCalls,commits,libraryCalls,foldCalls});
window.countText=()=>({pool:[...pool.poolSection.head.querySelectorAll('.mmc-media-count')].map(node=>node.textContent),cast:[...shelf.root.querySelectorAll('.mmc-cast-head .mmc-media-count,.mmc-tl-section-head .mmc-media-count')].map(node=>node.textContent)});
Object.assign(window,{referenceFileCounts,resolvedReferenceFiles,mediaCountPills,createDisclosure,el});
`;
new vm.Script(code);
const results=[],errors=[];let browser,requests=0;
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
const assets=[{handle:'image-1',kind:'image',filename:'first.png',muted:true},{handle:'image-2',kind:'image',filename:'second.png'},
 {handle:'video-1',kind:'video',filename:'sound-video.mp4',track:'sound'},{handle:'audio-1',kind:'audio',filename:'voice.wav'},
 {handle:'mod-1',kind:'video',filename:'refmod:identity'},{handle:'other-1',kind:'other',filename:'unusual.bin'}];
const subjects=[{handle:'subject',from:['image-1','image-1','image-2','mod-1','missing'],motion:['video-1'],voice:'audio-1',replaces:['video-1','other-1']},
 {handle:'subject_2',from:['image-1'],voice:'audio-1',replaces:'video-1'}];
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});const page=await browser.newPage({viewport:{width:1200,height:900}});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><head><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;padding:20px;box-sizing:border-box;background:#171718}.fixture-host{box-sizing:border-box;display:flex;flex-direction:column;gap:18px;padding:12px;height:auto;min-height:0}.fixture-host .mmc-cast-card{padding:8px}.fixture-host .mmc-cast-name{max-width:100%}</style></head><body><button id="outside">Outside</button></body></html>');await page.evaluate('(()=>{'+code+'})()');
 const reset=options=>page.evaluate(options=>setFixture(options),options),shot=async name=>{if(!process.env.CONTINUITY_UX_SCREENSHOT_DIR)return;fs.mkdirSync(process.env.CONTINUITY_UX_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR,name),fullPage:true});};
 await check('Pure row counts include muted/uncited assets, classify sound-only video as video and RefMod before ordinary kind',async()=>{
  const result=await page.evaluate(assets=>{const frozen=assets.map(asset=>Object.freeze(asset));Object.freeze(frozen);return{counts:referenceFileCounts(frozen),after:JSON.stringify(frozen)};},assets);assert.deepEqual(result.counts,{image:2,video:1,audio:1,refmod:1,other:1});assert.equal(result.after,JSON.stringify(assets));
 });
 await check('Exact-handle resolution deduplicates claims across subjects, chooses the first matching row and omits missing handles',async()=>{
  const result=await page.evaluate(assets=>{const files=resolvedReferenceFiles(['image-1','image-1','image-2','missing','image-10'],[...assets,{handle:'image-1',kind:'video',filename:'duplicate.mp4'}]);return files.map(file=>[file.handle,file.kind]);},assets);assert.deepEqual(result,[['image-1','image'],['image-2','image']]);
 });
 await check('Empty supported shelves show zero-file pills plus the Cast zero pill with original Add/cast availability and no mutations',async()=>{
  await reset({});const before=await page.evaluate(()=>snapshot());assert.deepEqual(await page.evaluate(()=>countText()),{pool:['Reference files 0'],cast:['Cast 0','Reference files 0']});assert.equal(await page.locator('.mmc-tl-pool-add').count(),1);assert.equal(await page.locator('.mmc-cast-new').count(),1);assert.deepEqual(await page.evaluate(()=>snapshot()),before);
  // The approved leading pill counts registered people, even without files;
  // it must never inflate or replace the existing reference-file count.
  await reset({piece:{assets:[],subjects:[{handle:'empty_1'},{handle:'empty_2'}],segments:[{}]}});const emptyPeople=await page.evaluate(()=>snapshot());assert.deepEqual(await page.evaluate(()=>countText()),{pool:['Reference files 0'],cast:['Cast 2','Reference files 0']});assert.deepEqual(await page.evaluate(()=>snapshot()),emptyPeople);
 });
 await check('Pool counts each attached row, not unique handles, while cast counts unique claimed files and does not double-count face reuse',async()=>{
  await reset({piece:{assets:[...assets,{...assets[0]}],subjects,segments:[{},{}]}});const before=await page.evaluate(()=>snapshot());assert.deepEqual(await page.evaluate(()=>countText()),{pool:['Images 3','Videos 1','Audio 1','RefMod 1','Other files 1'],cast:['Cast 2','Supporting images 2','Videos 1','Audio 1','RefMod 1','Other files 1']});assert.deepEqual(await page.evaluate(()=>snapshot()),before);
 });
 await check('Cast supporting counts include actual motion/voice/replacement readers, deduplicate shared claims and ignore dangling handles',async()=>{
  await reset({piece:{assets,subjects,segments:[{},{}]}});assert.deepEqual(await page.evaluate(()=>countText().cast),['Cast 2','Supporting images 2','Videos 1','Audio 1','RefMod 1','Other files 1']);assert.equal(await page.locator('.mmc-media-counts button,.mmc-media-counts input,.mmc-media-counts [tabindex]').count(),0);
 });
 await check('A lone segment uses original castAssets visibility without adding its local files to the timeline pool count',async()=>{
  await reset({piece:{assets:[],subjects:[{handle:'subject',from:['local'],voice:'local-audio'}],segments:[{assets:[{handle:'local',kind:'image'},{handle:'local-audio',kind:'audio'}]}]}});assert.deepEqual(await page.evaluate(()=>countText()),{pool:['Reference files 0'],cast:['Cast 1','Supporting images 1','Audio 1']});await page.evaluate(()=>{piece.segments.push({});shelf.render();});assert.deepEqual(await page.evaluate(()=>countText().cast),['Cast 1','Reference files 0']);
 });
 await check('Live add/remove/kind changes recalculate counts without changing stored reference/cast values beyond the explicit operation',async()=>{
  await reset({piece:{assets:[assets[0]],subjects:[{handle:'subject',from:['image-1']}],segments:[{}]}});await page.locator('.mmc-tl-pool-add').click();assert.equal(await page.evaluate(()=>addCalls),1);assert.deepEqual(await page.evaluate(()=>countText().pool),['Images 2']);await page.evaluate(()=>{piece.assets.shift();pool.renderPool();shelf.render();});assert.deepEqual(await page.evaluate(()=>countText()),{pool:['Images 1'],cast:['Cast 1','Reference files 0']});await page.evaluate(()=>{piece.assets[0].kind='audio';pool.renderPool();});assert.deepEqual(await page.evaluate(()=>countText().pool),['Audio 1']);assert.equal(await page.evaluate(()=>commits),0);
 });
 await check('Counts refresh preserves mounted focused actions and does not turn Add/Library into disclosure toggles',async()=>{
  await reset({open:false,library:true});await page.evaluate(()=>{window.oldAdd=pool.poolAdd;oldAdd.focus();pool.renderPool();window.oldActions=[...shelf.headerActions];shelf.render();});assert.equal(await page.evaluate(()=>pool.poolAdd===oldAdd&&document.activeElement===oldAdd&&shelf.headerActions.every((button,index)=>button===oldActions[index])),true);await page.locator('.mmc-cast-new').nth(1).click();assert.equal(await page.evaluate(()=>libraryCalls),1);assert.equal(await page.evaluate(()=>shelf.section.isOpen()),false);assert.equal(await page.evaluate(()=>foldCalls),0);
 });
 await check('Existing cast input caret guard defers presentation rebuilds while typing and refreshes counts after leaving the field',async()=>{
  await reset({piece:{assets:[assets[0]],subjects:[{handle:'subject',from:['image-1']}],segments:[{}]}});await page.locator('.mmc-cast-name').focus();await page.evaluate(()=>{window.oldField=document.activeElement;piece.assets.push({handle:'second',kind:'image',filename:'second.png'});piece.subjects[0].from.push(piece.assets[1].handle);shelf.render();});assert.equal(await page.evaluate(()=>oldField===document.activeElement&&oldField.isConnected),true);assert.deepEqual(await page.evaluate(()=>countText().cast),['Cast 1','Supporting images 1']);await page.locator('#outside').focus();await page.evaluate(()=>shelf.render());assert.deepEqual(await page.evaluate(()=>countText().cast),['Cast 1','Supporting images 2']);
 });
 await check('Unsupported empty pools still hide; attached refs retain exact model warning and pool errors outside the folded body',async()=>{
  await reset({piece:{takesRefs:false,assets:[],subjects:[],segments:[{}]}});assert.equal(await page.locator('.mmc-tl-pool').isVisible(),false);await reset({open:false,poolError:'Original pool error',piece:{takesRefs:false,assets:[assets[0]],subjects:[],segments:[{}]}});assert.equal(await page.locator('.mmc-tl-pool').isVisible(),true);assert.equal(await page.locator('.mmc-tl-pool-add').count(),0);assert.deepEqual(await page.evaluate(()=>countText().pool),['Images 1']);assert.equal(await page.locator('.mmc-tl-pool > .mmc-tl-pool-bad').textContent(),'Unsupported family reads no attached references — detach these, or put the piece back on a model that reads them.\nOriginal pool error');assert.equal(await page.locator('.mmc-tl-pool > .mmc-tl-pool-bad').isVisible(),true);assert.equal(await page.evaluate(()=>pool.poolSection.body.contains(pool.poolWarning)),false);
 });
 await check('Cast diagnostics still remain outside folded content and all missing-member messages survive count presentation',async()=>{
  await reset({open:false,piece:{assets:[],subjects:[{handle:'first',from:['missing'],problem:'Missing reference'},{handle:'second',problem:'Missing voice'}],segments:[{}]}});assert.equal(await page.locator('.mmc-cast-section-warning').textContent(),'@first: Missing reference\n@second: Missing voice');assert.equal(await page.locator('.mmc-cast-section-warning').isVisible(),true);assert.equal(await page.evaluate(()=>shelf.section.body.contains(shelf.sectionWarning)),false);assert.deepEqual(await page.evaluate(()=>countText().cast),['Cast 2','Reference files 0']);
 });
 await check('New hint-node setter retains original strings, hidden rules, focus and mounted body when switching back to default hints',async()=>{
  assert.equal(await page.evaluate(()=>{const field=el('input'),section=createDisclosure({title:'Default',hint:'Original hint',content:field}),detail=section.head.querySelector('.mmc-tl-section-hint');document.body.append(section.root);field.focus();section.setHintNodes(mediaCountPills([]));const same=section.body.firstChild===field&&document.activeElement===field&&!detail.hidden;section.setHintNodes();const hidden=detail.hidden;section.setHint('Text again');const text=detail.textContent==='Text again'&&!detail.hidden;section.setText('Next','');const empty=detail.hidden&&detail.textContent==='';section.root.remove();return same&&hidden&&text&&empty;}),true);
 });
 await check('English/Korean pool and supporting-count labels stay separate, read-only and semantically ordered',async()=>{
  for(const language of ['en','ko']){await reset({language,piece:{assets,subjects,segments:[{}]}});assert.deepEqual(await page.evaluate(()=>countText()),language==='ko'?{pool:['이미지 2개','비디오 1개','음성 1개','RefMod 1개','기타 파일 1개'],cast:['출연진 2명','보조 이미지 2장','비디오 1개','음성 1개','RefMod 1개','기타 파일 1개']}:{pool:['Images 2','Videos 1','Audio 1','RefMod 1','Other files 1'],cast:['Cast 2','Supporting images 2','Videos 1','Audio 1','RefMod 1','Other files 1']});}
  const skin=await page.locator('.mmc-media-count').first().evaluate(node=>{const c=getComputedStyle(node);return{border:c.borderTopWidth,colour:c.borderTopColor,background:c.backgroundColor,pointer:c.pointerEvents};});assert.equal(skin.border,'1px');assert.notEqual(skin.colour,'rgba(0, 0, 0, 0)');assert.notEqual(skin.background,'rgba(0, 0, 0, 0)');assert.equal(skin.pointer,'none');await reset({language:'ko'});assert.deepEqual(await page.evaluate(()=>countText()),{pool:['레퍼런스 파일 0개'],cast:['출연진 0명','레퍼런스 파일 0개']});
 });
 await check('320/640/1200px and both type scales wrap every pill without clipping, overlaps, font shrink or header/data changes',async()=>{
  for(const width of [320,640,1200])for(const language of ['en','ko'])for(const native of [false,true])for(const scale of [1,1.6]){
   await page.setViewportSize({width,height:1200});await reset({language,native,scale,library:true,piece:{assets,subjects,segments:[{}]}});const before=await page.evaluate(()=>snapshot());const result=await page.evaluate(()=>{const box=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return{page:document.documentElement.scrollWidth,pills:[...document.querySelectorAll('.mmc-media-count')].map(node=>({box:box(node),host:box(node.closest('.mmc-media-counts')),font:parseFloat(getComputedStyle(node).fontSize),radius:getComputedStyle(node).borderRadius,scroll:node.scrollWidth,client:node.clientWidth})),hosts:[...document.querySelectorAll('.mmc-media-counts')].map(node=>[...node.children].map(box))};});assert.ok(result.page<=width,JSON.stringify(result));for(const pill of result.pills){assert.ok(pill.box.left>=pill.host.left-.1&&pill.box.right<=pill.host.right+.1);assert.ok(pill.box.left>=0&&pill.box.right<=width);assert.ok(pill.scroll<=pill.client+1);assert.ok(Math.abs(pill.font-11*scale)<.01);assert.equal(pill.radius,'999px');}for(const boxes of result.hosts)for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.equal(a.left<b.right-.1&&a.right>b.left+.1&&a.top<b.bottom-.1&&a.bottom>b.top+.1,false);}assert.deepEqual(await page.evaluate(()=>snapshot()),before);if(language==='ko'&&scale===1.6)await shot('reference-counts-'+width+'-'+(native?'node':'timeline')+'-ko-large.png');
  }
 });
 await check('Count-only CSS leaves ordinary hint ellipsis and text behavior untouched outside new pill hosts',async()=>{
  assert.equal(await page.evaluate(()=>{const root=el('div',{class:'mmc-root'},[el('div',{class:'mmc-cast-head'},[el('span',{class:'mmc-cast-hint',text:'Original hint'})])]);document.body.append(root);const hint=getComputedStyle(root.querySelector('.mmc-cast-hint')),same=hint.overflow==='hidden'&&hint.whiteSpace==='nowrap'&&hint.textOverflow==='ellipsis';root.remove();return same;}),true);
 });
 await page.evaluate(()=>cleanup());assert.equal(requests,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({suite:'reference-counts',passed:results.length,requests,errors,results,scope:'actual count/header/disclosure/state readers; isolated synthetic card/catalog host; no live ComfyUI/GPU proof'},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
