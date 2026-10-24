// Actual Timeline constructor/mount wheel listener, production CSS cascade and
// native Chrome wheel/scrollbar input. Fake card/media/catalog rows are isolated
// read-only fixture boundaries; no server, workflow/profile, API, queue or GPU.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sourceRoot=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(sourceRoot,'web/creator'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const timeline=read('timeline.js');
const wheel=timeline.match(/    this\.stripHost\.addEventListener\("wheel", \(event\) => \{[^]*?    \}, \{ passive: false \}\);/)?.[0];
assert.ok(wheel,'Actual mounted strip wheel listener');
assert.match(wheel,/event\.clientY >= bounds\.bottom - 32/);
assert.match(wheel,/body\.scrollTop \+= event\.deltaY \* unit/);
assert.doesNotMatch(wheel,/this\.(?:timeline|commit|onCommit)|segment\.|\.push\(|\.splice\(/,'Wheel is view-only');
const headerFile=path.join(sourceRoot,'tests/browser/test-timeline-header-layout.cjs');
const prefix=fs.readFileSync(headerFile,'utf8').split('new vm.Script(code,')[0];
let {code}=vm.runInNewContext(prefix+';({code});',{require,__dirname:path.dirname(headerFile),process},{filename:headerFile});
assert.ok(code.includes(wheel),'Maintained actual-mount adapter contains the exact production listener');
const scrollbarHelper=read('timeline-scrollbars.js').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
assert.ok(code.includes(scrollbarHelper),'Mount uses the complete actual scrollbar helper, not a simulated helper');
const styleSource=read('styles.js');
const imports=Object.fromEntries([...styleSource.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(m=>[m[1],m[2]]));
const cssOrder=styleSource.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(n=>n.trim()).filter(Boolean);
const css=cssOrder.map(owner=>read('styles/'+imports[owner]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
code+=`
window.wheelReset=(options={})=>{
 setFixture({...options,segments:Array.from({length:options.count??9},(_,index)=>({prompt:'Read-only card '+index,duration_s:14.38,take:{filename:'fixture-'+index+'.mp4'}}))});
 const strip=subject.stripHost,body=strip.closest('.mmc-tl-body');
 strip.style.height='320px';strip.style.minHeight='320px';strip.style.flex='0 0 auto';
 for(const card of strip.children){card.style.height='300px';card.style.gridRow='2';}
 subject.sound.host.hidden=false;subject.sound.host.style.height='1100px';subject.sound.host.style.flex='0 0 auto';
 body.scrollTop=Math.max(0,strip.offsetTop-body.offsetTop-70);strip.scrollLeft=0;
 window.wheelFixture={body,strip,events:[]};
 subject.modal.addEventListener('wheel',event=>setTimeout(()=>wheelFixture.events.push({target:event.target.className,
  x:event.clientX,y:event.clientY,deltaX:event.deltaX,deltaY:event.deltaY,cancelable:event.cancelable,prevented:event.defaultPrevented,current:body===wheelFixture.body,
  top:body.scrollTop,left:strip.scrollLeft,stripBottom:strip.getBoundingClientRect().bottom})),{capture:true});
 return snapshot();
};
window.wheelMetrics=()=>{
 const {body,strip}=wheelFixture,b=body.getBoundingClientRect(),s=strip.getBoundingClientRect();
 return{body:{top:b.top,bottom:b.bottom,left:b.left,right:b.right,scrollTop:body.scrollTop,max:body.scrollHeight-body.clientHeight,client:body.clientHeight},
  strip:{top:s.top,bottom:s.bottom,left:s.left,right:s.right,scrollLeft:strip.scrollLeft,max:strip.scrollWidth-strip.clientWidth,client:strip.clientWidth,
   height:s.height,gutter:strip.offsetHeight-strip.clientHeight},document:scrollY};
};
window.wheelSeed=(body=240,strip=200)=>{
 wheelFixture.body.scrollTop=body;wheelFixture.strip.scrollLeft=strip;return wheelMetrics();
};
window.wheelDispatch=({band=64,deltaX=0,deltaY=0,deltaMode=0,ctrlKey=false}={})=>{
 const before=wheelMetrics(),s=wheelFixture.strip.getBoundingClientRect();
 const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX,deltaY,deltaMode,ctrlKey,
  clientX:s.left+70,clientY:s.bottom-band});
 wheelFixture.strip.dispatchEvent(event);return{before,after:wheelMetrics(),prevented:event.defaultPrevented};
};
`;
new vm.Script(code,{filename:'timeline-wheel-axis-actual-mount.js'});
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-timeline-wheel-axis'));
assert.ok(output!==sourceRoot&&!output.startsWith(sourceRoot+path.sep),'Evidence outside product');
const results=[],layouts=[],errors=[];let browser,requests=0;
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1.1,message+' '+JSON.stringify({a,b}));
const clamp=(value,max)=>Math.max(0,Math.min(max,value));
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
(async()=>{
 browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<html class="dark-theme"><head><style>'+css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}</style></head><body></body></html>');
 await page.evaluate('(()=>{'+code+'})()');
 const reset=async options=>{const value=await page.evaluate(options=>wheelReset(options),options);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return value;};
 const snapshot=()=>page.evaluate(()=>window.snapshot());
 await check('Native wheel over a card scrolls the Timeline body vertically and does not move the strip or page',async()=>{
  const baseline=await reset({});const before=await page.evaluate(()=>wheelMetrics());
  assert.ok(before.body.max>400,'Isolated content provides a genuinely scrollable body '+JSON.stringify(before));
  const x=before.strip.left+120,y=Math.max(before.strip.top+80,before.body.top+60);
  assert.ok(y<before.strip.bottom-33&&y<before.body.bottom-60);
  const hit=await page.evaluate(([x,y])=>{const node=document.elementFromPoint(x,y);return{class:node?.className,inside:!!node?.closest('.mmc-tl-strip')};},[x,y]);
  assert.equal(hit.inside,true,'Native card wheel is actually over the strip '+JSON.stringify({before,x,y,hit}));
  await page.mouse.move(x,y);await page.waitForTimeout(220);await page.mouse.wheel(0,160);
  await page.waitForFunction(expected=>Math.abs(wheelFixture.body.scrollTop-expected)<1.1,clamp(before.body.scrollTop+160,before.body.max));
  const after=await page.evaluate(()=>wheelMetrics());close(after.body.scrollTop,before.body.scrollTop+160,'Card wheel body delta');
  close(after.strip.scrollLeft,before.strip.scrollLeft,'Card wheel strip unchanged');assert.equal(after.document,0);assert.deepEqual(await snapshot(),baseline);
 });
 await check('Native wheel in the bottom 32px band moves only the horizontal strip, positive and negative',async()=>{
  const baseline=await reset({});
  for(const amount of [140,-80]){
   const before=await page.evaluate(()=>wheelMetrics());const y=before.strip.bottom-16;
   assert.ok(before.strip.max>500,'Actual isolated cards overflow horizontally '+JSON.stringify(before));
   assert.ok(y>before.body.top&&y<before.body.bottom,'Bottom band is visible inside body');
   await page.mouse.move(before.strip.left+70,y);await page.waitForTimeout(220);await page.mouse.wheel(0,amount);
   await page.waitForFunction(expected=>Math.abs(wheelFixture.strip.scrollLeft-expected)<1.1,clamp(before.strip.scrollLeft+amount,before.strip.max));
   const after=await page.evaluate(()=>wheelMetrics());
   close(after.body.scrollTop,before.body.scrollTop,'Bottom wheel body unchanged '+JSON.stringify(await page.evaluate(()=>wheelFixture.events)));assert.equal(after.document,0);
  }
  assert.deepEqual(await snapshot(),baseline);
 });
 await check('The exact 32/33px boundary routes cancelable pixel, line and page deltas; native diagonal/horizontal card deltas cannot drift sideways',async()=>{
  const baseline=await reset({});
  for(const deltaMode of [0,1,2])for(const band of [32,33,64])for(const [deltaX,deltaY]of [[0,1],[0,-1],[4,2],[-4,-2],[3,0]]){
   await page.evaluate(()=>wheelSeed());const value=await page.evaluate(options=>wheelDispatch(options),{deltaMode,band,deltaX,deltaY});
   const side=band<=32,unit=deltaMode===1?16:deltaMode===2?(side?value.before.strip.client:value.before.body.client):1;
   const horizontal=side?(Math.abs(deltaX)>Math.abs(deltaY)?deltaX:deltaY)*unit:0,vertical=side?0:deltaY*unit;
   assert.equal(value.prevented,true);close(value.after.strip.scrollLeft,clamp(value.before.strip.scrollLeft+horizontal,value.before.strip.max),'Exact horizontal routing');
   close(value.after.body.scrollTop,clamp(value.before.body.scrollTop+vertical,value.before.body.max),'Exact vertical routing');assert.equal(value.after.document,0);
   layouts.push({deltaMode,band,deltaX,deltaY,...value});
  }
  // This is actual native wheel input, not only a synthetic listener call.
  await reset({});const before=await page.evaluate(()=>wheelMetrics());
  await page.mouse.move(before.strip.left+90,before.strip.top+70);await page.mouse.wheel(120,0);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const after=await page.evaluate(()=>wheelMetrics());close(after.strip.scrollLeft,before.strip.scrollLeft,'Native horizontal card wheel blocked');close(after.body.scrollTop,before.body.scrollTop,'Horizontal-only card wheel adds no vertical amount');
  assert.deepEqual(await snapshot(),baseline);
 });
 await check('Ctrl+wheel and zero deltas remain untouched; a strip without horizontal overflow routes the bottom band vertically',async()=>{
  let baseline=await reset({});
  for(const band of [16,64])for(const options of [{ctrlKey:true,deltaX:8,deltaY:30},{}]){
   await page.evaluate(()=>wheelSeed());const value=await page.evaluate(options=>wheelDispatch(options),{band,...options});assert.equal(value.prevented,false);assert.deepEqual(value.after,value.before);
  }
  assert.deepEqual(await snapshot(),baseline);baseline=await reset({count:1});
  await page.evaluate(()=>wheelSeed(200,0));const value=await page.evaluate(()=>wheelDispatch({band:16,deltaY:40}));
  assert.equal(value.before.strip.max,0);assert.equal(value.prevented,true);close(value.after.body.scrollTop,value.before.body.scrollTop+40,'No-overflow band is vertical');assert.equal(value.after.strip.scrollLeft,0);
  assert.deepEqual(await snapshot(),baseline);
 });
 await check('Browser clamps both axes at their own bounds without committing data or forwarding scrolling to the document',async()=>{
  const baseline=await reset({});
  for(const [body,strip]of [[0,0],[1e9,1e9]])for(const band of [16,64])for(const deltaY of [-1e5,1e5]){
   await page.evaluate(([body,strip])=>wheelSeed(body,strip),[body,strip]);const value=await page.evaluate(options=>wheelDispatch(options),{band,deltaY});
   const side=band<=32;close(value.after.strip.scrollLeft,side?clamp(value.before.strip.scrollLeft+deltaY,value.before.strip.max):value.before.strip.scrollLeft,'Independent strip clamp');
   close(value.after.body.scrollTop,side?value.before.body.scrollTop:clamp(value.before.body.scrollTop+deltaY,value.before.body.max),'Independent body clamp');assert.equal(value.after.document,0);
  }
  assert.deepEqual(await snapshot(),baseline);
 });
 await check('Wheel on an inert bottom-band child bubbles through the actual strip listener; missing-body ownership returns without hijacking',async()=>{
  const baseline=await reset({});
  const value=await page.evaluate(()=>{
   wheelSeed(200,200);const before=wheelMetrics(),child=document.createElement('div');child.className='wheel-inert-band';child.setAttribute('aria-hidden','true');wheelFixture.strip.append(child);
   const r=wheelFixture.strip.getBoundingClientRect(),event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:70,clientX:r.left+50,clientY:r.bottom-20});child.dispatchEvent(event);child.remove();
   return{before,after:wheelMetrics(),prevented:event.defaultPrevented};
  });
  assert.equal(value.prevented,true);close(value.after.strip.scrollLeft,value.before.strip.scrollLeft+70,'Inert child horizontal band');close(value.after.body.scrollTop,value.before.body.scrollTop,'Inert child body unchanged');
  const detached=await page.evaluate(()=>{
   const strip=wheelFixture.strip,parent=strip.parentElement,next=strip.nextSibling;document.body.append(strip);const value=wheelDispatch({band:16,deltaY:50});parent.insertBefore(strip,next);return value;
  });assert.equal(detached.prevented,false);assert.deepEqual(detached.after,detached.before);assert.deepEqual(await snapshot(),baseline);
 });
 await check('The actual managed horizontal thumb accepts native pointer dragging as an independent, read-only direct operation',async()=>{
  const baseline=await reset({});let before=await page.evaluate(()=>wheelMetrics());assert.ok(before.strip.max>500&&before.strip.gutter>0);
  const x=before.strip.left+Math.max(12,before.strip.client*before.strip.client/(before.strip.client+before.strip.max)/2);
  let y=before.strip.bottom-before.strip.gutter/2;await page.mouse.move(x,y);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));before=await page.evaluate(()=>wheelMetrics());y=before.strip.bottom-before.strip.gutter/2;
  assert.equal(await page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('.mmc-tl-scroll-rail.horizontal'),[x,y]),true,'Direct drag targets the actual managed rail, not a fake thumb');
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+140,y,{steps:14});await page.mouse.up();await page.waitForFunction(()=>wheelFixture.strip.scrollLeft>25);
  const after=await page.evaluate(()=>wheelMetrics());assert.ok(after.strip.scrollLeft>25);close(after.body.scrollTop,before.body.scrollTop,'Thumb drag body unchanged');assert.equal(after.document,0);assert.deepEqual(await snapshot(),baseline);
 });
 await check('Narrow/wide EN/KO normal/enlarged mount keeps both wheel axes independent with no whole-page overflow',async()=>{
  for(const width of [320,900,1600])for(const language of ['en','ko'])for(const scale of [1,1.6]){
   await page.setViewportSize({width,height:1000});const baseline=await reset({language,scale});
   for(const band of [16,64]){
    await page.evaluate(()=>wheelSeed(100,100));const value=await page.evaluate(options=>wheelDispatch(options),{band,deltaY:60});
    close(value.after.strip.scrollLeft,value.before.strip.scrollLeft+(band<=32?60:0),'Responsive strip axis');close(value.after.body.scrollTop,value.before.body.scrollTop+(band>32?60:0),'Responsive body axis');assert.equal(value.after.document,0);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(await snapshot(),baseline);layouts.push({width,language,scale});
  }
 });
 fs.mkdirSync(output,{recursive:true});await page.setViewportSize({width:1600,height:1000});await reset({language:'ko'});await page.screenshot({path:path.join(output,'timeline-wheel-axis-ko.png')});
 assert.equal(requests,0);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'timeline-wheel-axis-report.json'),JSON.stringify({sourceRoot,cssOrder,checks:results.length,results,layouts,requests,errors,limits:'Actual mount wheel listener, maintained metadata/card adapter and production CSS; no live application, API, user media/workflow/profile or GPU.'},null,2));
 console.log(JSON.stringify({passed:results.length,layouts:layouts.length,requests,errors,output}));await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
