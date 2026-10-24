// Real Timeline Clear/mount/input/save callbacks and shared live-owner lock.
// Uses the maintained field fixture's RAM queue, never a live refiner or media.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sourceRoot=path.resolve(process.env.CONTINUITY_SOURCE_ROOT||path.join(__dirname,'../..'));
const fixturePath=path.join(sourceRoot,'tests/browser/test-field-refine.cjs');
const fixture=fs.readFileSync(fixturePath,'utf8'),end=fixture.indexOf('\nnew vm.Script(code,');
assert.ok(end>0,'Actual field fixture setup');
const context={require,console,__dirname:path.dirname(fixturePath),process:{env:{...process.env,CONTINUITY_SOURCE_ROOT:sourceRoot}}};
vm.runInNewContext(fixture.slice(0,end)+';globalThis.fixtureSource={code,css};',context);
const dictionaries=Object.fromEntries(['ko','ja','zh'].map(lang=>[lang,vm.runInNewContext(fs.readFileSync(path.join(sourceRoot,'web/creator/locales',lang+'.js'),'utf8').replace(/^export const /m,'const ')+';'+lang+';',{})]));
const translationSeam="locale==='ko'?ko[text]??text:text";
assert.ok(context.fixtureSource.code.includes(translationSeam),'Actual translation harness seam');
const code='const dictionaries='+JSON.stringify(dictionaries)+';\n'+context.fixtureSource.code.replace(translationSeam,'(dictionaries[locale]??{})[text]??text');
new vm.Script(code,{filename:'actual-global-clear-fixture.js'});
const artifacts=process.env.CONTINUITY_ARTIFACT_DIR||process.env.CONTINUITY_UX_SCREENSHOT_DIR;
const results=[],errors=[];let browser,requests=0;
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
const other=data=>{const copy=JSON.parse(data);delete copy.prompt;return JSON.stringify(copy);};
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1600,height:1050}});
 page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><style>'+context.fixtureSource.css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}</style><body></body></html>');
 await page.evaluate('(()=>{'+code+'})()');
 const setup=options=>page.evaluate(options=>setupField(options),options);
 const snapshot=()=>page.evaluate(()=>fieldSnapshot());
 const button=()=>page.locator('button[data-mmc-clear-field="prompt"]');
 const pressTwice=async()=>{await button().click();await button().click();};
 await check('One rounded Clear before Refine only on the global header, with no fold coupling',async()=>{
  await setup({language:'ko',sections:{prompt:false}});
  assert.equal(await button().count(),1);assert.equal(await button().textContent(),'지우기');
  assert.deepEqual(await page.evaluate(()=>[...subject.promptSection.head.querySelector('.mmc-tl-section-actions').children].map(node=>node.matches('[data-mmc-clear-field]')?'clear':'refine')),['clear','refine']);
  assert.equal(await page.evaluate(()=>subject.promptSection.isOpen()),false);
  assert.ok(parseFloat(await button().evaluate(node=>getComputedStyle(node).borderRadius))>=12);
 });
 await check('First press is red Confirm clearing content and changes no data, settings or jobs',async()=>{
  const before=await setup({language:'ko',sections:{prompt:true}});await button().click();assert.deepEqual(await snapshot(),before);
  assert.equal(await button().textContent(),'내용 지우기 확인');
  const color=(await button().evaluate(node=>getComputedStyle(node).color)).match(/[\d.]+/g).map(Number);
  assert.ok(color[0]>color[1]&&color[0]>color[2]);assert.equal(await page.evaluate(()=>subject.promptSection.isOpen()),true);
 });
 await check('Second press empties only prompt and visible PromptBox, using one prompt-only save',async()=>{
  const before=await setup();await page.evaluate(()=>{subject.commit=()=>{throw new Error('No general commit');};subject.renderStrip=()=>{throw new Error('No strip rebuild');};subject.renderLoras=()=>{throw new Error('No LoRA normalization');};});
  await pressTwice();const after=await snapshot();assert.equal(JSON.parse(after.data).prompt,'');assert.equal(after.inputs.prompt,'');
  assert.equal(other(after.data),other(before.data));assert.equal(after.commits,1);assert.equal(after.jobs.length,0);
  assert.equal(await button().textContent(),'Clear prompt');
 });
 await check('Blur/header leave cancel; Escape retains the existing Timeline close rule without clearing',async()=>{
  for(const how of ['blur','leave','escape']){const before=await setup();await button().click();
   if(how==='blur')await page.locator('.mmc-tl-field-refine').first().focus();
   if(how==='leave')await page.mouse.move(1,1049);
   if(how==='escape')await page.keyboard.press('Escape');
   assert.deepEqual(await snapshot(),before);
   if(how==='escape')assert.equal(await page.evaluate(()=>subject.modal.isConnected),false);
   else{assert.equal(await button().textContent(),'Clear prompt');assert.equal(await page.evaluate(()=>subject.modal.isConnected),true);}
  }
 });
 await check('Edits, edit-and-restore, visible changes, replaced owners and changed property ownership invalidate confirmation',async()=>{
  for(const how of ['edit','restore','visible','owner','property']){await setup();await button().click();
   await page.evaluate(how=>{if(how==='edit')fieldInput('prompt','User edit');if(how==='restore'){const text=subject.timeline.prompt;fieldInput('prompt','Transient edit');fieldInput('prompt',text);}if(how==='visible')subject.promptBox.root.textContent='Visible only';if(how==='owner')subject.timeline=structuredClone(subject.timeline);if(how==='property')delete subject.timeline.prompt;},how);
   const before=await snapshot();await button().evaluate(node=>node.click());assert.deepEqual(await snapshot(),before);assert.equal(await button().textContent(),'Clear prompt');
  }
 });
 await check('Disconnected/replaced prompt widgets and closed Timeline cannot be cleared by stale buttons',async()=>{
  for(const how of ['disconnect','box','close']){await setup();await button().click();
   await page.evaluate(how=>{window.oldClear=document.querySelector('[data-mmc-clear-field]');if(how==='disconnect')subject.promptBox.root.remove();if(how==='box')subject.promptBox=Object.assign(Object.create(Object.getPrototypeOf(subject.promptBox)),subject.promptBox);if(how==='close')subject.close();},how);
   const before=await snapshot();await page.evaluate(()=>oldClear.click());assert.deepEqual(await snapshot(),before);
  }
 });
 await check('Enter and Space require two separate presses; held-key repeats cannot confirm',async()=>{
  for(const key of ['Enter','Space']){const before=await setup();await button().focus();await page.keyboard.down(key);await page.keyboard.down(key);await page.keyboard.up(key);
   assert.equal((await snapshot()).data,before.data);assert.equal(await button().textContent(),'Confirm clearing content');await page.keyboard.press(key);
   assert.equal(JSON.parse((await snapshot()).data).prompt,'');assert.equal((await snapshot()).commits,1);
  }
 });
 await check('Pending field and Refine all locks refuse Clear without mutation or a second job, then release',async()=>{
  for(const operation of ['field','all']){await setup();const refiner=operation==='field'?page.locator('button.mmc-tl-field-refine').first():page.locator('.mmc-tl-refine');
   await refiner.click();await refiner.click();const before=await snapshot();await pressTwice();const blocked=await snapshot();
   assert.equal(blocked.data,before.data);assert.equal(blocked.commits,before.commits);assert.equal(blocked.jobs.length,1);assert.match(blocked.statuses.prompt.text,/Another refine is running/);
   await page.evaluate(operation=>operation==='field'?resolveField():resolveJob(),operation);await page.waitForFunction(()=>!document.querySelector('.mmc-refine-split > .busy'));
   const finished=await snapshot();await pressTwice();const cleared=await snapshot();assert.equal(JSON.parse(cleared.data).prompt,'');assert.equal(other(cleared.data),other(finished.data));assert.equal(cleared.jobs.length,1);
  }
 });
 await check('Already empty prompt is a no-op and Clear cannot alter whole-refine snapshots',async()=>{
  await setup();await page.evaluate(()=>{subject.timeline.prompt='';subject.promptBox.setValue('');subject.timeline.refined={body:'Kept whole rewrite',replaced:{prompt:'Original snapshot',soundscape:'Old sound'}};});
  const before=await snapshot();await pressTwice();assert.deepEqual(await snapshot(),before);
  await page.evaluate(()=>fieldInput('prompt','New text'));const updated=await snapshot();await pressTwice();assert.equal(other((await snapshot()).data),other(updated.data));
 });
 let responsiveCases=0;
 await check('All real locale labels and confirmations remain visible/rounded/hit-testable at 320/640/1600 and normal/enlarged type',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [1,1.6]){await page.setViewportSize({width,height:1050});const before=await setup({language,scale,sections:{prompt:false}});
   await button().scrollIntoViewIfNeeded();await button().click();const geometry=await button().evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return{hit:node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),scroll:node.scrollWidth,client:node.clientWidth,page:document.documentElement.scrollWidth,width:innerWidth,radius:parseFloat(s.borderRadius)};});
   assert.ok(geometry.hit&&geometry.scroll<=geometry.client+2&&geometry.page<=geometry.width+1&&geometry.radius>=12,JSON.stringify({width,language,scale,geometry}));assert.deepEqual(await snapshot(),before);responsiveCases++;
   if(artifacts&&language==='ko'&&scale===1.6){fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'global-clear-'+width+'-ko-enlarged.png')});}
   await page.mouse.move(1,1049);
  }
 });
 assert.deepEqual(errors,[]);assert.equal(requests,0);
 const report={suite:'global-prompt-clear',passed:results.length,responsiveCases,networkRequests:requests,pageErrors:errors,results,scope:'Actual field clear/owner/callback, RAM refiner responses; no live ComfyUI/model/media/GPU'};
 if(artifacts){fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
