// EXT50: actual Timeline header actions/global input callbacks, Editor execution,
// refineField request/response boundary and RefinePanel apply/clear. Only the
// queue, catalogs and unrelated media/card contents are RAM adapters. No model,
// ComfyUI server, filesystem media or external request is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = path.resolve(process.env.CONTINUITY_SOURCE_ROOT || path.join(__dirname, '../..'));
const creator = path.join(sourceRoot, 'web/creator');
const read = name => fs.readFileSync(path.join(creator, name), 'utf8');
const method = (name, source) => {
  const found = source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `Actual ${name}`); return found[0];
};
const fn = (name, source) => {
  const found = source.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `Actual ${name}`); return found[0].replace(/^export /, '');
};
const strip = source => source.replace(/^import\b[^]*?;\r?\n/gm, '').replace(/^export /gm, '');
const timeline = read('timeline.js'), cast = read('cast.js'), state = read('state.js');
const confirmationPath = path.join(sourceRoot, 'tests/browser/test-refine-confirmation.cjs');
const confirmation = fs.readFileSync(confirmationPath, 'utf8');
const preludeEnd = confirmation.indexOf('\nnew vm.Script(code,');
assert.ok(preludeEnd > 0, 'Actual-source shared confirmation setup');
const context = { require, console, __dirname: path.dirname(confirmationPath), process: { env: { ...process.env, CONTINUITY_SOURCE_ROOT: sourceRoot } } };
vm.runInNewContext(confirmation.slice(0, preludeEnd) + ';globalThis.fieldFixture={code,css};', context);
const extra = `
const pieceReferenceFields=()=>Object.assign(el('div'),{refresh(){}});
${strip(read('clear.js'))}
${strip(read('media-counts.js'))}
${['motionOf','subjectFiles','replacesOf','castAssets','sortByHandle'].map(name => fn(name, state)).join('\n')}
Object.assign(S,{subjectFiles,replacesOf,castAssets,sortByHandle,seedFeatures:()=>[],staleReplacementReferences:()=>[]});
class CastShelf {
 ${['constructor','render','typing','save','reveal','addSubject','clearCastButton'].map(name => method(name,cast)).join('\n')}
 problem(){return '';}
 card(member){return el('div',{class:'mmc-cast-card fixture-cast-card',text:'@'+member.handle});}
}
// The rich-text widget is an input-only adapter; its production owner's actual
// onInput callback below still owns state/version/callback/refresh behavior.
class PromptBox {
 constructor(options){this.options=options;this.root=el('div',{class:'mmc-prompt',contenteditable:'true',role:'textbox',oninput:()=>options.onInput(this.getValue())});this.frame=el('div',{},[this.root]);}
 getValue(){return this.root.textContent;}
 setValue(value){this.root.textContent=value;}
 closeMenu(){}refresh(){}
}
class FieldTimelineOps {
 ${['globalPromptBox','renderPool','renderCast','revertAll','dropTimelineRewrite'].map(name => method(name,timeline)).join('\n')}
 poolChip(asset){return el('span',{class:'mmc-asset',text:'@'+asset.handle});}
}
for(const name of ['globalPromptBox','renderPool','renderCast','revertAll','dropTimelineRewrite','poolChip'])Subject.prototype[name]=FieldTimelineOps.prototype[name];
window.setupField=(options={})=>{
 setup('timeline',{language:'en',...options});
 const piece=subject.timeline;
 piece.prompt='Original global prompt @subject';piece.soundscape='Original room ambience';piece.music='Original musical score';
 piece.assets=[{handle:'image-1',kind:'image',filename:'first.png'},{handle:'image-2',kind:'image',filename:'second.png'},{handle:'video-1',kind:'video',filename:'source.mp4'},{handle:'voice-1',kind:'audio',filename:'voice.wav'}];
 piece.subjects=[{handle:'subject',from:['image-1','image-2'],voice:'voice-1'}];
 piece.segments.forEach((segment,index)=>{Object.assign(segment,{prompt:'Original card '+index,soundscape:'Card '+index+' ambience',music:'Card '+index+' score',card_id:'fixture-'+index,take:{filename:'saved-'+index+'.mp4',type:'output'},hold:index===0});});
 piece.models={checkpoint:'retained-model.safetensors'};piece.extra={do_not_change:['alpha',3,{preserve:true}]};
 subject.promptBox.setValue(piece.prompt);subject.soundscapeBox.value=piece.soundscape;subject.musicBox.value=piece.music;
 subject.onPromptCommit=()=>subject.commits++;
 subject.renderPool();subject.renderCast();subject.updateSectionSummaries();subject.commits=0;jobs.splice(0);writes.splice(0);settingsReads=0;
 if(options.sections){for(const [key,opened]of Object.entries(options.sections)){const section=key==='prompt'?subject.promptSection:key==='soundscape'?subject.soundscapeSection:subject.musicSection;section.setOpen(opened);}}
 return fieldSnapshot();
};
window.fieldSnapshot=()=>({data:JSON.stringify(subject.timeline),jobs:jobs.map(job=>({route:job.route,payload:structuredClone(job.payload)})),commits:subject.commits,inputs:{prompt:subject.promptBox.getValue(),soundscape:subject.soundscapeBox.value,music:subject.musicBox.value},statuses:Object.fromEntries(Object.entries(subject.fieldRefineStatus||{}).map(([key,node])=>[key,{text:node.textContent,hidden:node.hidden}])),settingsReads});
window.resolveField=(index=0,patch={})=>{
 const payload=jobs[index].payload;
 jobs[index].resolve({scope:'field',target_scope:payload.scope,field:payload.field,index:payload.index,body:'Rewritten '+payload.field,template:'fixture-template',problems:[],
   piece:'Forbidden global sibling',soundscape:'Forbidden sound sibling',music:'Forbidden music sibling',shots:[{index:0,body:'Forbidden card zero'},{index:1,body:'Forbidden card one'}],sections:{reference:'Forbidden analysis sibling'},...patch});
};
window.rejectField=(index=0,message='Fixture refiner failure')=>jobs[index].reject(new Error(message));
window.fieldInput=(key,text)=>{
 const input=key==='prompt'?subject.promptBox.root:key==='soundscape'?subject.soundscapeBox:subject.musicBox;
 if(key==='prompt')input.textContent=text;else input.value=text;
 input.dispatchEvent(new Event('input',{bubbles:true}));
};
window.attachEditor=(index=0)=>{
 const host=editor;host.state=host.timeline.segments[index];host.refineTarget=()=>({kind:'segment',index,data:JSON.parse(S.serializeTimeline(host.timeline))});return inspect();
};
window.attachTimelineEditor=(index=0)=>{
 const host=new EditorFixture(),piece=subject.timeline;
 Object.assign(host,{kind:'segment',timeline:piece,piece,castPiece:piece,state:piece.segments[index],commits:0,refinedEvents:[],refineTarget:()=>({kind:'segment',index,data:JSON.parse(S.serializeTimeline(piece))}),onRefined:result=>host.refinedEvents.push(result)});
 host.onPromptCommit=()=>{host.commits++;writes.push([host.kind,'commit']);};
 host.refinePanel=new PanelFixture();Object.assign(host.refinePanel,{getState:()=>host.state,audioFields:false,promptOnly:true,root:el('div',{class:'mmc-refined'}),problems:[],seen:''});
 host.root=el('div',{class:'mmc-root fixture-editor',style:{position:'fixed',right:'16px',top:'16px',width:'420px',zIndex:'1450',background:'#202020',padding:'12px'}},[host.renderRail(),host.refinePanel.root]);
 document.body.append(host.root);host.button=host.root.querySelector('.mmc-refine-split > button');panels.push(host);window.editor=host;
};
window.clearEditorRewrite=()=>{editor.refinePanel.onCommit=()=>editor.commit();editor.refinePanel.onRevert=()=>{editor.revertEvents=(editor.revertEvents||0)+1;};editor.refinePanel.clear();};
window.directField=(target,field)=>refineField(target,field,{onProgress(){}}).then(result=>({ok:true,result}),error=>({ok:false,message:error.message}));
setupField();
`;
const code = context.fieldFixture.code + extra;
const css = context.fieldFixture.css;
new vm.Script(code, { filename: 'actual-field-refine-fixture.js' });
let browser, requests = 0;
const results = [], errors = [];
const artifacts = process.env.CONTINUITY_UX_SCREENSHOT_DIR || process.env.CONTINUITY_ARTIFACT_DIR;
const check = async (name, run) => { await run(); results.push({ name, passed: true }); console.log('PASS ' + name); };
const nonTarget = (data, key) => { const copy = structuredClone(data); delete copy[key]; return JSON.stringify(copy); };
const withoutSelectedRewrite = (data, index) => { const copy = structuredClone(data); delete copy.segments[index].refined; return JSON.stringify(copy); };
(async () => {
 browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
 const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
 page.on('pageerror', error => errors.push(error.message));
 await page.route('**/*', route => { requests++; return route.abort(); });
 await page.setContent('<html class="dark-theme"><head><style>' + css + ':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}.fixture-cast-card{padding:12px}.fixture-node{width:min(820px,calc(100vw - 32px));margin:24px 16px;border:1px solid #444;border-radius:8px;background:#303030}.fixture-node-title{font:12px sans-serif;padding:8px 14px}.fixture-prompt{padding:14px;min-height:150px}.fixture-outside{position:fixed;bottom:8px;right:8px;z-index:1600}</style></head><body></body></html>');
 await page.evaluate('(()=>{' + code + '})()');
 const setup = options => page.evaluate(options => setupField(options), options);
 const snapshot = () => page.evaluate(() => fieldSnapshot());
 const fieldButton = key => page.locator(`button.mmc-tl-field-refine[data-mmc-refine-field="${key}"]`);
 const execute = async key => { await fieldButton(key).click(); await fieldButton(key).click(); };
 const resolve = async patch => { await page.evaluate(patch => resolveField(0,patch||{}), patch); await page.waitForFunction(() => !document.querySelector('.mmc-refine-split > .busy')); };
 const mainEditor = () => page.locator('.fixture-editor .mmc-refine-split > button:not(.mmc-refine-more)');
 const finishEditor = async patch => { await page.evaluate(patch => resolveField(0,patch||{}), patch); await page.waitForFunction(() => !document.querySelector('.fixture-editor .busy')); };
 const shot = async name => { if (!artifacts) return; fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,name),fullPage:false}); };

 await check('All three field headers have one plain Refine pill with independent settings and no prose previews',async()=>{
  const before=await setup({language:'ko'});assert.equal(await page.locator('button.mmc-tl-field-refine').count(),3);
  assert.deepEqual(await page.locator('button.mmc-tl-field-refine').allTextContents(),['리파인','리파인','리파인']);
  const details=await page.evaluate(()=>['prompt','soundscape','music'].map(key=>{const section=key==='prompt'?subject.promptSection:key==='soundscape'?subject.soundscapeSection:subject.musicSection;return{key,hint:section.head.querySelector('.mmc-tl-section-hint').textContent,hidden:section.head.querySelector('.mmc-tl-section-hint').hidden,button:section.head.querySelector('.mmc-tl-field-refine').dataset.mmcRefineField,settings:section.head.querySelectorAll('.mmc-refine-more').length};}));
  assert.deepEqual(details.map(item=>[item.key,item.hint,item.hidden,item.button,item.settings]),['prompt','soundscape','music'].map(key=>[key,'',true,key,1]));
  assert.deepEqual(await snapshot(),before);
 });
 await check('Actual reference and cast count pills stay visible while only text previews disappear',async()=>{
  await setup();assert.deepEqual(await page.evaluate(()=>({pool:[...subject.poolSection.head.querySelectorAll('.mmc-media-count')].map(node=>node.textContent),cast:[...subject.castShelf.section.head.querySelectorAll('.mmc-media-count')].map(node=>node.textContent)})),{pool:['Images 2','Videos 1','Audio 1'],cast:['Cast 1','Supporting images 2','Audio 1']});
  assert.ok(!(await page.locator('.mmc-tl-section-head').allTextContents()).some(text=>text.includes('Original global prompt')||text.includes('Original room ambience')||text.includes('Original musical score')));
 });
 await check('First Korean Confirm on each field is red and data/settings/network free without folding its input',async()=>{
  for(const key of ['prompt','soundscape','music']){const before=await setup({language:'ko'});const opened=await page.evaluate(key=>(key==='prompt'?subject.promptSection:key==='soundscape'?subject.soundscapeSection:subject.musicSection).isOpen(),key);await fieldButton(key).click();assert.deepEqual(await snapshot(),before);assert.equal(await fieldButton(key).textContent(),'확인');assert.equal(await fieldButton(key).evaluate(node=>node.classList.contains('mmc-refine-confirm')),true);assert.equal(await page.evaluate(key=>(key==='prompt'?subject.promptSection:key==='soundscape'?subject.soundscapeSection:subject.musicSection).isOpen(),key),opened);const rgb=(await fieldButton(key).evaluate(node=>getComputedStyle(node).color)).match(/[\d.]+/g).map(Number);assert.ok(rgb[0]>rgb[1]&&rgb[0]>rgb[2]);}
 });
 await check('Global Refine requests only timeline.prompt and updates only that string and its actual input',async()=>{
  const before=await setup();await execute('prompt');const running=await snapshot();assert.equal(running.jobs.length,1);assert.deepEqual([running.jobs[0].payload.kind,running.jobs[0].payload.scope,running.jobs[0].payload.field,running.jobs[0].payload.index],['field','timeline','prompt',null]);assert.deepEqual(running.jobs[0].payload.data,JSON.parse(before.data));await resolve();const after=await snapshot(),piece=JSON.parse(after.data);assert.equal(piece.prompt,'Rewritten prompt');assert.equal(after.inputs.prompt,piece.prompt);assert.equal(nonTarget(piece,'prompt'),nonTarget(JSON.parse(before.data),'prompt'));assert.equal(after.commits,1);assert.equal(piece.refined,undefined);
 });
 await check('Sound and music independently target their own field even when a reply carries forbidden sibling rewrites',async()=>{
  for(const key of ['soundscape','music']){const before=await setup();await execute(key);const running=await snapshot();assert.deepEqual([running.jobs[0].payload.kind,running.jobs[0].payload.scope,running.jobs[0].payload.field],['field','timeline',key]);assert.equal(running.jobs[0].payload.index,null);await resolve();const after=await snapshot(),piece=JSON.parse(after.data);assert.equal(piece[key],'Rewritten '+key);assert.equal(after.inputs[key],piece[key]);assert.equal(nonTarget(piece,key),nonTarget(JSON.parse(before.data),key));assert.equal(after.commits,1);}
 });
 await check('Sequential plain Refine operations never rewrite already accepted neighboring fields or cards',async()=>{
  let before=await setup();for(const key of ['music','prompt','soundscape']){await execute(key);const index=(await snapshot()).jobs.length-1;await page.evaluate(index=>resolveField(index),index);await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));const after=await snapshot();assert.equal(nonTarget(JSON.parse(after.data),key),nonTarget(JSON.parse(before.data),key));before=after;}assert.deepEqual(JSON.parse(before.data).segments.map(segment=>segment.prompt),['Original card 0','Original card 1']);assert.equal(before.commits,3);
 });
 await check('Field Refine stays available when folded and does not couple sound/music expansion state',async()=>{
  for(const combo of [{prompt:false,soundscape:false,music:true},{prompt:true,soundscape:true,music:false},{prompt:false,soundscape:false,music:false}]){const before=await setup({sections:combo});await execute('soundscape');await resolve();const after=await snapshot();assert.equal(nonTarget(JSON.parse(after.data),'soundscape'),nonTarget(JSON.parse(before.data),'soundscape'));assert.deepEqual(await page.evaluate(()=>({prompt:subject.promptSection.isOpen(),soundscape:subject.soundscapeSection.isOpen(),music:subject.musicSection.isOpen()})),combo);}
 });
 await check('Opening per-field settings cancels Confirm without applying or folding; settings remain common configuration only',async()=>{
  const before=await setup({sections:{music:false}});await fieldButton('music').click();await fieldButton('music').evaluate(node=>node.parentElement.querySelector('.mmc-refine-more').click());assert.equal(await fieldButton('music').textContent(),'Refine');assert.equal((await snapshot()).data,before.data);assert.equal((await snapshot()).jobs.length,0);assert.equal(await page.evaluate(()=>subject.musicSection.isOpen()),false);assert.deepEqual(await page.evaluate(()=>inspect().settingsOpens),[{family:'h3'}]);
 });
 await check('Enter and Space arm then execute a field without held-key double submission or disclosure toggle',async()=>{
  for(const keypress of ['Enter','Space']){const before=await setup({sections:{prompt:false}});await fieldButton('prompt').focus();await page.keyboard.down(keypress);await page.keyboard.down(keypress);await page.keyboard.up(keypress);assert.equal((await snapshot()).data,before.data);assert.equal((await snapshot()).jobs.length,0);assert.equal(await fieldButton('prompt').textContent(),'Confirm');await page.keyboard.press(keypress);assert.equal((await snapshot()).jobs.length,1);await resolve();assert.equal(await page.evaluate(()=>subject.promptSection.isOpen()),false);}
 });
 await check('Wrong field, owner scope, absent body and old broad replies are rejected without any content mutation',async()=>{
  for(const patch of [{field:'music'},{target_scope:'segment'},{scope:'shot'}, {body:''},{body:undefined},{body:5}]){const before=await setup();await execute('prompt');await resolve(patch);const after=await snapshot();assert.equal(after.data,before.data);assert.equal(after.commits,0);assert.ok(after.statuses.prompt.text);assert.equal(after.statuses.prompt.hidden,false);assert.equal(await fieldButton('prompt').textContent(),'Refine');}
 });
 await check('Legacy running Python rejection reports a restart requirement and does not fall back to whole-piece refining',async()=>{
  const before=await setup();await execute('prompt');await page.evaluate(()=>rejectField(0,"unknown refine target 'field'"));await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));const after=await snapshot();assert.equal(after.data,before.data);assert.equal(after.jobs.length,1);assert.equal(after.commits,0);assert.match(after.statuses.prompt.text,/Restart ComfyUI/);
 });
 await check('Selected field edits, transient edit-and-restore, own-property changes and visible-input changes reject late results',async()=>{
  for(const action of ['edit','restore','owned','visible']){await setup();await execute('soundscape');await page.evaluate(action=>{if(action==='edit')fieldInput('soundscape','User edit while waiting');if(action==='restore'){const value=subject.timeline.soundscape;fieldInput('soundscape','Temporary user edit');fieldInput('soundscape',value);}if(action==='owned')delete subject.timeline.soundscape;if(action==='visible')subject.soundscapeBox.value='Unsaved native visible edit';},action);const before=await snapshot();await resolve();const after=await snapshot();assert.equal(after.data,before.data);assert.equal(after.inputs.soundscape,before.inputs.soundscape);assert.equal(after.commits,before.commits);assert.ok(after.statuses.soundscape.text);}
 });
 await check('Late results cannot apply to a disconnected field, closed Timeline or replacement owner',async()=>{
  for(const action of ['disconnect','close','replace']){await setup();await execute('music');await page.evaluate(action=>{if(action==='disconnect')subject.musicBox.remove();if(action==='close')subject.close();if(action==='replace')subject.timeline=structuredClone(subject.timeline);},action);const before=await snapshot();await page.evaluate(()=>resolveField());await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));const after=await snapshot();assert.equal(after.data,before.data);assert.equal(after.commits,before.commits);}
 });
 await check('A neighboring field edit survives another selected field result; no field data rollback is introduced',async()=>{
  const before=await setup();await execute('prompt');await page.evaluate(()=>fieldInput('music','New user score during global refine'));await resolve();const after=await snapshot(),piece=JSON.parse(after.data);assert.equal(piece.prompt,'Rewritten prompt');assert.equal(piece.music,'New user score during global refine');assert.equal(piece.soundscape,JSON.parse(before.data).soundscape);assert.equal(JSON.stringify(piece.segments),JSON.stringify(JSON.parse(before.data).segments));
 });
 await check('Node and every selected segment request only their own prompt and never call global onRefined',async()=>{
  for(const kind of ['node','segment'])for(const index of [0,1]){await page.evaluate(kind=>setup(kind),kind);await page.evaluate(index=>attachEditor(index),index);const before=await page.evaluate(()=>inspect());await mainEditor().click();assert.deepEqual(await page.evaluate(()=>inspect()),before);await mainEditor().click();const running=await page.evaluate(()=>inspect());assert.deepEqual([running.jobs[0].payload.kind,running.jobs[0].payload.scope,running.jobs[0].payload.field,running.jobs[0].payload.index],['field','segment','prompt',index]);await finishEditor();const after=await page.evaluate(()=>inspect()),piece=JSON.parse(after.editors[0].data);assert.equal(piece.segments[index].refined.body,'Rewritten prompt');assert.equal(piece.segments[index].refined.scope,'shot');assert.equal(withoutSelectedRewrite(piece,index),withoutSelectedRewrite(JSON.parse(before.editors[0].data),index));assert.equal(after.editors[0].refinedEvents,0);assert.equal(after.editors[0].commits,1);}
 });
 await check('Creator-scope mapping chooses segment zero and invalid individual field scopes never start a job',async()=>{
  await page.evaluate(()=>setup('node'));const before=await page.evaluate(()=>inspect());const rejected=await page.evaluate(async()=>{const data=JSON.parse(inspect().editors[0].data);return Promise.all([directField({kind:'segment',index:0,data},'soundscape'),directField({kind:'segment',index:0,data},'music'),directField({kind:'garbage',data},'prompt'),directField({kind:'timeline',data},'invalid')]);});assert.ok(rejected.every(item=>item.ok===false));assert.deepEqual(await page.evaluate(()=>inspect()),before);
  const pending=page.evaluate(()=>{window.directPromise=directField({kind:'creator',data:JSON.parse(inspect().editors[0].data)},'prompt');});await pending;assert.equal((await page.evaluate(()=>inspect())).jobs[0].payload.index,0);await page.evaluate(()=>resolveField());const result=await page.evaluate(()=>directPromise);assert.equal(result.ok,true);
 });
 await check('Individual Revert preserves own/whole-piece audio and does not invoke global revert callbacks even for legacy snapshots',async()=>{
  for(const legacy of [false,true]){await page.evaluate(()=>setup('node'));if(legacy)await page.evaluate(()=>{editor.state.refined={body:'Old rewrite',replaced:{soundscape:'Do not restore old sound',music:'Do not restore old score'},sections:{reference:'Keep existing reference analysis'}};});const before=await page.evaluate(()=>inspect());if(!legacy){await mainEditor().click();await mainEditor().click();await finishEditor();}await page.evaluate(()=>clearEditorRewrite());const after=await page.evaluate(()=>inspect()),piece=JSON.parse(after.editors[0].data);assert.equal(piece.segments[0].refined,undefined);assert.equal(withoutSelectedRewrite(piece,0),withoutSelectedRewrite(JSON.parse(before.editors[0].data),0));assert.equal(await page.evaluate(()=>editor.revertEvents||0),0);}
 });
 await check('Individual replies cannot replace existing reference analysis sections belonging to earlier all-refine',async()=>{
  await page.evaluate(()=>setup('segment'));await page.evaluate(()=>{editor.state.refined={body:'Earlier selected rewrite',sections:{reference:'Preserve original analysis'},replaced:{soundscape:'Old snapshot'}};});await mainEditor().click();await mainEditor().click();await finishEditor({sections:{reference:'Forbidden replacement'}});const result=JSON.parse((await page.evaluate(()=>inspect())).editors[0].data).segments[1];assert.deepEqual(result.refined.sections,{reference:'Preserve original analysis'});assert.equal(result.refined.replaced,undefined);assert.equal(result.soundscape,'Card ambience');
 });
 await check('Plain Editor commits its prompt without entering the general checkpoint/Turbo/LoRA normalization path',async()=>{
  await page.evaluate(()=>setup('node'));await page.evaluate(()=>{editor.timeline.models={checkpoint:'deliberately-unmatched.safetensors'};editor.timeline.loras=[{name:'preserve-unpinned.safetensors',family:'legacy'}];editor.timeline.turbo={custom:true};editor.commit=()=>{throw new Error('General commit must not be reached by prompt refinement');};});const before=await page.evaluate(()=>inspect());await mainEditor().click();await mainEditor().click();await finishEditor();const after=await page.evaluate(()=>inspect()),piece=JSON.parse(after.editors[0].data);assert.equal(withoutSelectedRewrite(piece,0),withoutSelectedRewrite(JSON.parse(before.editors[0].data),0));assert.equal(after.editors[0].commits,1);assert.equal(await page.evaluate(()=>editor.promptSyncs),1);assert.equal(after.editors[0].error.length,0);
 });
 await check('Header field commit avoids general sync/strip/LoRA normalization even with unusual saved model values',async()=>{
  const before=await setup();await page.evaluate(()=>{subject.commit=()=>{throw new Error('General Timeline commit must not run for selected field');};subject.renderStrip=()=>{throw new Error('Strip rebuild is unrelated to a global field');};subject.renderLoras=()=>{throw new Error('LoRA pin normalization is unrelated to a global field');};});await execute('prompt');await resolve();const after=await snapshot();assert.equal(nonTarget(JSON.parse(after.data),'prompt'),nonTarget(JSON.parse(before.data),'prompt'));assert.equal(after.commits,1);assert.equal(after.statuses.prompt.text,'');
 });
 await check('Edited, replaced, detached, destroyed and reverted Editor owners reject late individual replies',async()=>{
  for(const action of ['edit','sibling','replace','detach','destroy','epoch']){await page.evaluate(()=>setup('node'));await mainEditor().click();await mainEditor().click();await page.evaluate(action=>{if(action==='edit')editor.state.prompt='User selected edit';if(action==='sibling')editor.timeline.music='User sibling edit';if(action==='replace')editor.state=structuredClone(editor.state);if(action==='detach')editor.root.remove();if(action==='destroy')editor.destroyed=true;if(action==='epoch')editor.refineEpoch=(editor.refineEpoch||0)+1;},action);const before=await page.evaluate(()=>inspect());await finishEditor();const after=await page.evaluate(()=>inspect());assert.equal(after.editors[0].data,before.editors[0].data);assert.equal(after.editors[0].commits,before.editors[0].commits);assert.equal(after.editors[0].refinedEvents,0);}
 });
 await check('Only Refine all still accepts all-shot/global/audio rewriting and its original Revert all snapshot',async()=>{
  const before=await setup();await page.locator('.mmc-tl-refine').click();assert.equal((await snapshot()).jobs.length,0);await page.locator('.mmc-tl-refine').click();assert.equal((await snapshot()).jobs[0].payload.kind,'timeline');await page.evaluate(()=>resolveJob());await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));let after=await snapshot(),piece=JSON.parse(after.data);assert.equal(piece.prompt,'Rewritten global prompt');assert.equal(piece.soundscape,'Rewritten sound');assert.equal(piece.music,'Rewritten music');assert.deepEqual(piece.segments.map(segment=>segment.refined.body),['Rewritten card one','Rewritten card two']);await page.locator('.mmc-tl-unrefine').click();piece=JSON.parse((await snapshot()).data);for(const key of ['prompt','soundscape','music'])assert.equal(piece[key],JSON.parse(before.data)[key]);assert.ok(piece.segments.every(segment=>!segment.refined));
 });
 await check('Mixed field/all/field/segment/revert operations keep the all-refine snapshot and unambiguous Refine all label',async()=>{
  await setup();for(const key of ['prompt','music']){await execute(key);const index=(await snapshot()).jobs.length-1;await page.evaluate(index=>resolveField(index),index);await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));assert.equal(await page.locator('.mmc-tl-refine').textContent(),'Refine all');}
  const beforeAll=JSON.parse((await snapshot()).data);await page.locator('.mmc-tl-refine').click();await page.locator('.mmc-tl-refine').click();let index=(await snapshot()).jobs.length-1;await page.evaluate(index=>resolveJob(index),index);await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));
  let piece=JSON.parse((await snapshot()).data);const wholeSnapshot=JSON.stringify(piece.refined),siblings=JSON.stringify(piece.segments);assert.deepEqual(piece.refined.replaced,{soundscape:beforeAll.soundscape,music:beforeAll.music,prompt:beforeAll.prompt});assert.equal(await page.locator('.mmc-tl-refine').textContent(),'Refine all');
  await execute('prompt');index=(await snapshot()).jobs.length-1;await page.evaluate(index=>resolveField(index,{body:'User-selected later global rewrite'}),index);await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));piece=JSON.parse((await snapshot()).data);assert.equal(piece.prompt,'User-selected later global rewrite');assert.equal(JSON.stringify(piece.refined),wholeSnapshot);assert.equal(JSON.stringify(piece.segments),siblings);assert.equal(await page.locator('.mmc-tl-refine').textContent(),'Refine all');
  const beforeSegment=piece;await page.evaluate(()=>attachTimelineEditor(0));await mainEditor().click();await mainEditor().click();index=(await snapshot()).jobs.length-1;await page.evaluate(index=>resolveField(index),index);await page.waitForFunction(()=>!document.querySelector('.fixture-editor .busy'));piece=JSON.parse((await snapshot()).data);assert.equal(withoutSelectedRewrite(piece,0),withoutSelectedRewrite(beforeSegment,0));assert.equal(JSON.stringify(piece.refined),wholeSnapshot);assert.equal(piece.segments[0].refined.body,'Rewritten prompt');
  await page.evaluate(()=>clearEditorRewrite());piece=JSON.parse((await snapshot()).data);assert.equal(JSON.stringify(piece.refined),wholeSnapshot);assert.equal(piece.prompt,beforeSegment.prompt);assert.equal(piece.soundscape,beforeSegment.soundscape);assert.equal(piece.music,beforeSegment.music);assert.deepEqual(piece.segments[1],beforeSegment.segments[1]);assert.equal(await page.evaluate(()=>editor.revertEvents||0),0);await page.evaluate(()=>editor.root.remove());
  assert.equal(await page.locator('.mmc-tl-refine').textContent(),'Refine all');await page.locator('.mmc-tl-unrefine').click();piece=JSON.parse((await snapshot()).data);for(const key of ['prompt','soundscape','music'])assert.equal(piece[key],beforeAll[key]);assert.ok(piece.segments.every(segment=>!segment.refined));assert.equal(await page.locator('.mmc-tl-refine').textContent(),'Refine all');
 });
 await check('Overlapping global/segment/plain/all operations on one piece are refused before a second API request',async()=>{
  for(const first of ['field','segment','all']){await setup();if(first==='field')await execute('prompt');else if(first==='segment'){await page.evaluate(()=>attachTimelineEditor(0));await mainEditor().click();await mainEditor().click();}else{await page.locator('.mmc-tl-refine').click();await page.locator('.mmc-tl-refine').click();}
   const before=await snapshot();if(first!=='all'){if(first==='segment')await page.evaluate(()=>editor.root.remove());await page.locator('.mmc-tl-refine').click();await page.locator('.mmc-tl-refine').click();await page.waitForFunction(()=>!document.querySelector('.mmc-tl-refine.busy'));assert.match(await page.evaluate(()=>subject.refineError),/Another refine is running/);}else{await execute('soundscape');await page.waitForFunction(()=>!document.querySelector('.mmc-tl-field-refine[data-mmc-refine-field="soundscape"].busy'));assert.match((await snapshot()).statuses.soundscape.text,/Another refine is running/);await page.evaluate(()=>attachTimelineEditor(0));await mainEditor().click();await mainEditor().click();await page.waitForFunction(()=>!document.querySelector('.fixture-editor .busy'));assert.match((await page.evaluate(()=>inspect())).editors[0].error[0],/Another refine is running/);await page.evaluate(()=>editor.root.remove());}
   assert.equal((await snapshot()).jobs.length,1);assert.equal((await snapshot()).data,before.data);if(first==='all')await page.evaluate(()=>resolveJob());else await page.evaluate(()=>resolveField());await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));
  }
 });
 await check('Owner locks release after errors and stale returns, stay out of saved data, and permit unrelated pieces to refine',async()=>{
  for(const first of ['error','stale']){await setup();await execute('prompt');if(first==='error')await page.evaluate(()=>rejectField());else{await page.evaluate(()=>fieldInput('prompt','User edit'));await page.evaluate(()=>resolveField());}await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));const before=await snapshot();await execute('music');assert.equal((await snapshot()).jobs.length,2);await page.evaluate(()=>resolveField(1));await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));assert.equal(nonTarget(JSON.parse((await snapshot()).data),'music'),nonTarget(JSON.parse(before.data),'music'));}
  await setup();await execute('prompt');const piece=JSON.parse((await snapshot()).data);await page.evaluate(()=>{attachTimelineEditor(0);editor.timeline=structuredClone(subject.timeline);editor.piece=editor.timeline;editor.castPiece=editor.timeline;editor.state=editor.timeline.segments[0];editor.refineTarget=()=>({kind:'segment',index:0,data:JSON.parse(JSON.stringify(editor.timeline))});});await mainEditor().click();await mainEditor().click();assert.equal((await snapshot()).jobs.length,2);await page.evaluate(()=>{resolveField(1);resolveField(0);});await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));assert.equal(nonTarget(JSON.parse((await snapshot()).data),'prompt'),nonTarget(piece,'prompt'));assert.equal(await page.evaluate(()=>editor.state.refined.body),'Rewritten prompt');assert.equal(JSON.parse((await snapshot()).data).refineOwners,undefined);await page.evaluate(()=>editor.root.remove());
 });
 await check('Original two-press N/A and per-field Undo remain separate from field-refine content and audio ownership',async()=>{
  const before=await setup();const na=page.locator('button.mmc-tl-na').first();await na.click();assert.equal((await snapshot()).data,before.data);await na.click();let after=await snapshot(),piece=JSON.parse(after.data);assert.equal(piece.soundscape,'N/A');assert.equal(nonTarget(piece,'soundscape'),nonTarget(JSON.parse(before.data),'soundscape'));await page.locator('.mmc-tl-na-undo').click();assert.equal((await snapshot()).data,before.data);await execute('music');await resolve();after=await snapshot();assert.equal(JSON.parse(after.data).soundscape,JSON.parse(before.data).soundscape);
 });
 await check('English/Korean small and large type keep all field pills hit-testable, rounded and independent without page overflow',async()=>{
  for(const width of [1600,640,320])for(const language of ['en','ko'])for(const scale of [1,1.6]){await page.setViewportSize({width,height:1050});await setup({language,scale,sections:{prompt:false,soundscape:false,music:false}});for(const key of ['prompt','soundscape','music']){const button=fieldButton(key);await button.scrollIntoViewIfNeeded();const before=await snapshot();const old=await button.boundingBox();await button.click();const box=await button.boundingBox();const geometry=await button.evaluate(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node),more=node.parentElement.querySelector('.mmc-refine-more'),m=more.getBoundingClientRect();return{hit:node.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)),moreHit:more.contains(document.elementFromPoint(m.x+m.width/2,m.y+m.height/2)),rounded:parseFloat(style.borderTopLeftRadius),page:document.documentElement.scrollWidth,width:innerWidth,scroll:node.scrollWidth,client:node.clientWidth};});assert.deepEqual(await snapshot(),before);assert.ok(geometry.hit&&geometry.moreHit&&geometry.rounded>=12,JSON.stringify({width,language,scale,key,geometry}));assert.ok(geometry.page<=geometry.width+1&&geometry.scroll<=geometry.client+2,JSON.stringify(geometry));assert.ok(box.width>=old.width-.5);await page.mouse.move(1,1);}
   if(language==='ko'&&scale===1.6){await setup({language,scale,sections:{prompt:false,soundscape:true,music:false}});await shot('field-refine-'+width+'-ko-large.png');}
  }
 });
 assert.deepEqual(errors,[]);assert.equal(requests,0);
 const report={suite:'field-refine',passed:results.length,responsiveCases:12,fieldHitboxCases:36,networkRequests:requests,pageErrors:errors,results,scope:'actual frontend selectedfield/segment request, application and staleownership; RAM-only jobs and input/catalog/media adapters, no live model/API/GPU'};
 if(artifacts){fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
