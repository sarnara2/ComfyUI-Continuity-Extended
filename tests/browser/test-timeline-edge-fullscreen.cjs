// Actual Timeline mount/close, production mountOverlay layer/Escape handler and
// ordered CSS. Existing fullscreen-shell markup is an inert underlay; prepared
// preview media is recorded entirely in RAM. No live node/server/model/API work.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(repo,'web/creator',name),'utf8');
const bodyPath=path.join(repo,'tests/browser/test-timeline-body-scrollbar.cjs'),bodyText=fs.readFileSync(bodyPath,'utf8');
const base=vm.runInNewContext(bodyText.slice(0,bodyText.indexOf('const results=[],layouts=[],errors=[];'))+';({code,css});',{require,process,__dirname:path.dirname(bodyPath)});
const fn=name=>read('dom.js').match(new RegExp('^export function '+name+'\\([^]*?^\\}','m'))[0].replace(/^export /,'');
const stub='const mountOverlay=overlay=>{document.body.append(overlay);return()=>overlay.remove();};';
assert.equal(base.code.split(stub).length,2,'One explicit header adapter overlay boundary');
const code=base.code.replace(stub,fn('mountOverlay'))+`
window.edgeDismissable=dismissable;window.edgeMountOverlay=mountOverlay;
window.edgeOpen=(options={})=>{
 subject?.overlay?.isConnected&&subject.close();
 document.querySelector('#edge-shell')?.remove();document.querySelector('#edge-opener')?.remove();
 const opener=fixtureEl('button',{id:'edge-opener',text:'Open Timeline (inert host)'});
 if(options.fullscreen){window.edgeShell=fixtureEl('div',{id:'edge-shell',class:'mmc-fs'+(options.simple?' simple':'')},[
  fixtureEl('div',{class:'mmc-fs-bar'},[opener]),fixtureEl('div',{class:'mmc-fs-body',text:'Existing fullscreen host — no live node'})]);document.body.prepend(edgeShell);}
 else{window.edgeShell=null;document.body.prepend(opener);}
 opener.focus();installScrollFixture({ready:true,count:12,language:options.language||'en',scale:options.scale||1});
 return{focus:document.activeElement.id,snapshot:JSON.stringify(subject.timeline),closed:subject.closed||0};
};
window.edgeMetrics=()=>{const b=subject.modal.querySelector(':scope > .mmc-tl-body'),s=subject.stripHost,rect=n=>{const r=n.getBoundingClientRect();return[r.left,r.top,r.right,r.bottom];};return{
 overlay:rect(subject.overlay),modal:rect(subject.modal),radius:getComputedStyle(subject.modal).borderRadius,border:getComputedStyle(subject.modal).borderWidth,
 padding:getComputedStyle(subject.overlay).padding,z:Number(getComputedStyle(subject.overlay).zIndex),shellZ:edgeShell?Number(getComputedStyle(edgeShell).zIndex):null,
 header:rect(subject.modal.querySelector('.mmc-tl-header')),body:rect(b),bodyTop:b.scrollTop,bodyHeight:b.clientHeight,bodyScroll:b.scrollHeight,gutter:b.offsetWidth-b.clientWidth,
 bodyWidth:getComputedStyle(b).scrollbarWidth,bodyBar:getComputedStyle(b,'::-webkit-scrollbar').display,bodyThumb:getComputedStyle(b,'::-webkit-scrollbar-thumb').borderRadius,
 stripWidth:getComputedStyle(s).scrollbarWidth,stripBar:getComputedStyle(s,'::-webkit-scrollbar').display,stripThumb:getComputedStyle(s,'::-webkit-scrollbar-thumb').borderRadius,
 stripLeft:s.scrollLeft,stripClient:s.clientWidth,stripScroll:s.scrollWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
 sound:rect(subject.sound.host),snapshot:JSON.stringify(subject.timeline),focus:document.activeElement.id};};
`;
new vm.Script(code);
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-timeline-edge'));
const checks=[],layouts=[],errors=[];let requests=0,browser;
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1600,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<style>'+base.css+':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}</style>');
 await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=208;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();let f=0;const timer=setInterval(()=>{ctx.fillStyle=++f%2?'#45586b':'#53687b';ctx.fillRect(0,0,120,208);},50);await new Promise(resolve=>setTimeout(resolve,500));clearInterval(timer);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());window.localMediaUrl=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));});
 await page.evaluate('(()=>{'+code+'})()');
 const open=options=>page.evaluate(options=>edgeOpen(options),options);
 await check('Ordinary and existing fullscreen full/simple hosts use edge-to-edge square Timeline bounds, with independent thin native body/strip rails',async()=>{
  for(const width of [320,640,1600,2200])for(const fullscreen of [false,true])for(const language of ['en','ko'])for(const scale of [1,1.6]){
   await page.setViewportSize({width,height:900});const before=await open({fullscreen,simple:width===640,language,scale});await page.waitForFunction(()=>scrollPlayers.every(c=>c.media.readyState>=2));const value=await page.evaluate(()=>edgeMetrics());
   assert.deepEqual(value.overlay,[0,0,width,900]);assert.deepEqual(value.modal,[0,0,width,900]);assert.equal(value.radius,'0px');assert.equal(value.border,'0px');assert.equal(value.padding,'0px');assert.equal(value.pageOverflow,false);assert.equal(value.focus,before.focus);assert.equal(value.focus,'edge-opener');
   assert.equal(value.bodyWidth,'thin');assert.equal(value.bodyBar,'block');assert.equal(value.bodyThumb,'3px');assert.ok(value.gutter>0);assert.ok(value.bodyScroll>value.bodyHeight);
   assert.equal(value.stripWidth,'thin');assert.equal(value.stripBar,'block');assert.equal(value.stripThumb,'3px');assert.ok(value.stripScroll>value.stripClient);if(fullscreen)assert.ok(value.z>value.shellZ);
   layouts.push({width,fullscreen,language,scale});if(width===1600&&language==='ko'&&scale===1.6)await page.screenshot({path:path.join(output,'timeline-edge-'+(fullscreen?'fullscreen':'ordinary')+'-ko-large.png')});
  }
 });
 await check('Whole-body native thumb/wheel reaches bottom content without moving header or horizontal card position',async()=>{
  await page.setViewportSize({width:1600,height:900});await open({fullscreen:true});const before=await page.evaluate(()=>edgeMetrics());
  const x=before.body[2]-before.gutter/2,y=before.body[1]+Math.max(10,before.bodyHeight*before.bodyHeight/before.bodyScroll/2);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+140,{steps:15});await page.mouse.up();await page.waitForFunction(()=>subject.modal.querySelector('.mmc-tl-body').scrollTop>20);
  await page.mouse.move(before.body[2]-14,before.body[1]+70);await page.mouse.wheel(0,4000);await page.waitForTimeout(30);const after=await page.evaluate(()=>edgeMetrics());assert.deepEqual(after.header,before.header);assert.equal(after.stripLeft,0);assert.ok(after.sound[3]<=after.body[3]-8);assert.equal(after.snapshot,before.snapshot);
 });
 await check('Popover Escape closes the transient layer first; a nested non-Timeline overlay retains its old padding/radius and closes independently',async()=>{
  await open({fullscreen:true});await page.evaluate(()=>{const button=fixtureEl('button',{text:'Popover focus'}),pop=fixtureEl('div',{class:'mmc-pop'},[button]);document.body.append(pop);window.edgePopClose=edgeDismissable(pop);button.focus();});await page.waitForTimeout(10);await page.keyboard.press('Escape');assert.equal(await page.locator('body > .mmc-pop').count(),0);assert.equal(await page.locator('.mmc-tl-overlay').count(),1);assert.equal(await page.locator('#edge-shell').count(),1);
  const old=await page.evaluate(()=>{const modal=fixtureEl('div',{class:'mmc-modal',text:'Unrelated nested editor'}),overlay=fixtureEl('div',{class:'mmc-overlay'},[modal]);window.edgeChildClose=edgeMountOverlay(overlay,()=>edgeChildClose());return{padding:getComputedStyle(overlay).padding,radius:getComputedStyle(modal).borderRadius,z:Number(getComputedStyle(overlay).zIndex),timelineZ:Number(getComputedStyle(subject.overlay).zIndex)};});assert.notEqual(old.padding,'0px');assert.notEqual(old.radius,'0px');assert.ok(old.z>old.timelineZ);await page.keyboard.press('Escape');assert.equal(await page.locator('.mmc-tl-overlay').count(),1);assert.equal(await page.locator('body > .mmc-overlay').count(),1);
 });
 await check('Close and Escape unmount only Timeline once; fullscreen shell and baseline focus behavior remain intact',async()=>{
  await open({fullscreen:true});await page.keyboard.press('Escape');assert.equal(await page.locator('.mmc-tl-overlay').count(),0);assert.equal(await page.locator('#edge-shell').count(),1);assert.equal(await page.evaluate(()=>subject.closed),1);assert.equal(await page.evaluate(()=>document.activeElement.id),'edge-opener');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>subject.closed),1);
  await open({fullscreen:true,simple:true});await page.locator('.mmc-tl-header > .mmc-close').click();assert.equal(await page.locator('.mmc-tl-overlay').count(),0);assert.equal(await page.locator('#edge-shell.simple').count(),1);assert.equal(await page.evaluate(()=>subject.closed),1);assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BODY','Prior close-click does not implement opener focus restoration');
 });
 assert.equal(requests,0);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,layouts,requests,errors,limits:'Production Timeline mount/close/CSS/layer handlers; inert existing fullscreen markup and RAM media. Existing close-click focus behavior preserved, no new opener restoration.'},null,2));console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,requests,errors:errors.length}));
})().finally(async()=>{await browser?.close();}).catch(e=>{console.error(e);process.exitCode=1;});
