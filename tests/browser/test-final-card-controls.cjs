// Real card/delete/hold and sound button render methods in an isolated browser.
// Geometry/API adapters only; no ComfyUI, media requests, queue or GPU work.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT,'web/creator'):path.resolve(__dirname,'../../web/creator');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('timeline.js'),sound=read('soundlane.js');
const method=(text,name)=>{const found=text.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`,'m'));assert.ok(found,`Production ${name}`);return found[0];};
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR,'web/creator'):path.resolve(__dirname,'../../../baseline/web/creator');
if(fs.existsSync(path.join(baseline,'timeline.js'))){
 const original=fs.readFileSync(path.join(baseline,'timeline.js'),'utf8');
 for(const name of ['holdSwitch','disarm','remove','takeChip','takeTools'])assert.equal(method(source,name),method(original,name),`${name} remains exact`);
 const clipBehavior=text=>{
  let body=method(text,'renderClipCard');
  const fixedWidth='      style: { width: `${cardWidth()}px` },';
  if(body.includes(fixedWidth)){
   assert.equal(body.split(fixedWidth).length-1,1,'exact approved clip width presentation');
   body=body.replace(fixedWidth,'      style: { width: `${cardWidth(seconds)}px` },');
  }
  if(!body.includes('this.cardNameControl(segment, index)'))return body;
  const duration=body.match(/^        el\("span", \{\r?\n          class: "mmc-tl-dur",[^]*?^        \}\),\r?\n/m);
  assert.ok(duration,'original clip duration element');
  const newline=body.includes('\r\n')?'\r\n':'\n';
  body=body.replace('      this.cardPreview(segment, index),'+newline,'');
  const row='      el("div", { class: "mmc-tl-card-refs" }, ['+newline+duration[0]+'      ]),'+newline;
  assert.ok(body.includes(row),'duration-only clip metadata row');
  return body.replace(row,'').replace('        this.cardNameControl(segment, index),'+newline,duration[0]);
 };
 assert.equal(clipBehavior(source),clipBehavior(original),'clip behavior remains exact outside view label/duration placement and fixed card width');
 const originalSound=fs.readFileSync(path.join(baseline,'soundlane.js'),'utf8');
 // EXT70/71 changes only disclosure/view/lifecycle. Keep every original audio
 // edit, data/math/import and block-control callback byte-exact, not its header.
 for(const name of ['rules','seconds','commit','total','pct','frameAt','perPixel','snapPoints','snap','snapping','snapMove','syncSnaps','blocks','settle','at','store','slide','trim','matchedCard','rematch','remove','openBlock','lay','lengthOf','paint','paintGaps','showRead','snapLabels','showSnap','arrows','renderReel','renderRead','showShot','renderBlock','grip','magnet','dropper','renderGap','renderPinned','paintWaves'])
  assert.equal(method(sound,name),method(originalSound,name),'Original sound callback/math '+name);
 const originalDrag=text=>method(text,'drag')
  .replace(/^        this\.cancelDrag = null;\r?\n/m,'')
  .replace(/^        if \(node\.hasPointerCapture\(event\.pointerId\)\) node\.releasePointerCapture\(event\.pointerId\);\r?\n/m,'')
  .replace('if (dirty && !this.destroyed) this.render();','if (dirty) this.render();')
  .replace(/^      this\.cancelDrag = \(\) => up\(\{ type: "pointercancel", pointerId: event\.pointerId \}\);\r?\n/m,'');
 assert.equal(originalDrag(sound),originalDrag(originalSound),'Original audio drag except teardown ownership');
 assert.equal(method(sound,'add').replace(' selectionPurpose: "soundlane-files",',''),method(originalSound,'add').replace(' selectionPurpose: "soundlane-files",',''),'Explicit picker purpose only');
 assert.equal(read('sound.js'),fs.readFileSync(path.join(baseline,'sound.js'),'utf8'),'Sound arithmetic unchanged');
}
// Reuse the existing real renderCard/take/seed/CSS fixture rather than copy its
// source extraction. Stop before its browser runner and replace only adapters.
const baseFile=path.join(__dirname,'test-segment-card-pills.cjs');
const fixtureSource=fs.readFileSync(baseFile,'utf8');
const base=vm.runInNewContext(fixtureSource.slice(0,fixtureSource.indexOf('new vm.Script(code);'))+';({code,css});',{require,__dirname,process});
let code=base.code;
for(const [name,pattern] of [['holdSwitch',/^ holdSwitch\(\)\{[^\r\n]*\}/m],['removeButton',/^ removeButton\(i\)\{[^\r\n]*\}/m],['disarm',/^ disarm\(i\)\{this.calls.push\(\['disarm',i\]\);\}/m]]){
 assert.match(code,pattern,`Fixture adapter ${name}`);code=code.replace(pattern,method(source,name));
}
code=code.replace('class Subject {','class Subject {\n'+method(source,'remove')+'\n renderStrip(){this.mount();}\n');
code+=`
Object.assign(S,{rescueCastFiles:(piece,segment)=>subject.calls.push(['rescue',segment.prompt]),remapContinueFrom:()=>{}});
window.deletedSnapshot=()=>subject.timeline.segments.map(segment=>segment.prompt);
const formatTime=value=>String(value);
class FixtureSound{
 ${['renderBlock','magnet','dropper','snapping'].map(name=>method(sound,name)).join('\n')}
 constructor(width){this.piece={sound:[{filename:'first.wav',at_s:0},{filename:'second.wav',at_s:4}]};this.snaps=new Set();this.waves=new Map();this.nodes=new Map();this.width=width;this.dragStarts=0;this.opened=[];this.deleted=[];this.keyRoutes=0;}
 pct(frames){return(frames/this.width*100)+'%';}seconds(frames){return frames/24;}
 grip(block,edge){return el('button',{class:'mmc-snd-grip '+edge});}
 drag(node){node.addEventListener('pointerdown',()=>this.dragStarts++);}
 arrows(node){node.addEventListener('keydown',()=>this.keyRoutes++);}
 openBlock(index){this.opened.push(index);}remove(index){this.deleted.push(index);this.nodes.get(index)?.remove();}
}
window.makeSound=({clipWidth=120,laneWidth=800,scale=1}={})=>{
 document.querySelector('#sound-fixture')?.remove();document.documentElement.style.setProperty('--mmc-type',String(scale));
 window.soundFixture=new FixtureSound(laneWidth);
 const host=el('div',{id:'sound-fixture',class:'mmc-snd-lane',style:{width:laneWidth+'px',marginTop:'20px'}});
 const block=(index,at,frames)=>({index,at,frames,in_s:0,out_s:frames/24,filename:index?'second.wav':'first.wav'});
 host.append(soundFixture.renderBlock(block(0,0,clipWidth)),soundFixture.renderBlock(block(1,Math.max(clipWidth+30,laneWidth-130),120)));
 document.body.append(host);return JSON.stringify(soundFixture.piece);
};
`;
new vm.Script(code,{filename:'final-card-controls-real-source-fixture.js'});
const results=[];let browser,requests=0;
const check=async(name,run)=>{await run();results.push(name);console.log('PASS '+name);};
const out=process.env.CONTINUITY_UX_SCREENSHOT_DIR||process.env.CONTINUITY_ARTIFACT_DIR;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1000,height:750}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent(`<style>${base.css}:root{--comfy-menu-bg:#171718;--fg-color:#fff;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:24px;background:#171718}.fixture-host{width:max-content;height:auto;padding:0}</style>`);
 await page.evaluate(`(()=>{${code}})()`);
 const reset=async options=>page.evaluate(options=>setFixture(options),options);
 const arm=async()=>page.locator('.mmc-tl-card-transport > .mmc-asset-x').click();
 await check('Number is a yellow nonfocusable span without button/solo semantics or actions',async()=>{
  for(const options of [{},{shared:true},{take:false},{clip:true}]){
   await reset(options);const before=await page.evaluate(()=>JSON.stringify(subject.timeline));
   const badge=page.locator('.mmc-tl-index');const rest=await badge.evaluate(node=>{
    const probe=document.createElement('span');probe.style.background='var(--mmc-accent)';node.parentNode.append(probe);const accent=getComputedStyle(probe).backgroundColor;probe.remove();
    return{tag:node.tagName,role:node.getAttribute('role'),tab:node.getAttribute('tabindex'),title:node.title,color:getComputedStyle(node).backgroundColor,accent,cursor:getComputedStyle(node).cursor,text:node.textContent};
   });
   assert.deepEqual([rest.tag,rest.role,rest.tab,rest.title,rest.cursor,rest.text],['SPAN',null,null,'','default','2']);assert.equal(rest.color,rest.accent);
   await badge.hover();assert.equal(await badge.evaluate(node=>getComputedStyle(node).backgroundColor),rest.color);
   await badge.click();await badge.dblclick();await badge.evaluate(node=>{node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));node.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));});
   assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.evaluate(()=>subject.commits),0);
  }
 });
 await check('Right hold control toggles only its current generated card, restoring the exact state',async()=>{
  await reset();const before=await page.evaluate(()=>JSON.stringify(subject.timeline));
  await page.locator('.mmc-tl-hold').click();assert.deepEqual(await page.evaluate(()=>subject.timeline.segments.map(segment=>!!segment.hold)),[false,false,false]);
  await page.locator('.mmc-tl-hold').click();assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(subject.timeline))),JSON.parse(before));assert.equal(await page.evaluate(()=>subject.commits),2);
 });
 await check('First X press arms without deleting; only move/clone hides while Edit/Trim/Crop and other controls stay',async()=>{
  await reset({face:true});const before=await page.evaluate(()=>JSON.stringify(subject.timeline));await arm();
  assert.equal(await page.evaluate(()=>JSON.stringify(subject.timeline)),before);assert.equal(await page.evaluate(()=>subject.armed),1);
  const got=await page.evaluate(()=>({hidden:[...document.querySelectorAll('.mmc-tl-card-transport > .mmc-ghost')].map(node=>getComputedStyle(node).display),
   edit:[...document.querySelector('.mmc-tl-card-edit-tools').children].map(node=>({text:node.textContent,visible:!!node.getClientRects().length})),
   kept:['.mmc-tl-hold','.mmc-tl-card-face','.mmc-tl-card-motion','.mmc-tl-card-seed'].every(selector=>!!document.querySelector(selector).getClientRects().length)}));
  assert.deepEqual(got.hidden,['none','none','none']);assert.deepEqual(got.edit.map(value=>value.text),['Trim','Crop','Edit']);assert.ok(got.edit.every(value=>value.visible)&&got.kept);
 });
 await check('Pointer-leave dismissal restores all original move/clone controls and normal X',async()=>{
  await page.locator('.mmc-tl-card').dispatchEvent('pointerleave');
  assert.equal(await page.evaluate(()=>subject.armed),null);assert.equal(await page.locator('.mmc-asset-x.armed').count(),0);
  assert.deepEqual(await page.evaluate(()=>[...document.querySelector('.mmc-tl-card-transport').children].map(node=>({text:node.textContent,visible:!!node.getClientRects().length}))),[{text:'◀',visible:true},{text:'▶',visible:true},{text:'⧉',visible:true},{text:'✕',visible:true}]);
 });
 await check('Confirmation full rectangle, including four inset corners, removes only target without editor/drag bubbling',async()=>{
  for(const location of ['top-left','top-right','bottom-left','bottom-right','center']){
   await reset();const original=await page.evaluate(()=>deletedSnapshot());await arm();
   await page.evaluate(()=>{window.bubbles={pointer:0,click:0,double:0};const card=document.querySelector('.mmc-tl-card');card.addEventListener('pointerdown',()=>bubbles.pointer++);card.addEventListener('click',()=>bubbles.click++);card.addEventListener('dblclick',()=>bubbles.double++);});
   const button=page.locator('.mmc-asset-x.armed');const size=await button.boundingBox();
   const x=location.includes('right')?size.width-3:location.includes('left')?3:size.width/2;
   const y=location.includes('bottom')?size.height-3:location.includes('top')?3:size.height/2;
   await button.click({position:{x,y}});
   assert.deepEqual(await page.evaluate(()=>deletedSnapshot()),[original[0],original[2]]);
   assert.deepEqual(await page.evaluate(()=>bubbles),{pointer:0,click:0,double:0});
   assert.equal(await page.evaluate(()=>subject.calls.filter(call=>call[0]==='edit').length),0);assert.equal(await page.evaluate(()=>subject.commits),1);
  }
 });
 await check('Native keyboard confirmation remains two-step and deletes only on second activation',async()=>{
  await reset();await page.locator('.mmc-tl-card-transport > .mmc-asset-x').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>subject.timeline.segments.length),3);
  await page.locator('.mmc-asset-x.armed').focus();await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>subject.timeline.segments.length),2);
 });
 await check('Confirmation keeps whole horizontal Edit labels and bounded clickable rectangle in EN/KO at all sizes',async()=>{
  for(const language of ['en','ko'])for(const scale of [.8,1,1.6])for(const take of [true,false]){
   await reset({language,scale,duration:1,take});await arm();
   const result=await page.evaluate(()=>{
    const card=document.querySelector('.mmc-tl-card').getBoundingClientRect(),confirmation=document.querySelector('.mmc-asset-x.armed'),rect=confirmation.getBoundingClientRect(),style=getComputedStyle(confirmation);
    return{left:rect.left,right:rect.right,bottom:rect.bottom,card:{left:card.left,right:card.right,bottom:card.bottom},height:rect.height,font:parseFloat(style.fontSize),
     buttons:[...document.querySelector('.mmc-tl-card-edit-tools').children].map(node=>({height:node.getBoundingClientRect().height,scroll:node.scrollWidth,width:node.clientWidth,whiteSpace:getComputedStyle(node).whiteSpace})),
     hit:document.elementFromPoint(rect.left+3,rect.top+3)===confirmation&&document.elementFromPoint(rect.right-3,rect.bottom-3)===confirmation};
   });
   assert.ok(result.left>=result.card.left+12&&result.right<=result.card.right-12&&result.bottom<=result.card.bottom-12,JSON.stringify(result));
   assert.ok(result.height>=26*scale-.02&&result.hit,JSON.stringify(result));assert.ok(Math.abs(result.font-11*scale)<.01);
   for(const button of result.buttons){assert.equal(button.whiteSpace,'normal');assert.ok(button.scroll<=button.width+1);}
  }
 });
 await check('Sound magnet is immediately left of X with clear gap and equal lower edge in normal/narrow clips',async()=>{
  for(const clipWidth of [40,58,72,120,480])for(const scale of [.8,1,1.6]){
   await page.evaluate(options=>makeSound(options),{clipWidth,scale});
   const got=await page.locator('#sound-fixture .mmc-snd-block').first().evaluate(node=>{
    const block=node.getBoundingClientRect(),magnet=node.querySelector('.mmc-snd-magnet').getBoundingClientRect(),drop=node.querySelector('.mmc-snd-drop').getBoundingClientRect(),label=node.querySelector('.mmc-snd-label').getBoundingClientRect();
    return{block:{left:block.left,right:block.right,bottom:block.bottom},magnet:{left:magnet.left,right:magnet.right,bottom:magnet.bottom,top:magnet.top},drop:{left:drop.left,right:drop.right,bottom:drop.bottom,top:drop.top},labelBottom:label.bottom};
   });
   assert.ok(got.drop.left-got.magnet.right>=2.9,JSON.stringify(got));assert.ok(Math.abs(got.drop.bottom-got.magnet.bottom)<.1);
   assert.ok(got.magnet.left>=got.block.left+1&&got.drop.right<=got.block.right-1,JSON.stringify(got));assert.ok(got.magnet.top>got.labelBottom,JSON.stringify(got));
  }
 });
 await check('Ultra-narrow sound clip preserves safe inside vertical exception instead of expanding duration geometry',async()=>{
  for(const scale of [.8,1,1.6]){
   await page.evaluate(scale=>makeSound({clipWidth:30,scale}),scale);const got=await page.locator('#sound-fixture .mmc-snd-block').first().evaluate(node=>{
    const block=node.getBoundingClientRect(),m=node.querySelector('.mmc-snd-magnet').getBoundingClientRect(),x=node.querySelector('.mmc-snd-drop').getBoundingClientRect();return{width:block.width,left:block.left,right:block.right,top:block.top,bottom:block.bottom,m:{left:m.left,right:m.right,top:m.top,bottom:m.bottom},x:{left:x.left,right:x.right,top:x.top,bottom:x.bottom}};
   });
   assert.equal(got.width,30);assert.ok(got.m.bottom<got.x.top&&got.m.left>=got.left&&got.x.right<=got.right&&got.m.top>=got.top+1&&got.x.bottom<=got.bottom-1,JSON.stringify(got));
  }
 });
 await check('Per-clip magnet toggle is independent, does not open/delete/drag, and preserves audio timing data',async()=>{
  const before=await page.evaluate(()=>makeSound({clipWidth:120}));const first=page.locator('#sound-fixture .mmc-snd-magnet').first();await first.click();
  assert.deepEqual(await page.locator('#sound-fixture .mmc-snd-magnet').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),['true','false']);
  await first.focus();await page.keyboard.press('Space');
  assert.deepEqual(await page.locator('#sound-fixture .mmc-snd-magnet').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),['false','false']);
  assert.deepEqual(await page.evaluate(()=>[soundFixture.dragStarts,soundFixture.keyRoutes,soundFixture.opened,soundFixture.deleted,JSON.stringify(soundFixture.piece)]),[0,0,[],[],before]);
  await page.locator('#sound-fixture .mmc-snd-drop').nth(1).click();assert.deepEqual(await page.evaluate(()=>soundFixture.deleted),[1]);assert.equal(await page.locator('#sound-fixture .mmc-snd-block').count(),1);
 });
 await check('Sound hover/focus visibility, selected state and dragging suppression remain intact',async()=>{
  await page.evaluate(()=>makeSound());const node=page.locator('#sound-fixture .mmc-snd-block').first();await node.hover();await page.waitForTimeout(150);
  assert.deepEqual(await node.evaluate(block=>[...block.querySelectorAll('.mmc-snd-magnet,.mmc-snd-drop')].map(button=>getComputedStyle(button).opacity)),['1','1']);
  await node.evaluate(block=>block.classList.add('dragging'));
  assert.deepEqual(await node.evaluate(block=>[...block.querySelectorAll('.mmc-snd-magnet,.mmc-snd-drop')].map(button=>getComputedStyle(button).pointerEvents)),['none','none']);
 });
 if(out){fs.mkdirSync(out,{recursive:true});
  await reset({language:'ko',scale:1.6,duration:1,face:true});await arm();await page.locator('.fixture-host').screenshot({path:path.join(out,'final-card-delete-ko-large.png')});
  await reset({language:'ko'});await page.locator('.fixture-host').screenshot({path:path.join(out,'final-card-number-yellow.png')});
  await page.setViewportSize({width:320,height:700});await page.evaluate(()=>{document.body.replaceChildren();makeSound({clipWidth:40,laneWidth:260,scale:1.6});});await page.locator('#sound-fixture .mmc-snd-block').first().hover();await page.locator('#sound-fixture').screenshot({path:path.join(out,'final-sound-magnet-narrow.png')});
 }
 assert.deepEqual(errors,[]);assert.equal(requests,0);console.log(JSON.stringify({suite:'final-card-controls',passed:results.length,networkRequests:requests,scope:'real frontend methods/CSS; fixed render adapters; no ComfyUI/GPU or timing algorithm changes'}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
