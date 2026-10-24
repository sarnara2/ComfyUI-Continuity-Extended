// Actual Timeline mount/close, actual rail helper and complete ordered CSS.
// Read-only synthetic cards: no live app, media/profile, server, model or GPU.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(repo,'web/creator'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const headerFile=path.join(repo,'tests/browser/test-timeline-header-layout.cjs');
const prefix=fs.readFileSync(headerFile,'utf8').split('let browser, requests = 0;')[0];
const {code,css}=vm.runInNewContext(prefix+';({code,css});',{require,process,__dirname:path.dirname(headerFile)},{filename:headerFile});
assert.ok(code.includes(read('timeline-scrollbars.js').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')),'Complete actual helper');
const named=/\/\* BEGIN forgiving Timeline scrollbars \*\/[^]*?\/\* END forgiving Timeline scrollbars \*\//;
assert.equal((read('styles/timeline.js').match(named)||[]).length,1,'Single named scoped CSS block');
assert.match(read('timeline.js'),/this\.scrollbars = createTimelineScrollbars\(this\.modal\.querySelector\(":scope > \.mmc-tl-body"\), this\.stripHost\);/);
assert.match(read('timeline.js'),/this\.scrollbars\?\.destroy\(\);\s*this\.scrollbars = null;/);
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-forgiving-scrollbars'));
const extra=`
window.fixtureRailFactory=createTimelineScrollbars;
window.railReset=(options={})=>{
 setFixture({...options,segments:Array.from({length:8},()=>({duration_s:14.38,prompt:'Synthetic card'}))});
 subject.stripHost.classList.add('individual-preview');
 for(const card of subject.stripHost.children){card.style.height=(options.height||700)+'px';card.style.gridRow='2';card.replaceChildren(el('span',{text:'Read-only card'}),el('button',{class:'fixture-card-control',text:'Edit',style:{marginTop:'auto'},onclick:()=>window.controlHits++}));}
 subject.sound.host.style.height='180px';subject.sound.host.style.flex='none';
 window.controlHits=0;window.captureEvents=[];
 for(const rail of subject.modal.querySelectorAll('.mmc-tl-scroll-rail'))for(const type of ['gotpointercapture','lostpointercapture'])rail.addEventListener(type,e=>{captureEvents.push(type);if(type==='gotpointercapture')window.firstCaptureId=e.pointerId;});
 window.railSnapshot=JSON.stringify(snapshot());
 const body=subject.modal.querySelector('.mmc-tl-body');body.scrollTop=0;subject.stripHost.scrollLeft=0;
};
window.railMetrics=()=>{
 const body=subject.modal.querySelector('.mmc-tl-body'),strip=subject.stripHost;
 const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 const measure=orientation=>{const rail=subject.modal.querySelector('.mmc-tl-scroll-rail.'+orientation),thumb=rail?.firstElementChild,style=thumb&&getComputedStyle(thumb);return rail?{hidden:rail.hidden,rect:rect(rail),thumb:rect(thumb),width:parseFloat(style.width),height:parseFloat(style.height),color:style.backgroundColor,orientation:rail.getAttribute('aria-orientation'),max:Number(rail.getAttribute('aria-valuemax')),now:Number(rail.getAttribute('aria-valuenow'))}:null;};
 return{body:{...rect(body),clientWidth:body.clientWidth,clientHeight:body.clientHeight,scrollHeight:body.scrollHeight,scrollTop:body.scrollTop,gutter:body.offsetWidth-body.clientWidth,color:getComputedStyle(body).scrollbarColor},strip:{...rect(strip),clientWidth:strip.clientWidth,clientHeight:strip.clientHeight,scrollWidth:strip.scrollWidth,scrollLeft:strip.scrollLeft},header:rect(subject.modal.querySelector('.mmc-tl-header')),cards:[...strip.children].map(rect),controls:[...strip.querySelectorAll('button')].map(rect),vertical:measure('vertical'),horizontal:measure('horizontal'),snapshot:JSON.stringify(snapshot()),controlHits,captureEvents:structuredClone(captureEvents)};
};
window.showHorizontal=()=>{const body=subject.modal.querySelector('.mmc-tl-body'),br=body.getBoundingClientRect(),sr=subject.stripHost.getBoundingClientRect();body.scrollTop+=sr.bottom-(br.top+body.clientHeight*.7);};
railReset();
`;
const checks=[],errors=[];let browser,requests=0;
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<.2,label+' '+JSON.stringify({a,b}));
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1200,height:900}});page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0}</style><body></body></html>');
 await page.evaluate('(()=>{'+code+'\n'+extra+'})()');
 const metrics=()=>page.evaluate(()=>railMetrics());
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const reset=async options=>{await page.evaluate(options=>railReset(options),options);await settle();};
 await check('Actual mount keeps native gutters and every card/control position; only native paint is replaced',async()=>{
  await settle();const active=await metrics();assert.equal(active.vertical.orientation,'vertical');assert.equal(active.horizontal.orientation,'horizontal');assert.equal(active.vertical.rect.width,24,JSON.stringify(active));assert.ok(active.body.gutter>=6&&active.body.gutter<=16);assert.match(active.body.color,/rgba\(0, 0, 0, 0\)/);near(active.body.right-active.vertical.thumb.right,6,'Exact vertical wall gap');near(active.vertical.rect.right,active.vertical.thumb.right,'Drag lane follows inset thumb');
  await page.evaluate(()=>{subject.scrollbars.destroy();subject.scrollbars=null;});const native=await metrics();
  assert.deepEqual(active.cards,native.cards);assert.deepEqual(active.controls,native.controls);assert.deepEqual(active.strip,native.strip);assert.equal(active.body.clientWidth,native.body.clientWidth);assert.equal(active.body.clientHeight,native.body.clientHeight);assert.equal(active.body.gutter,native.body.gutter);assert.equal(native.vertical,null);assert.equal(native.horizontal,null);assert.notEqual(native.body.color,active.body.color);
  await page.evaluate(()=>subject.scrollbars=fixtureRailFactory(subject.modal.querySelector('.mmc-tl-body'),subject.stripHost));await settle();
 });
 await check('Forgiving near-cursor range smoothly enlarges and brightens without moving controls',async()=>{
  await page.mouse.move(400,10);await page.waitForTimeout(210);let before=await metrics();assert.equal(before.vertical.width,6);
  await page.mouse.move(before.body.right-36,before.body.top+100);await page.waitForTimeout(60);const middle=await metrics();assert.ok(middle.vertical.width>6&&middle.vertical.width<10,JSON.stringify(middle.vertical));near(middle.body.right-middle.vertical.thumb.right,6,'Gap during enlargement');
  await page.waitForTimeout(160);const hot=await metrics();near(hot.vertical.width,10,'Final enlarged width');near(hot.body.right-hot.vertical.thumb.right,6,'Gap at enlarged width');assert.notEqual(hot.vertical.color,before.vertical.color);assert.deepEqual(hot.cards,before.cards);assert.deepEqual(hot.controls,before.controls);
  await page.mouse.move(400,10);await page.waitForTimeout(210);near((await metrics()).vertical.width,6,'Returns to native visual width');
  await page.evaluate(()=>showHorizontal());await settle();before=await metrics();assert.equal(before.horizontal.hidden,false);
  await page.mouse.move(before.horizontal.rect.left+100,before.strip.bottom-28);await page.waitForTimeout(60);const hmiddle=await metrics();assert.ok(hmiddle.horizontal.height>6&&hmiddle.horizontal.height<10);
  await page.waitForTimeout(160);near((await metrics()).horizontal.height,10,'Horizontal expanded height');
  await page.screenshot({path:path.join(output,'near-horizontal.png')});
 });
 await check('Real pointer capture drags in the widened vertical lane, clamps outside the modal, and never activates card controls',async()=>{
  await reset({});let m=await metrics();const x=m.vertical.rect.left+3,y=m.vertical.thumb.top+Math.min(12,m.vertical.thumb.height/2);
  assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('mmc-tl-scroll-rail'),{x,y}),true);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,1200,{steps:6});await settle();m=await metrics();near(m.body.scrollTop,m.body.scrollHeight-m.body.clientHeight,'Clamped end');assert.ok(m.captureEvents.includes('gotpointercapture'));assert.equal(m.controlHits,0);
  await page.mouse.up();await settle();m=await metrics();assert.ok(m.captureEvents.includes('lostpointercapture'));assert.equal(m.vertical.now,Math.round(m.body.scrollTop));assert.equal(m.snapshot,await page.evaluate(()=>railSnapshot));
 });
 await check('Horizontal widened padding hit lane drags, wheels and accepts native scrollbar keyboard semantics',async()=>{
  await reset({});await page.evaluate(()=>showHorizontal());await settle();let m=await metrics();const x=m.horizontal.thumb.left+12,y=m.horizontal.rect.top+3;
  assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('mmc-tl-scroll-rail'),{x,y}),true);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(1450,y,{steps:6});await page.mouse.up();await settle();m=await metrics();near(m.strip.scrollLeft,m.strip.scrollWidth-m.strip.clientWidth,'Horizontal clamp');assert.equal(m.controlHits,0);
  const rail=page.locator('.mmc-tl-scroll-rail.horizontal');await rail.focus();await page.keyboard.press('Home');await settle();near((await metrics()).strip.scrollLeft,0,'Home');await page.keyboard.press('ArrowRight');await settle();near((await metrics()).strip.scrollLeft,40,'ArrowRight');await page.keyboard.press('PageDown');await settle();assert.ok((await metrics()).strip.scrollLeft>40);await page.keyboard.press('End');await settle();near((await metrics()).strip.scrollLeft,m.strip.scrollWidth-m.strip.clientWidth,'End');
  await page.keyboard.press('Home');await settle();const result=await page.evaluate(()=>{const rail=subject.modal.querySelector('.mmc-tl-scroll-rail.horizontal'),before=subject.stripHost.scrollLeft;rail.dispatchEvent(new WheelEvent('wheel',{deltaY:2,deltaMode:1,cancelable:true,bubbles:true}));const line=subject.stripHost.scrollLeft;rail.dispatchEvent(new WheelEvent('wheel',{deltaY:1,deltaMode:2,cancelable:true,bubbles:true}));const page=subject.stripHost.scrollLeft;const event=new WheelEvent('wheel',{deltaY:100,ctrlKey:true,cancelable:true,bubbles:true});rail.dispatchEvent(event);return{before,line,page,after:subject.stripHost.scrollLeft,prevented:event.defaultPrevented};});
  assert.equal(result.line-result.before,32);assert.equal(result.page,Math.min(m.strip.scrollWidth-m.strip.clientWidth,result.line+m.strip.clientWidth));assert.equal(result.after,result.page);assert.equal(result.prevented,false);
 });
 await check('Attribute-only preceding disclosure movement repositions or hides the horizontal rail without layout interception',async()=>{
  await reset({height:240});await page.evaluate(()=>showHorizontal());await settle();const before=await metrics();
  await page.evaluate(()=>{subject.promptSection.body.style.height='360px';subject.promptSection.setOpen(true);});await settle();let after=await metrics();assert.ok(after.strip.bottom>before.strip.bottom);assert.equal(after.horizontal.hidden,true,'A clipped strip edge must not float over cards');
  await page.evaluate(()=>subject.promptSection.setOpen(false));await settle();after=await metrics();assert.equal(after.horizontal.hidden,false);near(after.horizontal.rect.top,after.strip.bottom-16,'Exact folded rail anchor');
  for(const control of after.controls){const rail=after.horizontal.rect;assert.ok(control.bottom<=rail.top||control.top>=rail.bottom||control.right<=rail.left||control.left>=rail.right,'No card-button overlay');}
 });
 await check('All sizes/locales preserve browser-chosen native gutter and fixed geometry with no overflow or data writes',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko'])for(const scale of [.8,1,1.6]){
   await page.setViewportSize({width,height:900});await reset({language,scale,height:700});const managed=await metrics();assert.ok(managed.body.gutter>=6&&managed.body.gutter<=16);assert.equal(managed.snapshot,await page.evaluate(()=>railSnapshot));near(managed.body.right-managed.vertical.thumb.right,6,'Inset at every size/type');
   for(const control of managed.controls){const rail=managed.vertical.rect;assert.ok(control.bottom<=rail.top||control.top>=rail.bottom||control.right<=rail.left||control.left>=rail.right,'No vertical card-button overlay');}
   await page.evaluate(()=>subject.scrollbars.destroy());const native=await metrics();assert.deepEqual(managed.cards,native.cards);assert.deepEqual(managed.controls,native.controls);assert.equal(managed.body.clientWidth,native.body.clientWidth);assert.equal(managed.body.gutter,native.body.gutter);assert.equal(managed.strip.clientWidth,native.strip.clientWidth);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }
 });
 await check('Destroy during capture removes all rails, classes, temporary IDs and future observer/listener work',async()=>{
  await page.setViewportSize({width:1200,height:900});await reset({});const m=await metrics();await page.mouse.move(m.vertical.rect.left+3,m.vertical.thumb.top+10);await page.mouse.down();
  await page.mouse.move(m.vertical.rect.left+3,m.vertical.thumb.top+12);
  const ownership=await page.evaluate(()=>{const rail=subject.modal.querySelector('.mmc-tl-scroll-rail.vertical');rail.dispatchEvent(new PointerEvent('pointerdown',{pointerId:777,pointerType:'touch',button:0,clientX:rail.getBoundingClientRect().left+3,clientY:rail.getBoundingClientRect().top+12,bubbles:true}));return{first:rail.hasPointerCapture(firstCaptureId),second:rail.hasPointerCapture(777)};});assert.deepEqual(ownership,{first:true,second:false});
  await page.evaluate(()=>{window.detachedRails=[...subject.modal.querySelectorAll('.mmc-tl-scroll-rail')];window.destroyedHelper=subject.scrollbars;subject.close();destroyedHelper.destroy();});await page.mouse.move(400,600);await page.mouse.up();await settle();
  assert.equal(await page.locator('.mmc-tl-scroll-rail,.mmc-tl-scroll-managed,.mmc-tl-scrollbars').count(),0);
  assert.equal(await page.evaluate(()=>detachedRails.every(rail=>!rail.isConnected&&!rail.hasPointerCapture(firstCaptureId))),true);
  await page.evaluate(()=>{dispatchEvent(new Event('resize'));subject.stripHost.append(document.createElement('span'));subject.stripHost.dispatchEvent(new Event('scroll'));});await settle();assert.equal(await page.locator('.mmc-tl-scroll-rail').count(),0);
  assert.equal(await page.evaluate(()=>subject.stripHost.id), '');
 });
 assert.equal(requests,0);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,configurations:18,requests,errors},null,2));console.log(JSON.stringify({passed:checks.length,configurations:18,requests,errors:errors.length}));
})().finally(async()=>{await browser?.close();}).catch(error=>{console.error(error);process.exitCode=1;});
