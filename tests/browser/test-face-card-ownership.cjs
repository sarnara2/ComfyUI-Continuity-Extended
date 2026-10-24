// Actual state, card DOM and Face pass popover in offline Chrome. No server,
// model, GPU, workflow rewrite or media generation; saved take metadata is RAM.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(repo,'web/creator'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('timeline.js');
const method=(name,text=source)=>{const m=text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));assert.ok(m,name);return m[0];};
const shared=path.join(repo,'tests/browser/test-card-individual-preview.cjs'),legacy=fs.readFileSync(shared,'utf8');
const boundary=legacy.indexOf('\n(async()=>{');assert.ok(boundary>0);
const fixture=vm.runInNewContext(legacy.slice(0,boundary)+'\n;({setupPage,errors,getRequests:()=>requests});',{require,process,__dirname:path.dirname(shared)},{filename:shared});
const styles=read('styles.js'),imports=Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(m=>[m[1],m[2]]));
const order=styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(s=>s.trim()).filter(Boolean);
const css=order.map(name=>read('styles/'+imports[name]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR):path.resolve(repo,'../baseline');
if(fs.existsSync(path.join(baseline,'web/creator/timeline.js'))){
 const old=fs.readFileSync(path.join(baseline,'web/creator/timeline.js'),'utf8');
 for(const name of ['takeChip','takeTools','remove','removeButton','disarm','holdSwitch','refineAll','refineTimelineField','refineFieldPayload','cardPreview','clearCardPreviews']){
  if(!new RegExp('^  (?:async )?'+name+'\\(','m').test(source))continue;
  const owner=method(name);
  // The title marquee owns one view-only observer, not a media resource.
  // Removing its exact two-line disposal retains the full original cleanup.
  assert.equal(name==='clearCardPreviews'?owner.replace('    this.cardTitleFit?.disconnect();\r\n    this.cardTitleFit = null;\r\n','').replace('    this.cardTitleFit?.disconnect();\n    this.cardTitleFit = null;\n',''):owner,
   method(name,old),'Unchanged owner '+name);
 }
 for(const name of ['creator/core/emit.py','creator/families/h3/render.py','creator/families/h3/facepass.py','creator/families/h3/faces.py','web/creator/neural.js'])
  assert.deepEqual(fs.readFileSync(path.join(repo,name)),fs.readFileSync(path.join(baseline,name)),'Runtime/source unchanged '+name);
 const noHoverTitle='"aria-label": hint, ...(hover ? {} : { title: hint })';
 let preview=read('card-preview.js').replace(/\r\n/g,'\n');
 const wideMarkers=/^  (?:  )?root\.classList\.toggle\("mmc-card-preview-wide", [^\r\n]*\);\r?\n/gm;
 const wideLines=preview.match(wideMarkers)||[];assert.equal(wideLines.length,3,'Three exact read-only panorama markers');
 assert.equal(wideLines.filter(line=>line==='    root.classList.toggle("mmc-card-preview-wide", box.width / box.height >= 2.1);\n').length,2);
 assert.equal(wideLines.filter(line=>line==='  root.classList.toggle("mmc-card-preview-wide", Boolean(source.width && source.height) && box.width / box.height >= 2.1);\n').length,1);
 preview=preview.replace(wideMarkers,'');
 const portraitMarkers=/^  (?:  )?root\.classList\.toggle\("mmc-card-preview-portrait", [^\r\n]*\);\r?\n/gm;
 const markerLines=preview.match(portraitMarkers)||[];assert.equal(markerLines.length,3,'Three exact read-only portrait markers');
 assert.equal(markerLines.filter(line=>line==='    root.classList.toggle("mmc-card-preview-portrait", box.height > box.width);\n').length,2);
 assert.equal(markerLines.filter(line=>line==='  root.classList.toggle("mmc-card-preview-portrait", Boolean(source.width && source.height) && box.height > box.width);\n').length,1);
 preview=preview.replace(portraitMarkers,'');
 assert.equal(preview.split(noHoverTitle).length,2,'One exact approved EXT73 title guard');
 assert.equal(preview.replace(noHoverTitle,'"aria-label": hint, title: hint'),
  fs.readFileSync(path.join(baseline,'web/creator/card-preview.js'),'utf8').replace(/\r\n/g,'\n'),
  'Every playback callback unchanged after removing only approved hover-title guard and three read-only portrait markers');
}
assert.doesNotMatch(method('renderPanel'),/facesPill\(/,'No outer Timeline Face pass');
assert.doesNotMatch(method('render',read('editor.js')),/facesPill\(/,'No outer sampler Face pass');
assert.match(method('renderPills',read('editor.js')),/facesPill\(\{ target: state, piece: this\.piece/,'Direct shot owns its equivalent');
// Positioning is registered once while the actual anchor is connected. The
// original placeNear ResizeObserver owns later growth and retained-anchor rect.
const facePopover=read('pills.js').match(/^export function openFacesPopover\([^]*?^\}/m)[0];
assert.equal((facePopover.match(/placeNear\(pop, anchor\)/g)||[]).length,1,'One Face placement registration, not one per commit');
const positionBackup=path.resolve(repo,'../baseline/web/creator/pills.js');
if(fs.existsSync(positionBackup)){
 const removed='    // Commit may replace the anchor while the same canonical card survives.\n    if (pop.isConnected) placeNear(pop, anchor);\n';
 const current=read('pills.js').replace(/\r\n/g,'\n');
 assert.equal(current.replace('    render();\n    commit();\n  };\n\n  const render = () => {\n    const face = parseFace(target.face);',
  '    render();\n    commit();\n'+removed+'  };\n\n  const render = () => {\n    const face = parseFace(target.face);'),
  fs.readFileSync(positionBackup,'utf8').replace(/\r\n/g,'\n'),'Only the redundant post-commit Face placement/comment is removed');
}

const adapter=`
 const {el,icon}=D;const {t}=I;const {rulesFor}=C;
 const probeAspectSizes=()=>{},resolutionPillText=()=>({title:'RAM geometry',sub:'480 × 832'});
 const describeRatio=()=> '9:16',aspectSourceLabel=()=> '',aspectGlyph=()=>el('span');const PILL_GLYPH=16;
 const familyPill=()=>el('span',{class:'mmc-pill',text:'Family (isolated)'});
 const refineButton=()=>el('button',{class:'mmc-pill',text:'Refine (isolated)',disabled:true});
 const stepperPill=()=>el('span');const blendSetsTail=()=>false;const openResolutionPopover=()=>{};
 class BarOwner{${method('renderBar')}}
 window.mountFaceSummary=(options={})=>{
  mountTimelineFixture(options);const subject=window.timelineSubject;
  subject.summaryHost=el('div',{class:'mmc-tl-summary-row'});subject.barHost=el('div',{class:'mmc-tl-bar'});
  subject.modal.querySelector('.mmc-tl-body').prepend(subject.summaryHost);
  subject.renderMode=()=>el('span');subject.storyboardPill=()=>el('span');
  subject.renderBar=BarOwner.prototype.renderBar;
  subject.render=function(){this.renderBar();this.renderStrip();};subject.render();
  return JSON.stringify(subject.timeline);
 };
`;
async function setupSubject(context,options={}){
 const page=await fixture.setupPage(context,options);await page.addStyleTag({content:css});
 await page.evaluate(`(()=>{${adapter}})()`);return page;
}
module.exports={fixture,css,source,read,method,setupSubject};

if(require.main===module)(async()=>{
 const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-face-card'));
 fs.mkdirSync(output,{recursive:true});const checks=[],layouts=[],positions=[];let browser;
 const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
 try{
  browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await setupSubject(context);
  const blob={version:2,face_schema:1,segments:[
   {card_id:'first',prompt:'One',duration_s:14.38,hold:true,take:{filename:'take.mp4 [output]',duration_s:14.38,stamp:'saved'}},
   {card_id:'second',prompt:'Two',duration_s:5},
   {card_id:'clip',kind:'clip',filename:'clip.mp4',duration_s:5},
  ]};
  const mount=async(options={})=>page.evaluate(options=>mountFaceSummary(options),{blob:JSON.stringify(blob),...options});
  const button=()=>page.locator('[data-mmc-segment-index="0"] .mmc-tl-card-face');
  const pop=()=>page.locator('.mmc-faces-pop');
  await check('Supported generated cards always have stable Face pass pills; supplied clips have none',async()=>{
   const before=await mount();assert.equal(await page.locator('.mmc-tl-card-face').count(),2);
   assert.equal(await button().textContent(),'Face pass');assert.equal(await button().getAttribute('aria-pressed'),'false');
   assert.equal(await page.locator('[data-mmc-segment-index="2"] .mmc-tl-card-face').count(),0);
   assert.equal(await page.evaluate(()=>JSON.stringify(timelineSubject.timeline)),before);
  });
  await check('Opening is read-only; ON/canvas/denoise writes only that canonical card and retains takes',async()=>{
   const before=await page.evaluate(()=>JSON.stringify(timelineSubject.timeline));await button().click();
   assert.equal(await page.evaluate(()=>JSON.stringify(timelineSubject.timeline)),before);assert.equal(await page.evaluate(()=>timelineSubject.commits),0);
   await pop().locator('.mmc-opt').nth(1).click();assert.equal(await button().getAttribute('aria-pressed'),'true');assert.equal(await button().textContent(),'Face pass');
   await pop().locator('.mmc-refine-row').nth(0).locator('.mmc-step').last().click();
   await pop().locator('.mmc-refine-row').nth(1).locator('.mmc-step').last().click();
   const result=await page.evaluate(()=>({face:timelineSubject.timeline.segments[0].face,sibling:timelineSubject.timeline.segments[1].face,take:timelineSubject.timeline.segments[0].take,commits:timelineSubject.commits}));
   assert.deepEqual(result.face,{on:true,canvas:544,denoise:.5});assert.equal(result.sibling.on,false);assert.equal(result.take.filename,'take.mp4 [output]');assert.equal(result.commits,3);
   await page.keyboard.press('Escape');await pop().waitFor({state:'detached'});
  });
  await check('Saved user ON survives reopen; duplicate is OFF with separate knobs; original stays ON',async()=>{
   const result=await page.evaluate(()=>{const piece=timelineSubject.timeline,original=piece.segments[0],copy=S.cloneSegment(original);copy.face.canvas=640;const saved=S.serializeTimeline(piece),restored=S.parseTimeline(saved);return{original:original.face,copy:copy.face,restored:restored.segments[0].face,marker:JSON.parse(saved).face_schema};});
   assert.deepEqual(result.original,{on:true,canvas:544,denoise:.5});assert.deepEqual(result.restored,result.original);assert.deepEqual(result.copy,{on:false,canvas:640,denoise:.5});assert.equal(result.marker,1);
  });
  await check('A deleted/replaced card cannot be written through an already-open Face popover',async()=>{
   await button().click();await page.evaluate(()=>{window.oldFaceOwner=timelineSubject.timeline.segments[0];timelineSubject.timeline.segments[0]=S.cloneSegment(oldFaceOwner);window.staleBefore=JSON.stringify(timelineSubject.timeline);window.staleCommits=timelineSubject.commits;});
   await pop().locator('.mmc-opt').first().click();await pop().waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>staleBefore===JSON.stringify(timelineSubject.timeline)&&staleCommits===timelineSubject.commits&&oldFaceOwner.face.on),true);
   await mount();await button().click();await page.evaluate(()=>{window.deletedFaceOwner=timelineSubject.timeline.segments.shift();window.deletedBefore=JSON.stringify(timelineSubject.timeline);window.deletedCommits=timelineSubject.commits;});
   await pop().locator('.mmc-opt').nth(1).click();await pop().waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>deletedBefore===JSON.stringify(timelineSubject.timeline)&&deletedCommits===timelineSubject.commits&&!deletedFaceOwner.face.on),true);
  });
  await check('Unsupported families omit Face control and opening stale unsupported ownership is inert',async()=>{
   await mount({blob:JSON.stringify({...blob,family:'ltx25'})});assert.equal(await page.locator('.mmc-tl-card-face').count(),0);
  });
  await check('OFF/ON outline geometry matches motion repair, including long translations at 0.8–1.6 scale',async()=>{
   for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const on of [false,true]){
    await mount({language,scale,blob:JSON.stringify({...blob,segments:[{...blob.segments[0],face:{on,canvas:512,denoise:.45}},blob.segments[1],blob.segments[2]]})});
    const value=await page.evaluate(()=>{const card=document.querySelector('[data-mmc-segment-index="0"]'),face=card.querySelector('.mmc-tl-card-face'),motion=card.querySelector('.mmc-tl-card-motion');return {card:{scroll:card.scrollWidth,client:card.clientWidth},face:['borderRadius','borderWidth','padding','minHeight','fontSize'].map(k=>getComputedStyle(face)[k]),motion:['borderRadius','borderWidth','padding','minHeight','fontSize'].map(k=>getComputedStyle(motion)[k]),facts:card.querySelector('.mmc-tl-card-refs').scrollWidth<=card.querySelector('.mmc-tl-card-refs').clientWidth+1};});
    assert.deepEqual(value.face,value.motion);assert.ok(value.card.scroll<=value.card.client+1,JSON.stringify(value));assert.equal(value.facts,true);layouts.push({language,scale,on});
   }
   await page.screenshot({path:path.join(output,'face-large-cjk.png'),fullPage:true});
  });
  await check('Face ON/OFF and repeated knob commits keep one native placement observer and the original detached-anchor rect, with viewport reclamping',async()=>{
   // The real app work area has no document-page rail. This inert tall host
   // otherwise creates one unrelated to Timeline's own independent body rail.
   await page.addStyleTag({content:'html,body{overflow:hidden}'});
   assert.equal(await page.evaluate(()=>document.documentElement.clientWidth),await page.evaluate(()=>innerWidth));
   await page.evaluate(()=>{
    const NativeObserver=window.ResizeObserver;
    window.faceObserverStats={created:0,disconnected:0,active:new Set()};
    window.ResizeObserver=class extends NativeObserver{
     observe(node,options){if(node.matches?.('.mmc-faces-pop')&&!this.faceObserved){this.faceObserved=true;faceObserverStats.created++;faceObserverStats.active.add(this);}return super.observe(node,options);}
     disconnect(){if(this.faceObserved&&faceObserverStats.active.delete(this))faceObserverStats.disconnected++;return super.disconnect();}
    };
   });
   const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const metrics=()=>page.evaluate(()=>{const pop=document.querySelector('.mmc-faces-pop'),r=pop.getBoundingClientRect(),a=faceAnchorRect;
    return{x:r.left,y:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom,
     expectedX:Math.max(8,Math.min(a.left,innerWidth-r.width-8)),
     expectedY:Math.max(8,a.top-r.height-8>8?a.top-r.height-8:Math.min(a.bottom+8,innerHeight-r.height-8)),
     oldAnchorConnected:faceOldAnchor.isConnected,observers:faceObserverStats.created-faceObserverStart,active:faceObserverStats.active.size};});
   const assertPlaced=async()=>{await settle();const m=await metrics();assert.ok(Math.abs(m.x-m.expectedX)<1&&Math.abs(m.y-m.expectedY)<1,JSON.stringify(m));
    assert.ok(m.x>=7.9&&m.y>=7.9&&m.right<=await page.evaluate(()=>innerWidth)-7.9&&m.bottom<=await page.evaluate(()=>innerHeight)-7.9,JSON.stringify(m));
    assert.equal(m.observers,1);assert.equal(m.active,1);return m;};
   for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [1,1.6])for(const edge of ['center','bottom-right']){
    await page.setViewportSize({width,height:1000});await mount({language,scale});
    const original=await page.evaluate(edge=>{
     window.faceObserverStart=faceObserverStats.created;window.faceOldAnchor=document.querySelector('[data-mmc-segment-index="0"] .mmc-tl-card-face');
     Object.assign(faceOldAnchor.style,{position:'fixed',left:(edge==='center'?(innerWidth<640?40:168):innerWidth-160)+'px',top:(edge==='center'?460:innerHeight-50)+'px'});
     const r=faceOldAnchor.getBoundingClientRect();window.faceAnchorRect={left:r.left,top:r.top,bottom:r.bottom};
     const own={...timelineSubject.timeline.segments[0]};delete own.face;
     return{data:JSON.stringify(timelineSubject.timeline),peers:JSON.stringify(timelineSubject.timeline.segments.slice(1)),own:JSON.stringify(own)};
    },edge);
    await button().click();const initial=await assertPlaced();assert.equal(await page.evaluate(()=>JSON.stringify(timelineSubject.timeline)),original.data);
    if(width>=640&&edge==='center')assert.ok(initial.x>8&&initial.y>8,'Centered live anchor is not top-left');
    await pop().locator('.mmc-opt').nth(1).click();const enabled=await assertPlaced();assert.equal(enabled.oldAnchorConnected,false,'Commit really replaces the original pill');
    for(let i=0;i<2;i++){await pop().locator('.mmc-refine-row').nth(0).locator('.mmc-step').last().click();await assertPlaced();}
    for(let i=0;i<2;i++){await pop().locator('.mmc-refine-row').nth(1).locator('.mmc-step').last().click();await assertPlaced();}
    await pop().locator('.mmc-opt').first().click();const disabled=await assertPlaced();assert.equal(disabled.oldAnchorConnected,false);
    await pop().locator('.mmc-opt').nth(1).click();const final=await assertPlaced();
    const after=await page.evaluate(()=>{const own={...timelineSubject.timeline.segments[0]};delete own.face;return{face:timelineSubject.timeline.segments[0].face,
     peers:JSON.stringify(timelineSubject.timeline.segments.slice(1)),own:JSON.stringify(own),commits:timelineSubject.commits};});
    assert.deepEqual(after.face,{on:true,canvas:576,denoise:.55});assert.equal(after.peers,original.peers);assert.equal(after.own,original.own);assert.equal(after.commits,7);
    positions.push({width,language,scale,edge,initial,enabled,disabled,final});
    if(width===640&&language==='ko'&&scale===1.6)await page.screenshot({path:path.join(output,'face-position-'+edge+'-ko-large.png'),fullPage:false});
    await page.keyboard.press('Escape');await pop().waitFor({state:'detached'});await settle();
    assert.equal(await page.evaluate(()=>faceObserverStats.active.size),0,'Native observer disconnects after pop removal');
   }
   assert.equal(await page.evaluate(()=>faceObserverStats.created),positions.length);assert.equal(await page.evaluate(()=>faceObserverStats.disconnected),positions.length);
  });
  assert.equal(fixture.errors.length,0,JSON.stringify(fixture.errors));assert.equal(fixture.getRequests(),0);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,layouts,positions,requests:fixture.getRequests(),errors:fixture.errors},null,2));
  console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,positions:positions.length,requests:0,errors:0}));
 }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
