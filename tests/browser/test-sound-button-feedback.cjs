// Actual SoundLane/SoundView modules, original actions and ordered Sound CSS.
// RAM-only audio metadata, cancelling fake picker; no live app/media/API/model.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(repo,'web/creator',name),'utf8');
const baseline=process.env.CONTINUITY_SOUND_BASELINE_DIR?path.resolve(process.env.CONTINUITY_SOUND_BASELINE_DIR):path.resolve(repo,'../baseline');
const original=fs.readFileSync(path.join(baseline,'web/creator/soundlane.js'),'utf8');
assert.equal(crypto.createHash('sha256').update(original).digest('hex').toUpperCase(),'FFDB5F005DA479D4A037E3438D76F44D015F77E71FB5980AB4DC1587EAD49BC2','Exact pre-feedback SoundLane backup');
const added=/^    \/\/ Header actions acknowledge a click without acquiring a toggle state\.[^]*?(?=^    \/\/ Presentation only\.)/m;
assert.equal((read('soundlane.js').match(added)||[]).length,1);
assert.equal(read('soundlane.js').replace(added,''),original,'Removing only constructor feedback restores every original audio/action/lifecycle byte');
const arithmeticBaseline=fs.existsSync(path.join(baseline,'web/creator/sound.js'))?baseline:path.resolve(process.env.CONTINUITY_BASELINE_DIR||path.resolve(repo,'../../continuity-face-picker-ux-20261010/baseline'));
assert.equal(read('sound.js'),fs.readFileSync(path.join(arithmeticBaseline,'web/creator/sound.js'),'utf8'),'Frame arithmetic unchanged');
const shared=path.join(repo,'tests/browser/test-sound-view.cjs'),source=fs.readFileSync(shared,'utf8'),boundary=source.indexOf('\n(async () => {');assert.ok(boundary>0);
const base=vm.runInNewContext(source.slice(0,boundary)+';({setup,fixture});',{require,process,__dirname:path.dirname(shared)},{filename:shared});
const styleOwner=read('styles.js'),cssImports=Object.fromEntries([...styleOwner.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(match=>[match[1],match[2]]));
const cssOrder=styleOwner.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\r\n]*/g,'').match(/\b\w+\b/g);
const productionCss=cssOrder.map(name=>read('styles/'+cssImports[name]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('');
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-sound-feedback'));
const checks=[],errors=[];let browser;
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await base.setup(context);await page.addStyleTag({content:productionCss});page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(()=>{
  window.feedbackInfo=button=>{const style=getComputedStyle(button);return{color:style.color,border:style.borderTopColor,background:style.backgroundColor,pressed:button.getAttribute('aria-pressed'),className:button.className,animations:button.getAnimations().map(a=>({id:a.id,duration:a.effect.getComputedTiming().duration,currentTime:a.currentTime,state:a.playState})),piece:JSON.stringify(soundPiece),commits:soundCommits};};
  window.feedbackMount=()=>{mountSound();window.feedbackBaseline=JSON.stringify(soundPiece);window.actionCounts={by:0,fit:0};for(const key of ['by','fit']){const original=soundLane.view[key];soundLane.view[key]=function(...args){actionCounts[key]++;return original.apply(this,args);};}window.outsideButton=D.el('button',{class:'mmc-tl-header-action',text:'Outside Sound'});soundOverlay.querySelector('.mmc-tl-body').prepend(outsideButton);};
  feedbackMount();
 });
 const zoom=page.getByRole('button',{name:'Zoom tool',exact:true}),add=page.getByRole('button',{name:'Add track',exact:true}),fit=page.getByRole('button',{name:'Fit',exact:true});
 const info=locator=>locator.evaluate(button=>feedbackInfo(button));
 const reset=async()=>{await page.mouse.move(10,10);await page.evaluate(()=>feedbackMount());await page.waitForFunction(()=>soundLane.view.room>0);};
 const invariant=async()=>{assert.equal(await page.evaluate(()=>JSON.stringify(soundPiece)),await page.evaluate(()=>feedbackBaseline));assert.equal(await page.evaluate(()=>soundCommits),0);};
 await check('Zoom toggle stays blue while ON, including hover; OFF restores its underlying appearance without acquiring a pulse',async()=>{
  const off=await info(zoom);await zoom.click();await page.mouse.move(10,10);await page.waitForTimeout(40);const on=await info(zoom);assert.equal(on.pressed,'true');assert.equal(on.animations.length,0);assert.notEqual(on.color,off.color,JSON.stringify({off,on}));assert.notEqual(on.border,off.border);assert.notEqual(on.background,off.background);
  await zoom.hover();const hovered=await info(zoom);assert.equal(hovered.color,on.color);assert.equal(hovered.border,on.border);assert.equal(hovered.background,on.background);
  fs.writeFileSync(path.join(output,'toggle-colors.json'),JSON.stringify({off,on,hovered},null,2));await page.locator('.mmc-snd .mmc-tl-section-head').screenshot({path:path.join(output,'sound-toggle-on.png')});
  await zoom.click();await page.mouse.move(10,10);await page.waitForTimeout(40);const again=await info(zoom);assert.equal(again.pressed,'false');assert.equal(again.animations.length,0);assert.equal(again.color,off.color);assert.equal(again.border,off.border);assert.equal(again.background,off.background);await invariant();
 });
 await check('Escape, actual overlay dismiss and independent disclosure folding retain original toggle ownership and colors',async()=>{
  await reset();await zoom.click();await page.keyboard.press('Escape');await page.mouse.move(10,10);assert.equal((await info(zoom)).pressed,'false');
  await zoom.click();await page.mouse.move(10,10);const on=await info(zoom);await page.evaluate(()=>soundLane.disclosure.setOpen(false));assert.equal((await info(zoom)).pressed,'true','Collapse preserves the existing explicit tool choice');assert.equal((await info(zoom)).color,on.color);await page.evaluate(()=>soundLane.disclosure.setOpen(true));
  await page.evaluate(()=>mountSoundOverlay());await zoom.focus();await page.keyboard.press('Escape');assert.equal((await info(zoom)).pressed,'false');assert.equal(await page.evaluate(()=>soundModalCloses),0);await invariant();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>soundModalCloses),1);assert.equal(await page.evaluate(()=>soundOverlay.isConnected),false);
 });
 await check('Native mouse, Enter and Space one-shot +/-/Fit/Add perform exactly one original action with a blue returning pulse',async()=>{
  for(const [name,action]of [['Zoom in','by'],['Zoom out','by'],['Fit','fit'],['Add track','picker']])for(const key of ['mouse','Enter','Space']){
   await reset();const button=page.getByRole('button',{name,exact:true});await button.hover();const before=await info(button),count=await page.evaluate(action=>action==='picker'?soundCalls.filter(c=>c[0]==='picker').length:actionCounts[action],action);
   if(key==='mouse')await button.click();else{await button.focus();await page.keyboard.press(key);}
   const active=await info(button);assert.equal(active.pressed,null);assert.equal(active.className,before.className);assert.equal(active.animations.filter(a=>a.id==='mmc-snd-action-feedback').length,1);assert.equal(active.animations.find(a=>a.id==='mmc-snd-action-feedback').duration,320);assert.notEqual(active.color,before.color);
   if(name==='Fit'&&key==='Space'){fs.writeFileSync(path.join(output,'one-shot-colors.json'),JSON.stringify({before,active},null,2));await page.locator('.mmc-snd .mmc-tl-section-head').screenshot({path:path.join(output,'sound-fit-pulse.png')});}
   assert.equal(await page.evaluate(action=>action==='picker'?soundCalls.filter(c=>c[0]==='picker').length:actionCounts[action],action),count+1);await page.waitForTimeout(370);const returned=await info(button);assert.equal(returned.animations.length,0);assert.equal(returned.color,before.color);assert.equal(returned.border,before.border);assert.equal(returned.background,before.background);assert.equal(returned.pressed,null);assert.equal(returned.className,before.className);await invariant();
  }
 });
 await check('Repeated clicks replace only the owned pulse and never cancel unrelated animation or add toggle state',async()=>{
  await reset();await fit.hover();await fit.click();await page.waitForTimeout(70);
  await fit.evaluate(button=>{window.priorPulse=button.getAnimations().find(a=>a.id==='mmc-snd-action-feedback');window.otherAnimation=button.animate([{opacity:.9},{opacity:1}],{duration:1000});otherAnimation.id='fixture-unrelated';});await fit.click();
  const repeated=await fit.evaluate(button=>({old:priorPulse.playState,owned:button.getAnimations().filter(a=>a.id==='mmc-snd-action-feedback').length,other:otherAnimation.playState,info:feedbackInfo(button)}));assert.equal(repeated.old,'idle');assert.equal(repeated.owned,1);assert.equal(repeated.other,'running');assert.equal(repeated.info.pressed,null);assert.equal(await page.evaluate(()=>actionCounts.fit),2);await page.waitForTimeout(370);assert.equal((await info(fit)).animations.filter(a=>a.id==='mmc-snd-action-feedback').length,0);await fit.evaluate(()=>otherAnimation.cancel());await invariant();
 });
 await check('Reduced motion uses a bounded 100ms pulse and outside/disabled Sound controls remain unaffected',async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});await reset();await fit.click();assert.equal((await info(fit)).animations.find(a=>a.id==='mmc-snd-action-feedback').duration,100);await page.waitForTimeout(150);assert.equal((await info(fit)).animations.length,0);
  await page.getByRole('button',{name:'Outside Sound',exact:true}).click();assert.equal(await page.evaluate(()=>outsideButton.getAnimations().length),0);
  await add.evaluate(button=>{button.disabled=true;button.click();});assert.equal((await info(add)).animations.length,0);assert.equal(await page.evaluate(()=>soundCalls.filter(c=>c[0]==='picker').length),0);await invariant();await page.emulateMedia({reducedMotion:'no-preference'});
 });
 await check('All feedback settles without serialized flags, persistent classes, audio mutations, live requests or errors',async()=>{
  await reset();await fit.click();await page.waitForTimeout(370);const result=await page.evaluate(()=>({serialized:S.serializeTimeline(soundPiece),buttons:[...soundLane.disclosure.head.querySelectorAll('.mmc-tl-header-action')].map(button=>({pressed:button.getAttribute('aria-pressed'),animations:button.getAnimations().length,classes:button.className})),commits:soundCommits}));assert.equal(result.commits,0);assert.ok(result.buttons.every(button=>button.animations===0));assert.equal(result.buttons.filter(button=>button.pressed!==null).length,1);assert.doesNotMatch(result.serialized,/feedback|pulse|animation|viewState|zoom/);await invariant();assert.equal(base.fixture.getRequests(),0);assert.deepEqual(Array.from(base.fixture.errors),[]);assert.deepEqual(errors,[]);
 });
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,requests:base.fixture.getRequests(),errors:Array.from(base.fixture.errors)},null,2));console.log(JSON.stringify({passed:checks.length,requests:base.fixture.getRequests(),errors:errors.length}));
})().finally(async()=>{await browser?.close();}).catch(error=>{console.error(error);process.exitCode=1;});
