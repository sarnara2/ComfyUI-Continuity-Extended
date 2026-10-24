// Actual card controllers, reference viewer, shared portal helpers and ordered
// production CSS. Media is generated in RAM; API filenames map only to that
// Blob. No live server, workflow, render, model, user media or profile is used.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sourceRoot=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(sourceRoot,'web/creator'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const sharedFile=path.join(sourceRoot,'tests/browser/test-card-individual-preview.cjs');
const legacy=fs.readFileSync(sharedFile,'utf8'),boundary=legacy.indexOf('\n(async()=>{');
assert.ok(boundary>0&&legacy.slice(0,boundary).includes('async function setupPage'));
const fixture=vm.runInNewContext(legacy.slice(0,boundary)+'\n;({setupPage,setMedia:value=>mediaBase64=value,errors,getRequests:()=>requests});',{require,process,__dirname:path.dirname(sharedFile)},{filename:sharedFile});
const styles=read('styles.js'),imports=Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/([\w-]+)\.js";/g)].map(m=>[m[1],m[2]]));
const order=styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(x=>x.trim()).filter(Boolean);
const css=order.map(name=>read('styles/'+imports[name]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
assert.equal(order.at(-1),'fullscreen');
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR):path.resolve(sourceRoot,'../baseline');
if(fs.existsSync(path.join(baseline,'web/creator/state.js'))){
 for(const name of ['dom.js','reference-preview.js'])assert.deepEqual(fs.readFileSync(path.join(root,name)),fs.readFileSync(path.join(baseline,'web/creator',name)),'Unchanged behavior owner '+name);
 // Face migration and registered-folder browsing now own separate changes in
 // state/API. The preview's actual saved-file readers/URL builders stay exact.
 for(const [file,names] of [['api.js',['probe','viewUrl']],['state.js',['passOf']]]) {
  const previous=fs.readFileSync(path.join(baseline,'web/creator',file),'utf8');
  for(const name of names){const pattern=new RegExp('export function '+name+'\\([^]*?^\\}','m');assert.equal(read(file).match(pattern)?.[0],previous.match(pattern)?.[0],'Unchanged preview dependency '+name);assert.ok(read(file).match(pattern));}
 }
 for(const name of ['isClip','takeOn']) {
  const pattern=new RegExp('^export const '+name+' =[^]*?;','m'),previous=fs.readFileSync(path.join(baseline,'web/creator/state.js'),'utf8');
  assert.equal(read('state.js').match(pattern)?.[0],previous.match(pattern)?.[0],'Unchanged saved-take dependency '+name);assert.ok(read('state.js').match(pattern));
 }
 const previous=fs.readFileSync(path.join(baseline,'web/creator/card-preview.js'),'utf8');
 for(const name of ['cardPreviewSource','cardPreviewFraming']){const pattern=new RegExp('export function '+name+'\\([^]*?^\\}','m');assert.equal(read('card-preview.js').match(pattern)[0],previous.match(pattern)[0],'Unchanged saved source/framing resolver '+name);}
}else if(process.env.CONTINUITY_BASELINE_DIR)assert.fail('Explicit baseline must exist');
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-card-preview-volume'));
assert.ok(output!==sourceRoot&&!output.startsWith(sourceRoot+path.sep),'Evidence outside product');
const checks=[],layouts=[];let browser;
const check=async(name,run)=>{await run();checks.push({name,passed:true});console.log('PASS '+name);};
(async()=>{
 browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1100,height:850}});
 const recording=await context.newPage();await recording.setContent('<button>RAM fixture</button>');
 const recorder=legacy.match(/mediaBase64=await recording\.evaluate\((async\(\)=>\{[^]*?)\);await recording\.close\(\);/);
 assert.ok(recorder,'Maintained synthetic media recorder');fixture.setMedia(await recording.evaluate('('+recorder[1]+')()'));await recording.close();
 const page=await fixture.setupPage(context);await page.addStyleTag({content:css});
 const pop=()=>page.locator('.mmc-card-preview-volume-pop');
 const slider=()=>pop().locator('input[type="range"]');
 const mount=async(key='volume',options={})=>{await page.locator('#outside').hover();await page.evaluate(({key,options})=>{destroyFixture();const source={...sourceAt(0),...options.source};window.sourceBefore=JSON.stringify(source);window.timelineBefore=JSON.stringify(timeline);window.active=addController(source,key,options);window.activeSource=source;},{key,options});await page.waitForFunction(()=>active.media.readyState>=2);};
 const open=async()=>{await page.locator('.fixture-card .mmc-card-preview-mute').click();await pop().waitFor();await page.waitForTimeout(25);};
 const set=async(value)=>{await slider().evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);};
 const state=()=>page.evaluate(()=>({volume:active.media.volume,muted:active.media.muted,paused:active.media.paused,expanded:active.root.querySelector('.mmc-card-preview-mute').getAttribute('aria-expanded')}));
 const escape=async()=>{await page.keyboard.press('Escape');await pop().waitFor({state:'detached'});};
 await check('New card and metadata load remain zero-volume; hover, Play and icon never authorize sound',async()=>{
  await mount('zero');assert.deepEqual(await state(),{volume:0,muted:true,paused:true,expanded:'false'});
  await page.locator('.fixture-card .mmc-card-preview-stage').hover();await page.waitForFunction(()=>!active.media.paused);assert.equal((await state()).volume,0);assert.equal((await state()).muted,true);
  await open();assert.equal(await slider().inputValue(),'0');assert.equal((await state()).volume,0);assert.equal((await state()).muted,true);
  await page.locator('.fixture-card .mmc-card-preview-mute').click();await pop().waitFor({state:'detached'});assert.equal((await state()).volume,0);
  await page.locator('#outside').hover();await page.locator('.fixture-card .mmc-card-preview-play').focus();await page.keyboard.press('Enter');assert.equal((await state()).paused,true);assert.equal((await state()).volume,0);
 });
 await check('Only explicit range input changes 0/25/100 percent; no source or timeline audio mutation',async()=>{
  await mount('explicit');await open();for(const percent of [25,100,0,25]){await set(percent);const value=await state();assert.equal(value.volume,percent/100);assert.equal(await pop().locator('output').textContent(),percent+'%');assert.equal(await slider().getAttribute('aria-valuetext'),percent+'%');}
  assert.equal(await page.evaluate(()=>sourceBefore===JSON.stringify(activeSource)&&timelineBefore===JSON.stringify(timeline)),true);
  await page.locator('#outside').hover();await page.waitForFunction(()=>active.media.paused&&active.media.muted);assert.equal((await state()).volume,.25);await page.locator('#outside').click();await pop().waitFor({state:'detached'});
 });
 await check('Actual native vertical range keyboard controls work and do not bubble graph keys',async()=>{
  await open();await slider().focus();await page.evaluate(()=>{window.graphKeys=[];window.graphKeyHandler=event=>graphKeys.push(event.key);document.addEventListener('keydown',graphKeyHandler);});
  await page.keyboard.press('Home');assert.equal(await slider().inputValue(),'0');await page.keyboard.press('ArrowUp');assert.equal(await slider().inputValue(),'1');await page.keyboard.press('End');assert.equal(await slider().inputValue(),'100');await page.keyboard.press('ArrowDown');assert.equal(await slider().inputValue(),'99');
  assert.equal(await slider().getAttribute('aria-orientation'),'vertical');assert.equal(await slider().getAttribute('orient'),'vertical');assert.deepEqual(await page.evaluate(()=>graphKeys),[]);await page.evaluate(()=>document.removeEventListener('keydown',graphKeyHandler));
  await escape();assert.equal(await page.evaluate(()=>document.activeElement===active.root.querySelector('.mmc-card-preview-mute')),true);
 });
 await check('Second icon click, outside click, Escape, scroll and resize close only their volume portal',async()=>{
  await open();await page.locator('.fixture-card .mmc-card-preview-mute').click();await pop().waitFor({state:'detached'});
  await open();await page.locator('#outside').click();await pop().waitFor({state:'detached'});
  await open();await slider().focus();await escape();
  await open();await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await pop().waitFor({state:'detached'});
  await open();await page.evaluate(()=>document.dispatchEvent(new Event('scroll',{bubbles:true})));await pop().waitFor({state:'detached'});assert.equal((await state()).expanded,'false');
 });
 await check('Portal and bridge belong to hover area; leaving is immediately paused and quiet',async()=>{
  await mount('hover-portal');await open();await set(25);await page.waitForFunction(()=>!active.media.paused&&!active.media.muted);
  const boxes=await page.evaluate(()=>({pop:document.querySelector('.mmc-card-preview-volume-pop').getBoundingClientRect().toJSON(),icon:active.root.querySelector('.mmc-card-preview-mute').getBoundingClientRect().toJSON()}));
  const x=Math.max(boxes.pop.left,boxes.icon.left)+Math.min(boxes.pop.width,boxes.icon.width)/2;
  const y=boxes.pop.top>=boxes.icon.bottom?(boxes.pop.top+boxes.icon.bottom)/2:(boxes.pop.bottom+boxes.icon.top)/2;await page.mouse.move(x,y);assert.equal((await state()).paused,false);assert.equal((await state()).muted,false);
  await slider().hover();assert.equal((await state()).paused,false);assert.equal((await state()).volume,.25);
  await page.locator('#outside').hover();await page.waitForFunction(()=>active.media.paused&&active.media.muted);await page.waitForTimeout(60);assert.equal((await state()).paused,true);await page.locator('#outside').click();
 });
 await check('Same card and file remember explicit volume; different card and replacement file start zero',async()=>{
  await mount('bound');await open();await set(25);await page.locator('#outside').click();
  await page.evaluate(()=>{window.oldController=active;active=addController(activeSource,'bound');});await page.waitForFunction(()=>active.media.readyState>=2);assert.equal((await state()).volume,.25);assert.equal((await state()).muted,true);
  await page.evaluate(()=>{window.otherCard=addController(activeSource,'independent');window.replacement=addController({...activeSource,filename:'new-generated.webm [output]'},'bound');});await page.waitForFunction(()=>otherCard.media.readyState>=2&&replacement.media.readyState>=2);
  assert.deepEqual(await page.evaluate(()=>[otherCard.media.volume,replacement.media.volume]),[0,0]);
  await page.evaluate(()=>{active=replacement;});await page.locator('[data-card="bound"]').last().locator('.mmc-card-preview-mute').click();await pop().waitFor();await set(100);
  assert.deepEqual(await page.evaluate(()=>[replacement.media.volume,oldController.media.volume,otherCard.media.volume]),[1,0,0]);
  await page.evaluate(()=>oldController.refreshVolume({playing:true}));assert.equal(await page.evaluate(()=>oldController.media.volume),0);assert.equal(await page.evaluate(()=>oldController.media.muted),true);await page.locator('#outside').click();
 });
 await check('Files without an audio stream disable volume access, and a fresh module session starts zero',async()=>{
  await mount('silent',{source:{hasAudio:false}});const icon=page.locator('.fixture-card .mmc-card-preview-mute');assert.equal(await icon.isDisabled(),true);assert.equal((await state()).volume,0);assert.equal(await pop().count(),0);
  const fresh=await fixture.setupPage(context);await fresh.addStyleTag({content:css});await fresh.evaluate(()=>{window.active=addController(sourceAt(0),'large');});await fresh.waitForFunction(()=>active.media.readyState>=2);assert.equal(await fresh.evaluate(()=>active.media.volume),0);await fresh.evaluate(()=>destroyFixture());await fresh.close();
 });
 await check('Large viewer shares only same card/file volume, one player, and Escape dismisses portal before viewer',async()=>{
  await mount('large');await open();await set(25);await page.locator('#outside').click();
  await page.evaluate(()=>{active.suspend();closeLarge=V.openReferencePreview([{kind:'video',filename:activeSource.filename}],{caption:'Ready preview',playback:{source:activeSource,key:'large',label:'Large'},returnFocus:active.root.querySelector('.mmc-card-preview-stage')});});await page.waitForFunction(()=>document.querySelector('.mmc-reference-preview video').readyState>=2);
  assert.equal(await page.evaluate(()=>document.querySelector('.mmc-reference-preview video').volume),.25);await page.locator('.mmc-reference-preview .mmc-card-preview-play').click();assert.equal(await page.evaluate(()=>active.media.paused&&active.media.muted),true);
  await page.locator('.mmc-reference-preview .mmc-card-preview-mute').click();await pop().waitFor();await page.waitForTimeout(25);await set(100);assert.equal(await page.evaluate(()=>active.media.volume),1);assert.equal(await page.evaluate(()=>active.media.muted),true);
  await slider().focus();await escape();assert.equal(await page.locator('.mmc-reference-preview').count(),1);await page.keyboard.press('Escape');await page.locator('.mmc-reference-preview').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>active.media.paused&&active.media.muted),true);
 });
 await check('Suspend, offscreen, destroy and media errors close portals and leave no playing source',async()=>{
  await mount('suspend');await open();await set(25);await page.evaluate(()=>active.suspend());await pop().waitFor({state:'detached'});assert.equal((await state()).paused,true);assert.equal((await state()).muted,true);
  await mount('offscreen');await open();await set(25);await page.evaluate(()=>{active.root.style.position='absolute';active.root.style.top='4000px';});await page.waitForFunction(()=>active.media.paused);await pop().waitFor({state:'detached'});
  await mount('destroy');await open();await set(25);await page.evaluate(()=>{window.disposed=active.media;active.destroy();active.destroy();});await pop().waitFor({state:'detached'});assert.deepEqual(await page.evaluate(()=>({paused:disposed.paused,src:disposed.getAttribute('src'),mounted:disposed.isConnected})),{paused:true,src:null,mounted:false});
  await mount('error');await open();await page.evaluate(()=>active.media.dispatchEvent(new Event('error')));await pop().waitFor({state:'detached'});assert.equal((await state()).paused,true);assert.equal((await state()).muted,true);assert.equal(await page.locator('.mmc-card-preview-status').isVisible(),true);
 });
 await check('Volume portal remains bounded at desktop/narrow sizes and EN/KO enlarged type',async()=>{
  fs.mkdirSync(output,{recursive:true});
  for(const width of [320,640,1280])for(const language of ['en','ko'])for(const scale of [1,1.6]){
   await page.setViewportSize({width,height:900});await page.evaluate(({language,scale})=>{window.language=language;document.documentElement.style.setProperty('--mmc-type',String(scale));},{language,scale});await mount('layout-'+width+'-'+language+'-'+scale);await open();
   const value=await page.evaluate(()=>{const p=document.querySelector('.mmc-card-preview-volume-pop'),r=p.getBoundingClientRect(),s=p.querySelector('input').getBoundingClientRect();return{bounds:[r.left,r.top,r.right,r.bottom],range:[s.width,s.height],writingMode:getComputedStyle(p.querySelector('input')).writingMode,role:p.getAttribute('role'),portal:p.parentElement===document.body,overflow:document.documentElement.scrollWidth>innerWidth+1,title:p.getAttribute('aria-label')};});
   assert.ok(value.bounds[0]>=0&&value.bounds[1]>=0&&value.bounds[2]<=width+1&&value.bounds[3]<=901,JSON.stringify(value));assert.ok(value.range[1]>value.range[0]);assert.equal(value.portal,true);assert.equal(value.role,'group');assert.equal(value.overflow,false);if(language==='ko')assert.equal(value.title,'미리보기 음량');layouts.push({width,language,scale,...value});
   if(language==='ko'&&scale===1.6)await page.screenshot({path:path.join(output,'preview-volume-'+width+'-ko-large.png'),fullPage:false});await page.locator('#outside').click();
  }
 });
 await check('Right-bottom edge anchors clamp their volume portals without changing card geometry',async()=>{
  for(const width of [320,640,1280]){await page.setViewportSize({width,height:900});await mount('edge-'+width);await page.evaluate(()=>{document.querySelector('.fixture-card').style.cssText='position:fixed;right:12px;bottom:12px';});await open();const bounds=await pop().boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=901);await page.locator('#outside').click();}
 });
 await check('A paused pending play plus rapid slider inputs cannot invalidate the final desired playback',async()=>{
  await page.setViewportSize({width:1100,height:850});await mount('pending-input');await page.evaluate(()=>{const media=active.media,native=media.play.bind(media);window.pendingPlays=[];media.play=()=>new Promise((resolve,reject)=>pendingPlays.push(()=>native().then(resolve,reject)));});
  await page.locator('.fixture-card .mmc-card-preview-stage').hover();await page.waitForFunction(()=>pendingPlays.length>0);await open();await set(25);await set(100);await set(25);
  await page.evaluate(async()=>{const pending=[...pendingPlays];for(const release of pending)await release();});await page.waitForTimeout(75);
  assert.equal((await state()).paused,false,'Slider updates must not stale-pause an already desired pending hover play');assert.equal((await state()).volume,.25);assert.equal((await state()).muted,false);await page.locator('#outside').hover();
 });
 await check('Pending playback honors leave/reenter, explicit pause and a newer large-viewer owner',async()=>{
  await mount('late-owner');await page.evaluate(()=>{const media=active.media,native=media.play.bind(media);window.pendingPlays=[];media.play=()=>new Promise((resolve,reject)=>pendingPlays.push(()=>native().then(resolve,reject)));});
  await page.locator('.fixture-card .mmc-card-preview-stage').hover();await page.waitForFunction(()=>pendingPlays.length===1);await page.locator('#outside').hover();await page.locator('.fixture-card .mmc-card-preview-stage').hover();await page.waitForFunction(()=>pendingPlays.length===2);
  await page.evaluate(()=>pendingPlays[0]());await page.evaluate(()=>pendingPlays[1]());await page.waitForFunction(()=>!active.media.paused);assert.equal((await state()).muted,true);
  await page.locator('#outside').hover();await page.locator('.fixture-card .mmc-card-preview-stage').hover();await page.waitForFunction(()=>pendingPlays.length===3);await page.locator('.fixture-card .mmc-card-preview-play').click();await page.evaluate(()=>pendingPlays[2]());await page.waitForTimeout(75);assert.equal((await state()).paused,true);assert.equal((await state()).muted,true);
  await page.locator('#outside').hover();await page.locator('.fixture-card .mmc-card-preview-stage').hover();await page.waitForFunction(()=>pendingPlays.length===4);
  await page.evaluate(()=>{active.suspend();closeLarge=V.openReferencePreview([{kind:'video',filename:activeSource.filename}],{playback:{source:activeSource,key:'late-owner',label:'Newest owner'}});});await page.waitForFunction(()=>document.querySelector('.mmc-reference-preview video').readyState>=2);await page.locator('.mmc-reference-preview .mmc-card-preview-play').click();await page.waitForFunction(()=>!document.querySelector('.mmc-reference-preview video').paused);
  await page.evaluate(()=>pendingPlays[3]());await page.waitForTimeout(75);assert.equal((await state()).paused,true);assert.equal(await page.evaluate(()=>document.querySelector('.mmc-reference-preview video').paused),false,'A rejected late inline play must not pause the active large viewer');await page.keyboard.press('Escape');
 });
 await page.evaluate(()=>destroyFixture());assert.equal(fixture.getRequests(),0);assert.equal(fixture.errors.length,0,JSON.stringify(fixture.errors));
 const report={sourceRoot,checks,layouts,passed:checks.length,requests:fixture.getRequests(),errors:fixture.errors};fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'card-preview-volume-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,requests:0,errors:0},null,2));await context.close();await browser.close();
})().catch(async error=>{console.error(error.stack||error);await browser?.close();process.exitCode=1;});
