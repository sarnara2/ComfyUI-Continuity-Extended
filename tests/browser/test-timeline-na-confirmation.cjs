// Current production Timeline mount/audio/Undo/disclosure/CSS from the shared
// real-source header fixture, with the REAL overlay Escape lifecycle. No live
// ComfyUI, media/catalog writes, model execution, rendering or GPU work.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sourceRoot=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const baselineRoot=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR):path.resolve(__dirname,'../../../baseline');
const read=(name,base=sourceRoot)=>fs.readFileSync(path.join(base,name),'utf8');
const baselineAvailable=fs.existsSync(path.join(baselineRoot,'web/creator/timeline.js'));
if(process.env.CONTINUITY_BASELINE_DIR)assert.ok(baselineAvailable,'Explicit baseline must exist');
const method=(name,text)=>{const match=text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));assert.ok(match,name);return match[0];};
const applyBody=text=>{
  const match=method('noAudioButton',text).match(/        if \(this\.timeline\[key\] === "N\/A"[^]*?        this\.showAudioUndo\([^]*?event\.currentTarget\);/);
  assert.ok(match,'Original apply/owned/refined/version/Undo block');return match[0].replace(/\r\n/g,'\n');
};
if(baselineAvailable){
  const now=read('web/creator/timeline.js'),old=read('web/creator/timeline.js',baselineRoot);
  assert.equal(applyBody(now),applyBody(old),'The second-press apply and Undo block is byte-identical to the original');
  for(const name of ['textBox','undoAudioField','showAudioUndo','clearAudioUndo','audioEdited'])assert.equal(method(name,now),method(name,old),name+' original input/Undo behavior remains exact');
  assert.equal(read('web/creator/dom.js'),read('web/creator/dom.js',baselineRoot),'Overlay Escape behavior and DOM global listeners stay unchanged');
}
assert.match(read('web/creator/locales/ko.js'),/"Entered content will be deleted and replaced with N\/A": "입력된 내용이 삭제되며 N\/A로 입력됩니다"/);
const headerFile=path.join(sourceRoot,'tests/browser/test-timeline-header-layout.cjs'),headerText=fs.readFileSync(headerFile,'utf8');
const setupEnd=headerText.indexOf('let browser, requests = 0;');assert.ok(setupEnd>0,'Shared header fixture setup boundary');
const fixture=vm.runInNewContext(headerText.slice(0,setupEnd)+';({code,css});',{require,console,__dirname:path.dirname(headerFile),process:{env:{...process.env,CONTINUITY_SOURCE_ROOT:sourceRoot}}});
const overlay=read('web/creator/dom.js').match(/^export function mountOverlay\([^]*?^\}/m)[0].replace(/^export /,'');
const oldOverlay='const mountOverlay=overlay=>{document.body.append(overlay);return()=>overlay.remove();};';
assert.ok(fixture.code.includes(oldOverlay),'Replace only the fixture overlay adapter with its actual source');
const code=fixture.code.replace(oldOverlay,overlay)+`
window.setNAFixture=(options={})=>{
 setFixture(options);window.naLocale=options.language||'en';window.naViews=[];
 subject.sections={read:()=>false,write:(key,value)=>naViews.push([key,value])};
 subject.timeline.soundscape=options.soundText??'Original room ambience and recorded dialogue.';
 subject.timeline.music=options.musicText??'Original score played only for the audience.';
 subject.timeline.refined=structuredClone(options.refined??{body:'Existing refined description'});
 subject.soundscapeBox.value=subject.timeline.soundscape;subject.musicBox.value=subject.timeline.music;subject.updateSectionSummaries();
 subject.soundscapeSection.setOpen(options.soundOpen??false);subject.musicSection.setOpen(options.musicOpen??false);naViews.length=0;subject.commits=0;
};
window.naSection=key=>key==='soundscape'?subject.soundscapeSection:subject.musicSection;
window.naInput=key=>key==='soundscape'?subject.soundscapeBox:subject.musicBox;
window.naSnapshot=()=>({data:JSON.stringify(subject.timeline),commits:subject.commits,versions:structuredClone(subject.audioVersions),views:structuredClone(naViews),
 inputs:[subject.soundscapeBox.value,subject.musicBox.value],folds:[subject.soundscapeSection.isOpen(),subject.musicSection.isOpen()],undo:subject.audioUndo?{key:subject.audioUndo.key,value:subject.audioUndo.value,owned:subject.audioUndo.owned,version:subject.audioUndo.version}:null});
setNAFixture();
`;
new vm.Script(code,{filename:'timeline-na-confirmation-current-production-fixture.js'});
const results=[],errors=[];let browser,requests=0;const artifacts=process.env.CONTINUITY_UX_SCREENSHOT_DIR;
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1600,height:1400}});page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><head><style>'+fixture.css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}</style></head><body></body></html>');
 await page.evaluate('(()=>{'+code+'})()');
 const reset=options=>page.evaluate(options=>setNAFixture(options),options);
 const section=key=>page.locator('.mmc-tl-audio > .mmc-tl-section').nth(key==='music'?1:0),button=key=>section(key).locator('.mmc-tl-na');
 const first=async key=>{const before=await page.evaluate(()=>naSnapshot());await button(key).click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);assert.equal(await button(key).evaluate(node=>node.classList.contains('armed')),true);};
 const second=async(key,position)=>button(key).click(position?{position}:{});
 const confirm=async key=>{await first(key);await second(key);};
 const shot=async name=>{if(!artifacts)return;fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,name),fullPage:true});};
 await check('First mouse press shows a red localized warning only: text, refined state, field versions, Undo and folding remain unchanged',async()=>{
  for(const language of ['en','ko'])for(const key of ['soundscape','music'])for(const open of [false,true]){
   await reset({language,soundOpen:open,musicOpen:open});await first(key);
   assert.equal(await button(key).textContent(),language==='ko'?'입력된 내용이 삭제되며 N/A로 입력됩니다':'Entered content will be deleted and replaced with N/A');
   assert.equal(await button(key).evaluate(node=>getComputedStyle(node).color),'rgb(255, 68, 68)');assert.ok((await button(key).getAttribute('aria-label')).includes(await button(key).textContent()));
  }
 });
 await check('Second press applies the unchanged original field-specific N/A operation once and original Undo restores text/focus',async()=>{
  for(const key of ['soundscape','music'])for(const soundOpen of [false,true])for(const musicOpen of [false,true]){
   await reset({soundOpen,musicOpen});const original=await page.evaluate(()=>naSnapshot());await confirm(key);assert.equal(await page.evaluate(key=>subject.timeline[key],key),'N/A');assert.equal(await page.evaluate(()=>subject.commits),1);assert.equal(await button(key).textContent(),'N/A');assert.deepEqual(await page.evaluate(()=>naViews),[]);
   await page.locator('.mmc-tl-na-undo').click();assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),original.data);assert.equal(await page.evaluate(()=>subject.commits),2);assert.equal(await button(key).evaluate(node=>document.activeElement===node),true);assert.deepEqual(await page.evaluate(()=>[subject.soundscapeSection.isOpen(),subject.musicSection.isOpen()]),original.folds);
  }
 });
 await check('Confirm warning is one full-message hitbox: left/right/top/bottom interior positions apply once without a fold click',async()=>{
  for(const edge of ['left','right','top','bottom']){await reset({language:'ko'});await first('soundscape');const box=await button('soundscape').boundingBox();const point=edge==='left'?{x:10,y:box.height/2}:edge==='right'?{x:box.width-10,y:box.height/2}:edge==='top'?{x:box.width/2,y:6}:{x:box.width/2,y:box.height-6};await second('soundscape',point);assert.equal(await page.evaluate(()=>subject.timeline.soundscape),'N/A');assert.equal(await page.evaluate(()=>subject.commits),1);assert.deepEqual(await page.evaluate(()=>naViews),[]);}
 });
 await check('Pointer leave from the confirmation/header and blur cancel locally with no write, and a fresh press starts confirmation again',async()=>{
  await reset({soundOpen:true,musicOpen:true});const before=await page.evaluate(()=>naSnapshot());await first('soundscape');await page.mouse.move(2,2);assert.equal(await button('soundscape').textContent(),'N/A');assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);
  await first('soundscape');await section('music').locator('textarea').focus();assert.equal(await button('soundscape').textContent(),'N/A');assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);await first('soundscape');
 });
 await check('Real Escape keeps its original top-modal-close semantics, cancels without applying and reopening starts unarmed',async()=>{
  await reset({});const before=await page.evaluate(()=>naSnapshot());await first('soundscape');await page.evaluate(()=>window.detachedNA=subject.soundscapeSection.head.querySelector('.mmc-tl-na'));await page.keyboard.press('Escape');assert.equal(await page.locator('.mmc-tl-modal').count(),0);assert.equal(await page.evaluate(()=>subject.closed),1);assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);await page.evaluate(()=>detachedNA.click());assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);await reset({});assert.equal(await button('soundscape').textContent(),'N/A');assert.equal(await button('soundscape').evaluate(node=>node.classList.contains('armed')),false);
 });
 await check('Keyboard Enter then Space confirms without a disclosure toggle or duplicate commit',async()=>{
  await reset({});const before=await page.evaluate(()=>naSnapshot());await button('music').focus();await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);assert.equal(await button('music').evaluate(node=>node.classList.contains('armed')),true);await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>subject.timeline.music),'N/A');assert.equal(await page.evaluate(()=>subject.commits),1);assert.deepEqual(await page.evaluate(()=>naViews),[]);
 });
 await check('Out-of-date field/input/value/version/ownership or owner confirmations are discarded, never applied to newer contents',async()=>{
  for(const change of ['state','input','version','owner','ownership']){
   await reset({});if(change==='ownership')await page.evaluate(()=>{subject.timeline.soundscape=undefined;subject.soundscapeBox.value='';});await first('soundscape');
   await page.evaluate(change=>{if(change==='state')subject.timeline.soundscape='External text';if(change==='input')subject.soundscapeBox.value='External visible text';if(change==='version')subject.audioVersions.soundscape++;if(change==='owner')subject.timeline=structuredClone(subject.timeline);if(change==='ownership')delete subject.timeline.soundscape;},change);
   const external=await page.evaluate(()=>naSnapshot());await second('soundscape');assert.deepEqual(await page.evaluate(()=>naSnapshot()),external,change);assert.equal(await button('soundscape').textContent(),'N/A');assert.equal(await button('soundscape').evaluate(node=>node.classList.contains('armed')),false);
  }
 });
 await check('The second press captures current refined metadata and ownership, not an earlier first-press Undo record',async()=>{
  await reset({});await first('soundscape');await page.evaluate(()=>subject.timeline.refined={body:'Updated without changing audio'});await second('soundscape');assert.equal(await page.evaluate(()=>subject.audioUndo.refined===subject.timeline.refined),true);assert.equal(await page.evaluate(()=>subject.audioUndo.refined.body),'Updated without changing audio');assert.equal(await page.evaluate(()=>subject.audioUndo.owned),true);
  for(const owned of [false,true]){await reset({});await page.evaluate(owned=>{if(owned)subject.timeline.music=undefined;else delete subject.timeline.music;subject.musicBox.value='';},owned);await confirm('music');assert.equal(await page.evaluate(()=>subject.audioUndo.owned),owned);await page.locator('.mmc-tl-na-undo').click();assert.equal(await page.evaluate(()=>Object.hasOwn(subject.timeline,'music')),owned);assert.equal(await section('music').locator('textarea').inputValue(),'');}
 });
 await check('Already-N/A fields still show the requested first warning; second press is original no-op and preserves existing Undo',async()=>{
  await reset({});await confirm('soundscape');const before=await page.evaluate(()=>naSnapshot());await page.evaluate(()=>window.originalUndo=subject.audioUndo);await first('soundscape');assert.equal(await page.evaluate(()=>subject.audioUndo===originalUndo),true);await second('soundscape');assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);assert.equal(await page.evaluate(()=>subject.audioUndo===originalUndo),true);await page.locator('.mmc-tl-na-undo').click();assert.equal(await page.evaluate(()=>subject.timeline.soundscape),'Original room ambience and recorded dialogue.');
 });
 await check('Native disabled actions cannot arm or apply, and closing by outside backdrop never applies pending N/A',async()=>{
  await reset({});const before=await page.evaluate(()=>naSnapshot());await button('soundscape').evaluate(node=>{node.disabled=true;node.click();});assert.equal(await button('soundscape').evaluate(node=>node.classList.contains('armed')),false);assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);await button('soundscape').evaluate(node=>node.disabled=false);await first('soundscape');await page.mouse.click(2,2);assert.equal(await page.locator('.mmc-tl-modal').count(),0);assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);
 });
 await check('Confirmed Undo cannot overwrite a later input edit or refinement, preserving original Undo/version guards',async()=>{
  await reset({soundOpen:true});await confirm('soundscape');await section('soundscape').locator('textarea').fill('Later input');assert.equal(await page.evaluate(()=>subject.undoAudioField()),false);assert.equal(await page.evaluate(()=>subject.timeline.soundscape),'Later input');
  await confirm('soundscape');await page.evaluate(()=>subject.timeline.refined={body:'Later refinement'});assert.equal(await page.evaluate(()=>subject.undoAudioField()),false);assert.equal(await page.evaluate(()=>subject.timeline.soundscape),'N/A');
 });
 await check('Narrow EN/KO enlarged-text warning survives first-press layout, wraps fully, stays clickable and never overflows',async()=>{
  for(const width of [320,640])for(const language of ['en','ko'])for(const scale of [1,1.6])for(const key of ['soundscape','music']){
   await page.setViewportSize({width,height:2000});await reset({language,scale});await button(key).scrollIntoViewIfNeeded();const initial=await button(key).boundingBox();await first(key);await page.mouse.move(initial.x+initial.width/2,initial.y+initial.height/2);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await button(key).evaluate(node=>node.classList.contains('armed')),true,JSON.stringify({width,language,scale,key}));
   const box=await button(key).evaluate(node=>{const r=node.getBoundingClientRect(),section=node.closest('section').getBoundingClientRect(),walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),text=[];let item;while(item=walker.nextNode()){const range=document.createRange();range.selectNodeContents(item);for(const b of range.getClientRects())text.push({left:b.left,right:b.right,top:b.top,bottom:b.bottom});}return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,section:{left:section.left,right:section.right},white:getComputedStyle(node).whiteSpace,text};});
   assert.ok(box.height>=26);assert.equal(box.white,'normal');assert.ok(box.left>=box.section.left-1&&box.right<=box.section.right+1);for(const text of box.text)assert.ok(text.left>=box.left-1&&text.right<=box.right+1&&text.top>=box.top-1&&text.bottom<=box.bottom+1,JSON.stringify({width,language,scale,key,box,text}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(language==='ko'&&scale===1.6&&key==='soundscape')await shot('timeline-na-confirmation-'+width+'-ko-large.png');await second(key);assert.equal(await page.evaluate(key=>subject.timeline[key],key),'N/A');assert.equal(await page.evaluate(()=>subject.commits),1);assert.deepEqual(await page.evaluate(()=>naViews),[]);
  }
 });
 await check('Armed confirmation survives safe background rerenders without replacing inputs/actions, and never enters workflow data',async()=>{
  await page.setViewportSize({width:1600,height:1400});await reset({language:'ko'});const before=await page.evaluate(()=>naSnapshot());await first('soundscape');await page.evaluate(()=>{window.currentNA=subject.soundscapeSection.head.querySelector('.mmc-tl-na');window.currentField=subject.soundscapeBox;for(let i=0;i<5;i++)subject.render();});assert.deepEqual(await page.evaluate(()=>naSnapshot()),before);assert.equal(await button('soundscape').evaluate(node=>node===currentNA&&node.classList.contains('armed')),true);assert.equal(await page.evaluate(()=>subject.soundscapeBox===currentField),true);await shot('timeline-na-confirmation-desktop-ko.png');await second('soundscape');assert.equal(await page.evaluate(()=>subject.commits),1);assert.equal(await page.evaluate(()=>Object.keys(subject.timeline).some(key=>/armed|confirm/i.test(key))),false);
 });
 assert.deepEqual(errors,[]);assert.equal(requests,0);console.log(JSON.stringify({suite:'timeline-na-confirmation',passed:results.length,networkRequests:requests,browserErrors:errors,results,
  scope:'actual frontend callbacks/DOM/CSS including real overlay Escape; safe execution adapters; no live ComfyUI/GPU proof'},null,2));await page.evaluate(()=>subject.close());await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
