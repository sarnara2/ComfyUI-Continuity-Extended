// Actual shared refineButton, CreatorEditor rail/refine, RefinePanel apply/fail,
// Timeline bar/refineAll/takePiece and refine request construction. Only settings
// storage/catalog, unrelated editor tools and the queue/network boundary are
// adapters. Responses stay in RAM; this cannot contact ComfyUI or start a GPU job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = path.resolve(process.env.CONTINUITY_SOURCE_ROOT || path.join(__dirname, '../..'));
const creator = path.join(sourceRoot, 'web/creator');
const read = name => fs.readFileSync(path.join(creator, name), 'utf8');
const refineSource = read('refine.js'), editorSource = read('editor.js');
const timelineSource = read('timeline.js'), domSource = read('dom.js');
const fn = (name, source = refineSource) => {
  const found = source.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Actual function ${name}`); return found[0].replace(/^export /, '');
};
const method = (name, source = timelineSource) => {
  const found = source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Actual method ${name}`); return found[0];
};
const target = name => {
  const found = method(name).match(/refineTarget: (\(\) => \(\{[^]*?^      \}\)),/m);
  assert.ok(found, `Actual ${name} target getter`); return found[1];
};
// Reuse the existing actual-source header setup, not a second hand-written
// settings bar. Stop before its test runner and expose only its setup and CSS.
const headerPath = path.join(sourceRoot, 'tests/browser/test-timeline-header-layout.cjs');
const headerSource = fs.readFileSync(headerPath, 'utf8');
const preludeEnd = headerSource.indexOf('\nnew vm.Script(code,');
assert.ok(preludeEnd > 0, 'Portable actual-source header fixture prelude');
const context = {
  require, process: { env: { ...process.env, CONTINUITY_SOURCE_ROOT: sourceRoot } },
  __dirname: path.dirname(headerPath), console,
};
vm.runInNewContext(headerSource.slice(0, preludeEnd) + ';globalThis.sharedFixture={code,css};', context);
let bootstrap = context.sharedFixture.code;
const css = context.sharedFixture.css;
const substitute = (before, after) => {
  assert.ok(bootstrap.includes(before), `Exact harness adapter seam: ${before.slice(0, 64)}`);
  bootstrap = bootstrap.replace(before, after);
};
substitute('const mountOverlay=overlay=>{document.body.append(overlay);return()=>overlay.remove();};', fn('mountOverlay', domSource));
substitute("const queueBusy=()=>false,chosenModel=()=>null,DEFAULT_VIDEO_FAMILY='h3';", `
let fixtureQueueBusy=false,settingsReads=0;
let currentSettings={backend:'local',model:'fixture-model',temperature:.7,seed:17,language:'English',maxTokens:2048,skill:'',templates:{h3:'fixture-template'}};
const settings=()=>{settingsReads++;return currentSettings;};
const queueBusy=()=>fixtureQueueBusy,DEFAULT_VIDEO_FAMILY='h3';
${fn('chosenModel')}
`);
substitute("const openSettings=(anchor,onChange)=>openChoicePopover(anchor,{title:'Fixture refine settings',options:['Inspect only'],value:null,onPick:()=>onChange()});", `
const fixtureSettingsOpens=[];
const openSettings=(anchor,onChange,family)=>{
 fixtureSettingsOpens.push({family});
 return openChoicePopover(anchor,{title:'Fixture refine settings',options:['Inspect only'],value:null,onPick:()=>{currentSettings.language='Korean';onChange();}});
};`);
const baselineRoot = process.env.CONTINUITY_BASELINE_DIR;
if (baselineRoot && fs.existsSync(path.join(baselineRoot, 'web/creator/refine.js'))) {
  const baselineRefine = fs.readFileSync(path.join(baselineRoot, 'web/creator/refine.js'), 'utf8');
  for (const name of ['refine', 'refineRequest', 'chosenModel', 'chosenTemplate']) {
    assert.equal(fn(name), fn(name, baselineRefine), `Original ${name} request semantics`);
  }
  const baselineTimeline = fs.readFileSync(path.join(baselineRoot, 'web/creator/timeline.js'), 'utf8');
  const baselineEditor = fs.readFileSync(path.join(baselineRoot, 'web/creator/editor.js'), 'utf8');
  const withoutPromptVersion = source => source.replace(/^    this\.promptVersion = \(this\.promptVersion \?\? 0\) \+ 1;\r?\n/m, '');
  for (const name of ['refineAll', 'takePiece', 'setGlobalPrompt']) assert.equal(withoutPromptVersion(method(name)), withoutPromptVersion(method(name, baselineTimeline)), `Original Timeline.${name} except transient source-version guard`);
  // EXT50 deliberately changes the individual execution/apply scope. The rail
  // and shared two-press behavior remain exact; the new field fixture checks
  // the revised request and application instead of requiring the old audio leak.
  assert.equal(method('renderRail', editorSource), method('renderRail', baselineEditor), 'Original CreatorEditor.renderRail');
}
assert.match(refineSource, /^let armedRefine = null;$/m);
const panelSource = refineSource.slice(refineSource.indexOf('export class RefinePanel'));
const extra = `
const pieceFamily=piece=>S.pieceFamily(piece);
const templatesOf=()=>[{name:'fixture-template'}];
${['chosenTemplate','refineRequest','refine','refineField'].map(name=>fn(name)).join('\n')}
const refineModel=chosenModel;
const jobs=[],writes=[];
const runJob=(route,payload,options)=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 jobs.push({route,payload:structuredClone(payload),options,resolve,reject});
 return promise;
};
S.serializeTimeline=piece=>JSON.stringify(piece);
S.takesReferences=()=>true;S.takesKind=()=>true;S.blockedReason=()=>null;
S.controlOf=()=>null;S.canDo=()=>false;
class PanelFixture {
 get refined(){return this.getState().refined||null;}
 ${['ownedFields','apply','fail','clear'].map(name=>method(name,panelSource)).join('\n')}
 render(){this.renders=(this.renders||0)+1;this.root.textContent=this.problems?.join(' · ')||this.refined?.body||'';}
}
class EditorFixture {
 ${['renderRail','refine','commitPrompt'].map(name=>method(name,editorSource)).join('\n')}
 castResidentHere(){return this.kind==='node';}
 shelfShown(){return false;}
 commit(){this.commits++;writes.push([this.kind,'commit']);}
 syncPrompt(){this.promptSyncs=(this.promptSyncs||0)+1;}
 manageLoras(){}toggleCast(){}addReferences(){}openGallery(){}
}
class ActualTimelineRefine {
 ${['refineAll','takePiece','setGlobalPrompt'].map(name=>method(name)).join('\n')}
}
for(const name of ['refineAll','takePiece','setGlobalPrompt'])Subject.prototype[name]=ActualTimelineRefine.prototype[name];
const nodeTarget=function(){return ${target('faceBody')};};
const segmentTarget=function(index){return ${target('edit')};};
const panels=[],unmounts=[];
const clean=()=>{
 armedRefine?.();
 unmounts.splice(0).forEach(remove=>remove());
 if(window.subject?.overlay?.isConnected)subject.close();
 document.querySelectorAll('body > .mmc-pop,body > .fixture-node,body > .fixture-outside').forEach(node=>node.remove());
 panels.splice(0);
};
window.setup=(kind='node',options={})=>{
 clean();locale=options.language||'ko';fixtureQueueBusy=!!options.queued;
 document.documentElement.style.setProperty('--mmc-type',String(options.scale||1));
 jobs.splice(0);writes.splice(0);fixtureSettingsOpens.splice(0);
 if(kind==='timeline'||kind==='pair')setFixture({language:locale,scale:options.scale||1,segments:[{prompt:'First source prompt',duration_s:4},{prompt:'Second source prompt',duration_s:5}]});
 const outside=el('button',{class:'fixture-outside',text:'Outside'});document.body.append(outside);
 const makeEditor=(editorKind,index=0)=>{
  const timeline=kind==='pair'?subject.timeline:{family:'h3',render:'chained',prompt:'Original global prompt',soundscape:'Original sound',music:'Original music',assets:[],subjects:[],segments:[{prompt:'Original card one',duration_s:4},{prompt:'Original card two',duration_s:5}]};
  const host=new EditorFixture();host.kind=editorKind;host.timeline=timeline;host.state=timeline.segments[index];host.state.soundscape='Card ambience';host.state.music='Card score';host.piece=timeline;host.castPiece=timeline;host.commits=0;host.refinedEvents=[];host.onPromptCommit=()=>{host.commits++;writes.push([host.kind,'commit']);};
  host.refineTarget=editorKind==='node'?nodeTarget.call(host):segmentTarget.call(host,index);
  host.onRefined=editorKind==='segment'?result=>{host.refinedEvents.push(structuredClone(result));writes.push(['segment','onRefined']);}:null;
  host.refinePanel=new PanelFixture();Object.assign(host.refinePanel,{getState:()=>host.state,audioFields:editorKind==='node',promptOnly:true,root:el('div',{class:'mmc-refined'}),problems:[],seen:''});
  host.root=el('div',{class:'mmc-root fixture-editor','data-kind':editorKind},[host.renderRail(),el('div',{class:'fixture-prompt',text:host.state.prompt}),host.refinePanel.root]);
  host.button=host.root.querySelector('.mmc-refine-split > button');panels.push(host);
  return host;
 };
 if(kind==='node'||kind==='direct'||kind==='pair'){
  const node=makeEditor('node');window.editor=node;
  document.body.append(el('div',{class:'fixture-node'},[el('div',{class:'fixture-node-title',text:'Continuity - Extended'}),node.root]));
 }
 if(kind==='segment'){
  const nested=makeEditor('segment',1);window.editor=nested;
  const overlay=el('div',{class:'mmc-overlay fixture-segment'},[el('div',{class:'mmc-modal fixture-segment-modal'},[el('div',{class:'mmc-modal-head'},[el('div',{class:'mmc-tab',text:t('Segment {n}',{n:2})}),el('button',{class:'mmc-close',text:'×',onclick:()=>remove()})]),nested.root])]);
  const remove=mountOverlay(overlay,()=>remove());unmounts.push(remove);nested.overlay=overlay;
 }
 window.currentKind=kind;settingsReads=0;
 return inspect();
};
window.inspect=()=>({
 jobs:jobs.map(job=>({route:job.route,payload:job.payload,progress:typeof job.options.onProgress})),
 settingsReads,settings:JSON.stringify(currentSettings),settingsOpens:structuredClone(fixtureSettingsOpens),writes:structuredClone(writes),
 editors:panels.map(host=>({kind:host.kind,data:JSON.stringify(host.timeline),commits:host.commits,error:host.refinePanel.problems,refinedEvents:host.refinedEvents.length})),
 timeline:(currentKind==='timeline'||currentKind==='pair')?JSON.stringify(subject.timeline):null,
 commits:(currentKind==='timeline'||currentKind==='pair')?subject.commits:0,
});
window.resolveJob=(index=0,error=false)=>{
 if(error){jobs[index].reject(new Error('Fixture refiner failure'));return;}
 const job=jobs[index];job.resolve(job.payload.kind==='field'
  ?{scope:'field',target_scope:job.payload.scope,field:job.payload.field,index:job.payload.index,body:'Rewritten selected card',soundscape:'Forbidden sound sibling',music:'Forbidden music sibling',piece:'Forbidden global sibling',shots:[{index:0,body:'Forbidden card sibling'}],problems:[],template:'fixture-template'}
  :{shots:job.payload.kind==='timeline'?[{index:0,body:'Rewritten card one'},{index:1,body:'Rewritten card two'}]:[{body:'Rewritten selected card'}],scope:'shot',piece:job.payload.kind==='timeline'?'Rewritten global prompt':undefined,soundscape:'Rewritten sound',music:'Rewritten music',problems:[],template:'fixture-template'});
};
window.progress=(step,total=8)=>jobs[0].options.onProgress(step/total,step,total);
window.rebuildEditor=()=>{const host=editor;host.root.replaceChildren(host.renderRail(),el('div',{class:'fixture-prompt',text:host.state.prompt}),host.refinePanel.root);host.button=host.root.querySelector('.mmc-refine-split > button');};
window.useDirectRun=()=>{
 const previous=editor.root.querySelector('.mmc-refine-split');
 const split=refineButton({run:options=>runJob('/fixture/direct',{},options),family:()=>S.pieceFamily(editor.timeline)});
 previous.replaceWith(split);editor.button=split.firstElementChild;
};
window.confirmationIdle=()=>armedRefine===null;
setup();
`;
const code = bootstrap + extra;
new vm.Script(code, { filename: 'actual-refine-confirmation-fixture.js' });
let browser, networkRequests = 0;
const results = [], errors = [];
const artifacts = process.env.CONTINUITY_UX_SCREENSHOT_DIR || process.env.CONTINUITY_ARTIFACT_DIR;
const check = async (name, run) => { await run(); results.push({name,passed:true}); console.log('PASS '+name); };
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1600,height:1050}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{networkRequests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><head><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}.fixture-node{width:min(820px,calc(100vw - 32px));margin:24px 16px;border:1px solid #444;border-radius:8px;background:#303030}.fixture-node-title{font:12px sans-serif;color:#bbb;padding:8px 14px;background:#353535}.fixture-prompt{min-height:150px;padding:14px;font:13px/1.5 sans-serif;color:#ddd;background:#202020;border-radius:12px;margin:12px}.fixture-outside{position:fixed;bottom:8px;right:8px;z-index:1600}.fixture-segment-modal{width:min(850px,calc(100vw - 16px))}</style></head><body></body></html>');
 await page.evaluate(()=>{
  // Count the real temporary listeners and observer while forwarding every
  // native method unchanged. This is observation, not a cancellation adapter.
  const add=document.addEventListener,remove=document.removeEventListener;
  const listeners={pointerdown:new Set(),keydown:new Set()};
  const captures=options=>options===true||options?.capture===true;
  document.addEventListener=function(type,callback,options){if(listeners[type]&&captures(options))listeners[type].add(callback);return add.call(this,type,callback,options);};
  document.removeEventListener=function(type,callback,options){if(listeners[type]&&captures(options))listeners[type].delete(callback);return remove.call(this,type,callback,options);};
  const Native=MutationObserver;let observers=0;
  window.MutationObserver=class extends Native{
   observe(...args){if(!this.fixtureObserved){this.fixtureObserved=true;observers++;}return super.observe(...args);}
   disconnect(){if(this.fixtureObserved){this.fixtureObserved=false;observers--;}return super.disconnect();}
  };
  window.confirmationHooks=()=>({pointerdown:listeners.pointerdown.size,keydown:listeners.keydown.size,observers});
 });
 await page.evaluate('(()=>{'+code+'})()');
 const setup=async(kind='node',options={})=>page.evaluate(({kind,options})=>window.setup(kind,options),{kind,options});
 const snapshot=()=>page.evaluate(()=>inspect());
 const main=(kind='node')=>page.locator(kind==='timeline'?'.mmc-tl-refine':'.fixture-editor .mmc-refine-split > button:not(.mmc-refine-more)');
 const armed=async(kind='node')=>main(kind).evaluate(node=>node.classList.contains('mmc-refine-confirm'));
 const finish=async(error=false)=>{await page.evaluate(error=>resolveJob(0,error),error);await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));};
 const shot=async name=>{if(!artifacts)return;fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,name),fullPage:false});};
 await check('All three actual callers require a red Korean Confirm before any request, setting read or state write',async()=>{
  for(const kind of ['node','segment','timeline']){
   const before=await setup(kind);await main(kind).click();assert.deepEqual(await snapshot(),before);
   assert.equal(await main(kind).textContent(),'확인');assert.equal(await armed(kind),true);
   const color=await main(kind).evaluate(node=>getComputedStyle(node).color);
   const rgb=color.match(/[\d.]+/g).map(Number);assert.ok(rgb[0]>rgb[1]&&rgb[0]>rgb[2],color);
   assert.equal(await main(kind).locator('.mmc-spin').count(),0);
  }
 });
 await check('Main node confirms once and rewrites only its segment-zero prompt, ignoring all reply audio/global siblings',async()=>{
  const before=await setup('node');await main().click();await main().click();
  const running=await snapshot();assert.equal(running.jobs.length,1);assert.equal(running.jobs[0].route,'/continuity/refine');assert.equal(running.jobs[0].payload.kind,'field');assert.equal(running.jobs[0].payload.scope,'segment');assert.equal(running.jobs[0].payload.field,'prompt');assert.equal(running.jobs[0].payload.index,0);assert.equal(running.jobs[0].progress,'function');
  assert.deepEqual(running.jobs[0].payload.data,JSON.parse(before.editors[0].data));assert.equal(running.editors[0].commits,0);
  await finish();const after=await snapshot(),segment=JSON.parse(after.editors[0].data).segments[0];
  assert.equal(after.editors[0].commits,1);assert.equal(segment.prompt,'Original card one');assert.equal(segment.refined.body,'Rewritten selected card');assert.equal(segment.refined.replaced,undefined);assert.equal(segment.soundscape,'Card ambience');assert.equal(segment.music,'Card score');assert.equal(await main().textContent(),'리파인');
 });
 await check('Nested segment confirms once with its original target index and leaves editor audio untouched',async()=>{
  const before=await setup('segment');await main().click();await main().click();
  const running=await snapshot();assert.equal(running.jobs[0].payload.index,1);assert.deepEqual(running.jobs[0].payload.data,JSON.parse(before.editors[0].data));
  await finish();const after=await snapshot(),segment=JSON.parse(after.editors[0].data).segments[1];
  assert.equal(after.editors[0].commits,1);assert.equal(after.editors[0].refinedEvents,0);assert.equal(segment.refined.body,'Rewritten selected card');assert.equal(segment.soundscape,'Card ambience');assert.equal(segment.music,'Card score');assert.equal(segment.refined.replaced,undefined);
 });
 await check('Refine all confirms once and uses the original all-shot/global/audio application',async()=>{
  const before=await setup('timeline');await main('timeline').click();await main('timeline').click();const running=await snapshot();
  assert.equal(running.jobs.length,1);assert.equal(running.jobs[0].payload.kind,'timeline');assert.deepEqual(running.jobs[0].payload.data,JSON.parse(before.timeline));await finish();
  const after=await snapshot(),piece=JSON.parse(after.timeline);assert.deepEqual(piece.segments.map(segment=>segment.refined.body),['Rewritten card one','Rewritten card two']);assert.equal(piece.prompt,'Rewritten global prompt');assert.equal(piece.soundscape,'Rewritten sound');assert.equal(piece.music,'Rewritten music');assert.deepEqual(piece.refined.replaced,{soundscape:'Keep original recorded dialogue and ambience.',music:'N/A',prompt:JSON.parse(before.timeline).prompt});assert.equal(after.commits,2);
 });
 await check('Pointer leaving the split control or blurring the main button cancels without a request',async()=>{
  for(const action of ['leave','blur']){
   const before=await setup('node');await main().click();
   if(action==='leave')await page.mouse.move(1,1);else await page.locator('.fixture-outside').focus();
   assert.equal(await armed(),false);assert.deepEqual(await snapshot(),before);await main().click();assert.equal(await armed(),true);assert.deepEqual(await snapshot(),before);
  }
 });
 await check('Outside pointerdown cancels even without changing focus and is not consumed',async()=>{
  const before=await setup('node');await main().click();
  const result=await page.evaluate(()=>{const event=new PointerEvent('pointerdown',{bubbles:true,cancelable:true});document.querySelector('.fixture-outside').dispatchEvent(event);return event.defaultPrevented;});
  assert.equal(result,false);assert.equal(await armed(),false);assert.deepEqual(await snapshot(),before);
 });
 await check('Escape cancels the node confirmation, retains native overlay close, and reopening is unarmed',async()=>{
  let before=await setup('node');await main().click();await page.keyboard.press('Escape');assert.equal(await armed(),false);assert.deepEqual(await snapshot(),before);
  before=await setup('segment');await main().click();await page.keyboard.press('Escape');assert.equal(await page.locator('.fixture-segment').count(),0);assert.deepEqual(await snapshot(),before);
  await setup('segment');assert.equal(await armed(),false);await main().click();assert.equal((await snapshot()).jobs.length,0);
  before=await setup('timeline');await main('timeline').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.mmc-tl-modal').count(),0);assert.deepEqual(await snapshot(),before);
 });
 await check('The settings chevron stays independent and cancels Confirm before applying a settings change',async()=>{
  const before=await setup('node');await main().click();await page.locator('.fixture-editor .mmc-refine-more').click();
  assert.equal(await armed(),false);let after=await snapshot();assert.equal(after.jobs.length,0);assert.deepEqual(after.editors,before.editors);assert.deepEqual(after.settingsOpens,[{family:'h3'}]);
  await page.locator('.mmc-pop .mmc-opt').click();after=await snapshot();assert.equal(JSON.parse(after.settings).language,'Korean');assert.deepEqual(after.editors,before.editors);assert.equal(after.jobs.length,0);
 });
 await check('Different shared controls own independent busy state but never leave two confirmations armed',async()=>{
  const before=await setup('pair');await main().evaluate(node=>node.click());assert.equal(await armed(),true);
  // A programmatic click avoids relying on the outside-pointer or blur path:
  // this proves the shared armedRefine owner itself cancels the first instance.
  await main('timeline').evaluate(node=>node.click());assert.equal(await armed(),false);assert.equal(await armed('timeline'),true);assert.deepEqual(await snapshot(),before);
  await main('timeline').evaluate(node=>node.click());assert.equal((await snapshot()).jobs.length,1);await main().evaluate(node=>node.click());assert.equal(await armed(),true);assert.equal(await main('timeline').evaluate(node=>node.classList.contains('busy')),true);await finish();assert.equal((await snapshot()).jobs.length,1);
 });
 await check('Removal, reparenting and same-turn remove/reinsert invalidate the old confirmation without detached execution',async()=>{
  for(const action of ['remove','reinsert','reparent','button-reinsert']){
   const before=await setup('node');await main().evaluate(node=>node.click());
   await page.evaluate(action=>{
    const button=editor.button,split=button.parentElement,parent=split.parentElement;
    if(action==='remove')split.remove();
    if(action==='reinsert'){split.remove();parent.append(split);}
    if(action==='reparent')editor.root.append(split);
    if(action==='button-reinsert'){button.remove();split.prepend(button);}
    button.click();
   },action);
   assert.deepEqual(await snapshot(),before);assert.equal(await page.evaluate(()=>editor.button.classList.contains('mmc-refine-confirm')),false);
  }
 });
 await check('Hidden, aria-hidden, CSS-hidden and disabled owner states cancel and cannot invoke a stale click',async()=>{
  for(const action of ['hidden','aria-hidden','display','visibility','disabled']){
   const before=await setup('node');await main().click();await page.evaluate(action=>{
    const button=editor.button;
    if(action==='hidden')editor.root.hidden=true;
    if(action==='aria-hidden')editor.root.setAttribute('aria-hidden','true');
    if(action==='display')editor.root.style.display='none';
    if(action==='visibility')editor.root.style.visibility='hidden';
    if(action==='disabled')button.disabled=true;
    button.click();
   },action);assert.deepEqual(await snapshot(),before);assert.equal(await page.evaluate(()=>editor.button.classList.contains('mmc-refine-confirm')),false);
  }
 });
 await check('Owner redraw and close discard temporary confirmation; a replacement requires its own two presses',async()=>{
  const before=await setup('node');await main().click();await page.evaluate(()=>rebuildEditor());assert.equal(await armed(),false);assert.deepEqual(await snapshot(),{...before,settingsReads:2});
  // Tooltip construction retains its original chosenModel reads; no queue or
  // data write is caused by replacing a rail.
  await main().click();assert.equal((await snapshot()).jobs.length,0);await main().click();assert.equal((await snapshot()).jobs.length,1);await finish();
 });
 await check('Busy duplicate presses do not submit again; the original queue label, spinner and token progress are retained',async()=>{
  await setup('node',{queued:true});await main().click();await main().click();assert.equal(await main().textContent(),'렌더가 끝나기를 기다리는 중…');assert.equal(await main().locator('.mmc-spin').count(),1);
  await main().evaluate(node=>{node.click();node.click();});assert.equal((await snapshot()).jobs.length,1);await page.evaluate(()=>progress(3));assert.equal(await main().textContent(),'리파인 중… 3/8');await page.evaluate(()=>progress(0,0));assert.equal(await main().textContent(),'리파인 중…');await finish();assert.equal(await main().locator('.mmc-spin').count(),0);assert.equal(await armed(),false);assert.equal(await main().textContent(),'리파인');
 });
 await check('Errors preserve each original caller error surface and finally reset to a fresh two-press control',async()=>{
  for(const kind of ['node','segment','timeline']){
   const before=await setup(kind);await main(kind).click();await main(kind).click();await finish(true);assert.equal(await armed(kind),false);assert.equal(await main(kind).locator('.mmc-spin').count(),0);
   const after=await snapshot();if(kind==='timeline'){assert.equal(await page.evaluate(()=>subject.refineError),'Fixture refiner failure');assert.equal(after.timeline,before.timeline);}else{assert.deepEqual(after.editors[0].error,['Fixture refiner failure']);assert.equal(after.editors[0].data,before.editors[0].data);assert.equal(after.editors[0].commits,0);}
   await main(kind).click();assert.equal((await snapshot()).jobs.length,1);assert.equal(await armed(kind),true);
  }
 });
 await check('Rejected direct run retains original rejection/finally behavior rather than a stuck Confirm or spinner',async()=>{
  await setup('direct');await page.evaluate(()=>useDirectRun());await main().click();await main().click();const rejected=page.waitForEvent('pageerror');await finish(true);assert.equal((await rejected).message,'Fixture refiner failure');assert.equal(await main().textContent(),'리파인');assert.equal(await armed(),false);assert.equal(await main().locator('.mmc-spin').count(),0);assert.equal(errors.pop(),'Fixture refiner failure');await main().click();assert.equal((await snapshot()).jobs.length,1);
 });
 await check('Held native Enter and Space do not turn one intentional keypress into both arm and execute',async()=>{
  for(const key of ['Enter','Space']){
   const before=await setup('node');await main().focus();await page.keyboard.down(key);await page.keyboard.down(key);await page.keyboard.down(key);await page.keyboard.up(key);
   assert.equal(await armed(),true);assert.deepEqual(await snapshot(),before);await page.keyboard.press(key);assert.equal((await snapshot()).jobs.length,1);await finish();
  }
 });
 await check('Temporary width, class, shared owner and actual document listeners/observer are cleaned on cancel, completion and reopening',async()=>{
  await setup('node');const hooks=await page.evaluate(()=>confirmationHooks());const original=await main().evaluate(node=>({width:node.offsetWidth,min:node.style.minWidth}));await main().click();assert.ok(await main().evaluate(node=>node.offsetWidth)>=original.width);assert.deepEqual(await page.evaluate(()=>confirmationHooks()),{pointerdown:hooks.pointerdown+1,keydown:hooks.keydown+1,observers:hooks.observers+1});await page.mouse.move(1,1);assert.equal(await main().evaluate(node=>node.style.minWidth),original.min);assert.equal(await page.evaluate(()=>confirmationIdle()),true);assert.deepEqual(await page.evaluate(()=>confirmationHooks()),hooks);
  await main().click();await main().click();assert.deepEqual(await page.evaluate(()=>confirmationHooks()),hooks);await finish();assert.equal(await main().evaluate(node=>node.style.minWidth),original.min);assert.equal(await page.evaluate(()=>confirmationIdle()),true);assert.deepEqual(await page.evaluate(()=>confirmationHooks()),hooks);
  await setup('node');assert.equal(await page.evaluate(()=>confirmationIdle()),true);assert.equal(await armed(),false);assert.deepEqual(await page.evaluate(()=>confirmationHooks()),hooks);
 });
 await check('Canvas-style transform zoom keeps the main node confirmation box and independent chevron hitbox stable',async()=>{
  await page.setViewportSize({width:1600,height:1050});
  for(const zoom of [.65,1.5]){
   const before=await setup('node',{language:'ko'});await page.locator('.fixture-node').evaluate((node,zoom)=>{node.style.transformOrigin='0 0';node.style.transform='scale('+zoom+')';},zoom);
   const old=await main().boundingBox();const moreBefore=await page.locator('.fixture-editor .mmc-refine-more').boundingBox();
   await page.mouse.click(old.x+old.width/2,old.y+old.height/2);await page.evaluate(()=>new Promise(requestAnimationFrame));await page.mouse.move(old.x+old.width/2,old.y+old.height/2);
   assert.equal(await armed(),true);assert.deepEqual(await snapshot(),before);const box=await main().boundingBox(),more=await page.locator('.fixture-editor .mmc-refine-more').boundingBox();
   for(const key of ['x','y','width','height']){assert.ok(Math.abs(box[key]-old[key])<1,JSON.stringify({zoom,old,box}));assert.ok(Math.abs(more[key]-moreBefore[key])<1,JSON.stringify({zoom,moreBefore,more}));}
   assert.equal(await page.locator('.fixture-editor .mmc-refine-more').evaluate(node=>{const box=node.getBoundingClientRect();return node.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));}),true);
   await main().click();assert.equal((await snapshot()).jobs.length,1);await finish();
  }
 });
 await check('English/Korean desktop and 320/640 large type preserve original main/chevron hitboxes and stable two-press geometry',async()=>{
  for(const width of [1600,640,320])for(const language of ['en','ko'])for(const scale of [1,1.6])for(const kind of ['node','timeline']){
   await page.setViewportSize({width,height:1050});const before=await setup(kind,{language,scale});const button=main(kind);await button.scrollIntoViewIfNeeded();const old=await button.boundingBox();const oldMore=await button.evaluate(node=>node.parentElement.querySelector('.mmc-refine-more').getBoundingClientRect().toJSON());await page.mouse.click(old.x+old.width/2,old.y+old.height/2);await page.evaluate(()=>new Promise(requestAnimationFrame));await page.mouse.move(old.x+old.width/2,old.y+old.height/2);
   assert.equal(await armed(kind),true,JSON.stringify({width,language,scale,kind}));assert.deepEqual(await snapshot(),before);
   const geometry=await button.evaluate(node=>{const rect=n=>n.getBoundingClientRect().toJSON(),more=node.parentElement.querySelector('.mmc-refine-more'),a=rect(node),b=rect(more);return{a,b,scroll:node.scrollWidth,client:node.clientWidth,hit:node.contains(document.elementFromPoint(a.x+a.width/2,a.y+a.height/2)),moreHit:more.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),page:document.documentElement.scrollWidth,viewport:innerWidth};});
   assert.ok(geometry.a.width>=old.width-.5);if(kind==='timeline')assert.ok(geometry.a.right<=geometry.b.left+.5);else{assert.ok(Math.abs(geometry.b.x-oldMore.x)<.5);assert.ok(Math.abs(geometry.b.y-oldMore.y)<.5);assert.equal(geometry.b.width,oldMore.width);assert.equal(geometry.b.height,oldMore.height);}assert.ok(geometry.hit&&geometry.moreHit,JSON.stringify(geometry));assert.ok(geometry.scroll<=geometry.client+2,JSON.stringify(geometry));assert.ok(geometry.page<=geometry.viewport+1,JSON.stringify(geometry));
   if(language==='ko'&&scale===1.6){await shot(`refine-confirm-${kind}-${width}-ko-large.png`);assert.equal(await armed(kind),true,'Viewport screenshot must not cancel the real confirmation');assert.equal(await button.textContent(),'확인');}
   const beforeConfirm=await button.evaluate(node=>({armed:node.classList.contains('mmc-refine-confirm'),text:node.textContent,rect:node.getBoundingClientRect().toJSON()}));await button.click();assert.equal((await snapshot()).jobs.length,1,JSON.stringify({width,language,scale,kind,beforeConfirm,after:await button.evaluate(node=>({armed:node.classList.contains('mmc-refine-confirm'),text:node.textContent,rect:node.getBoundingClientRect().toJSON()}))}));await finish();
  }
 });
 assert.deepEqual(errors,[]);assert.equal(networkRequests,0);
 const report={suite:'refine-confirmation',passed:results.length,geometryCases:24,canvasZoomCases:2,networkRequests,pageErrors:errors,results,scope:'actual frontend callers/shared confirmation/request/application; RAM-only queue response and settings catalog adapters, no live refiner/GPU/render'};
 if(artifacts){fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
