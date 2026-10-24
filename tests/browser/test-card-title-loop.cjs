// Actual card/strip/name DOM in isolated Chrome; only overflowing view titles
// animate. No live ComfyUI, workflow/profile/media changes or network requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(process.env.CONTINUITY_SOURCE_ROOT||path.join(__dirname,'../..')),root=path.join(repo,'web/creator');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const shared=path.join(repo,'tests/browser/test-card-individual-preview.cjs'),legacy=fs.readFileSync(shared,'utf8'),boundary=legacy.indexOf('\n(async()=>{');
assert.ok(boundary>0);
const fixture=vm.runInNewContext(legacy.slice(0,boundary)+'\n;({setupPage,errors,getRequests:()=>requests});',{require,process,__dirname:path.dirname(shared)},{filename:shared});
const styles=read('styles.js'),imports=Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(m=>[m[1],m[2]]));
const order=styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(s=>s.trim()).filter(Boolean);
const css=order.map(owner=>read('styles/'+imports[owner]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const longName='직접 입력한 긴 세그먼트 제목 '.repeat(6).slice(0,80),longFile='【광둥】매우 긴 파일 제목과 촬영 날짜 및 장소 '.repeat(10)+'.mp4';
const blob={version:2,face_schema:1,extended_ui:{card_names:{long:longName,short:'A'}},segments:[
 {card_id:'long',prompt:'Unchanged prompt 1',duration_s:14.38},
 {card_id:'short',prompt:'Unchanged prompt 2',duration_s:14.38},
 {card_id:'default',prompt:'Unchanged prompt 3',duration_s:14.38},
 {card_id:'long-clip',kind:'clip',filename:longFile,duration_s:218.6,width:1280,height:720,has_audio:false},
 {card_id:'short-clip',kind:'clip',filename:'A.mp4',duration_s:218.6,width:1280,height:720,has_audio:false},
]};
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
(async()=>{
 const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-card-title-loop'));
 fs.mkdirSync(output,{recursive:true});const checks=[],layouts=[];let browser;
 const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await fixture.setupPage(context);
  await page.addStyleTag({content:css});
  await page.evaluate(()=>{
   const NativeObserver=window.ResizeObserver;
   window.titleObservers={created:0,disconnected:0,active:new Set()};
   window.ResizeObserver=class extends NativeObserver{
    observe(node,options){if(node.matches?.('.mmc-tl-title-loop')&&!this.ownsTitles){this.ownsTitles=true;titleObservers.created++;titleObservers.active.add(this);}return super.observe(node,options);}
    disconnect(){if(this.ownsTitles&&titleObservers.active.delete(this))titleObservers.disconnected++;return super.disconnect();}
   };
  });
  const mount=async(options={})=>{await page.evaluate(options=>{mountTimelineFixture(options);if(options.preview){timelineSubject.previewMode=true;timelineSubject.render();}}, {blob:JSON.stringify(blob),...options});await settle(page);};
  const name=index=>page.locator(`[data-mmc-segment-index="${index}"] .mmc-tl-card-name-button`);
  await check('Only overflowing manually entered card names and Clip filenames loop; short/default titles stay still',async()=>{
   for(const language of ['en','ko','ja','zh'])for(const scale of [1,1.6])for(const preview of [false,true]){
    await mount({language,scale,preview});
    const metrics=await page.evaluate(()=>{
     const before=JSON.stringify(timelineSubject.timeline),cards=[...document.querySelectorAll('.mmc-tl-card')];
     return {data:before,rows:cards.map(card=>{const title=card.querySelector('.mmc-tl-card-name-button'),file=card.querySelector('.mmc-tl-clip-name');
      const get=node=>{if(!node)return null;const r=node.getBoundingClientRect(),track=node.querySelector('.mmc-tl-title-track');return{text:node.textContent,loop:node.classList.contains('scrolling'),label:node.getAttribute('aria-label'),width:r.width,height:r.height,
       trackWidth:track?.getBoundingClientRect().width??0,animation:track?getComputedStyle(track).animationName:'none',hidden:track?.getAttribute('aria-hidden')??null};};
      const r=card.getBoundingClientRect();return{width:r.width,height:r.height,title:get(title),file:get(file)};})};
    });
    assert.equal(metrics.rows[0].title.text,longName);assert.equal(metrics.rows[0].title.loop,true);assert.equal(metrics.rows[0].title.animation,'mmc-title-loop');
    assert.equal(metrics.rows[0].title.hidden,'true');assert.ok(metrics.rows[0].title.label.includes(longName));
    assert.equal(metrics.rows[1].title.text,'A');assert.equal(metrics.rows[1].title.loop,false);assert.equal(metrics.rows[1].title.animation,'none');
    assert.equal(metrics.rows[2].title.loop,false);assert.equal(metrics.rows[2].title.animation,'none');
    assert.equal(metrics.rows[3].file.text,longFile);assert.equal(metrics.rows[3].file.loop,true);assert.equal(metrics.rows[3].file.label,longFile);
    assert.equal(metrics.rows[4].file.loop,false);assert.equal(metrics.rows[4].file.animation,'none');
    assert.ok(Math.abs(metrics.rows[3].width-metrics.rows[4].width)<1,'Filename length never sizes its card');
    assert.equal(await page.evaluate(()=>JSON.stringify(timelineSubject.timeline)),metrics.data,'Fitting titles is read-only');
    layouts.push({language,scale,preview,...metrics});
   }
  });
  await check('Loop uses one exact original text plus an inaccessible CSS copy, a 48px gap and seamless end-to-start positions',async()=>{
   await mount({language:'ko'});
   const m=await page.evaluate(()=>{const title=document.querySelector('[data-mmc-segment-index="0"] .mmc-tl-card-name-button'),track=title.firstElementChild,animation=track.getAnimations()[0],width=track.getBoundingClientRect().width;
    const duration=animation.effect.getTiming().duration,delay=animation.effect.getTiming().delay;animation.pause();animation.currentTime=delay+duration*.5;const halfway=new DOMMatrix(getComputedStyle(track).transform).m41;
    animation.currentTime=delay+duration*(1-1e-7);const end=new DOMMatrix(getComputedStyle(track).transform).m41;
    animation.currentTime=delay;const start=new DOMMatrix(getComputedStyle(track).transform).m41;
    return{width,duration,halfway,end,start,distance:parseFloat(title.style.getPropertyValue('--mmc-title-distance')),gap:getComputedStyle(track,'::after').left,
     content:getComputedStyle(track,'::after').content,original:track.textContent,children:track.children.length};});
   assert.ok(Math.abs(m.distance-m.width-48)<.1);assert.ok(Math.abs(parseFloat(m.gap)-m.distance)<.1);assert.equal(m.children,0);assert.equal(m.original,longName);
   assert.ok(m.content.includes('직접 입력한'));assert.equal(m.start,0);assert.ok(Math.abs(m.halfway+m.distance/2)<1);assert.ok(Math.abs(m.end+m.distance)<1);assert.ok(m.duration>=10000);
  });
  await check('Resize remeasures overflow and typography without restarting generation or changing card data',async()=>{
   const before=await page.evaluate(()=>JSON.stringify(timelineSubject.timeline));
   await page.evaluate(()=>{window.longTitle=document.querySelector('[data-mmc-segment-index="0"] .mmc-tl-card-name-button');longTitle.parentElement.style.flex='0 0 3000px';});await settle(page);
   assert.equal(await name(0).evaluate(n=>n.classList.contains('scrolling')),false);
   await page.evaluate(()=>longTitle.parentElement.style.removeProperty('flex'));await settle(page);
   assert.equal(await name(0).evaluate(n=>n.classList.contains('scrolling')),true);
   assert.equal(await page.evaluate(()=>JSON.stringify(timelineSubject.timeline)),before);assert.equal(await page.evaluate(()=>timelineSubject.commits),0);
  });
  await check('Rename pauses by replacing the loop; Escape restores and Enter retains the existing one-card save behavior',async()=>{
   await name(0).click();const input=page.locator('[data-mmc-segment-index="0"] .mmc-tl-card-name-input');
   assert.equal(await input.inputValue(),longName);assert.equal(await input.locator('.mmc-tl-title-track').count(),0);
   await input.fill('Temporary');await input.press('Escape');await settle(page);assert.equal(await name(0).textContent(),longName);assert.equal(await page.evaluate(()=>timelineSubject.commits),0);
   const peers=await page.evaluate(()=>JSON.stringify(timelineSubject.timeline.segments.slice(1)));
   await name(0).click();await input.fill('New short name');await input.press('Enter');await settle(page);
   assert.equal(await name(0).textContent(),'New short name');assert.equal(await name(0).evaluate(n=>n.classList.contains('scrolling')),false);
   assert.equal(await page.evaluate(()=>timelineSubject.commits),1);assert.equal(await page.evaluate(()=>timelineSubject.timeline.segments[0].prompt),'Unchanged prompt 1');
   assert.equal(await page.evaluate(()=>JSON.stringify(timelineSubject.timeline.segments.slice(1))),peers);
  });
  await check('Reduced motion leaves a static one-line ellipsis and no visible copy',async()=>{
   await mount({language:'ko'});await page.emulateMedia({reducedMotion:'reduce'});await settle(page);
   const result=await name(0).evaluate(n=>({overflow:getComputedStyle(n).textOverflow,animation:getComputedStyle(n.firstElementChild).animationName,copy:getComputedStyle(n.firstElementChild,'::after').content}));
   assert.deepEqual(result,{overflow:'ellipsis',animation:'none',copy:'none'});await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('One native title observer per strip render disconnects on rerender and close',async()=>{
   await page.evaluate(()=>timelineSubject.render());await settle(page);assert.equal(await page.evaluate(()=>titleObservers.active.size),1);
   await page.evaluate(()=>timelineSubject.close());await settle(page);
   assert.equal(await page.evaluate(()=>titleObservers.active.size),0);assert.equal(await page.evaluate(()=>titleObservers.created),await page.evaluate(()=>titleObservers.disconnected));
  });
  await mount({language:'ko'});await page.screenshot({path:path.join(output,'looping-titles-ko.png'),fullPage:false});
  await page.evaluate(()=>timelineSubject.close());assert.equal(fixture.errors.length,0,JSON.stringify(fixture.errors));assert.equal(fixture.getRequests(),0);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,layouts,requests:fixture.getRequests(),errors:fixture.errors},null,2));
  console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,requests:0,errors:0}));
 }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
