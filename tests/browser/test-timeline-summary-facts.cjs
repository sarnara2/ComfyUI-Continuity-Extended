// Real summary and card facts, real duration/frame helpers and ordered CSS.
// All content lives in RAM; no live server, media, model or generation calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=require('./test-face-card-ownership.cjs'),{fixture,source,read,method,setupSubject}=base;
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const baseline=process.env.CONTINUITY_BASELINE_DIR?path.resolve(process.env.CONTINUITY_BASELINE_DIR):path.resolve(repo,'../baseline');
if(fs.existsSync(path.join(baseline,'web/creator/state.js'))){
 const old=fs.readFileSync(path.join(baseline,'web/creator/state.js'),'utf8'),current=read('state.js');
 for(const name of ['timelineFrames','timelineSeconds','sampledSeconds','passes']){
  const pattern=new RegExp('export function '+name+'\\([^]*?^\\}','m');assert.equal(current.match(pattern)[0],old.match(pattern)[0],'Original arithmetic '+name);
 }
 assert.equal(method('renderClipCard').replace('style: { width: `${cardWidth()}px` },','style: { width: `${cardWidth(seconds)}px` },'),method('renderClipCard',fs.readFileSync(path.join(baseline,'web/creator/timeline.js'),'utf8')),'Supplied Clip presentation unchanged except its exact duration-free width style');
}
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-timeline-summary-facts'));
const checks=[],layouts=[];let browser;
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await setupSubject(context);
 const blob={version:2,face_schema:1,segments:[
  {card_id:'one',prompt:'First',duration_s:14.38,assets:[{handle:'ref-1',role:'reference',kind:'image',filename:'a.png'},{handle:'ref-2',role:'reference',kind:'image',filename:'b.png'},{handle:'ref-3',role:'reference',kind:'video',filename:'c.mp4'}]},
  {card_id:'two',prompt:'Second',duration_s:100,hold:true,take:{filename:'saved.mp4 [output]',duration_s:100}},
  {card_id:'clip',kind:'clip',filename:'clip.mp4',duration_s:120},
 ]};
 const mount=async(options={})=>page.evaluate(options=>mountFaceSummary(options),{blob:JSON.stringify(blob),...options});
 const facts=()=>page.evaluate(()=>{const piece=timelineSubject.timeline,rules=C.rulesFor(S.pieceFamily(piece));return{seconds:S.timelineSeconds(piece),frames:S.timelineFrames(piece),sampled:S.sampledSeconds(piece),fps:rules.fps,count:piece.segments.length,groups:[...document.querySelectorAll('.mmc-tl-summary-pill')].map(n=>n.textContent),facts:[...document.querySelector('[data-mmc-segment-index="0"] .mmc-tl-card-refs').children].map(n=>n.textContent),snapshot:S.serializeTimeline(piece)};});
 await check('Exactly Full/New/Cards read-only groups, with whole-video frame facts inside Full and bold total seconds',async()=>{
  const before=await mount({language:'ko'}),value=await facts();assert.equal(value.groups.length,3);assert.match(value.groups[0],/^전체 영상/);assert.match(value.groups[1],/^새로 만들 영상/);assert.equal(value.groups[2],'카드 3개');
  assert.ok(value.groups[0].includes(value.frames.toLocaleString('en-US')));assert.ok(value.groups[0].includes(value.fps+'fps'));assert.equal(await page.locator('.mmc-tl-summary-full b').count(),1);assert.equal(await page.locator('.mmc-tl-summary-pill button,.mmc-tl-summary-pill input').count(),0);
  assert.equal(await page.locator('.mmc-tl-summary-row .mmc-note').count(),0);assert.equal(await page.evaluate(()=>JSON.stringify(timelineSubject.timeline)),before);
 });
 await check('New video remains all current generated targets, not last card or supplied/held footage',async()=>{
  const before=await facts();assert.ok(before.groups[1].includes(before.sampled.toFixed(1)));
  await page.evaluate(()=>{delete timelineSubject.timeline.segments[1].hold;timelineSubject.renderBar();});const unlocked=await facts();assert.ok(unlocked.sampled>before.sampled);assert.ok(unlocked.groups[1].includes(unlocked.sampled.toFixed(1)));assert.equal(unlocked.frames,before.frames);
 });
 await check('Each card owns only its refs/fps/frame/seconds facts; whole timeline frames never bleed into a card',async()=>{
  await mount();const value=await facts();assert.equal(value.facts[0],'3 refs');const expected=await page.evaluate(()=>{const s=timelineSubject.timeline.segments[0],r=C.rulesFor(S.pieceFamily(timelineSubject.timeline));return{frames:C.framesForSeconds(s.duration_s,r),fps:r.fps,seconds:S.showSeconds(s.duration_s)};});
  assert.equal(value.facts[1],expected.fps+' fps · '+expected.frames.toLocaleString('en-US')+' frames');assert.equal(value.facts[2],expected.seconds+' s');assert.notEqual(expected.frames,value.frames);
  assert.equal(await page.locator('[data-mmc-segment-index="2"] .mmc-tl-card-frame-fact').count(),0);
 });
 await check('Family changes recompute actual fps/frame counts, while shared/auto cards explicitly mark estimates',async()=>{
  for(const family of ['h3','ltx25']){
   await mount({blob:JSON.stringify({...blob,family})});const value=await facts();assert.ok(value.groups[0].includes(value.fps+' fps'));assert.ok(value.facts[1].includes(value.fps+' fps'));
  }
  await mount({blob:JSON.stringify({...blob,segments:[blob.segments[0],{...blob.segments[1],merge:true}]})});assert.match((await facts()).facts[1],/^~/);assert.ok(await page.locator('.mmc-tl-card-frame-fact').first().getAttribute('title'));
  await mount({blob:JSON.stringify({...blob,family:'ltx25',segments:[{...blob.segments[0],auto_duration:true}]})});const estimated=await facts();assert.ok(estimated.groups[0].includes('~'));assert.match(estimated.facts[1],/^~/);
 });
 await check('Human time rounds once at tenths, carries 59.99 correctly and preserves fractional total seconds',async()=>{
  const block=method('renderBar').match(/    const totalTenths =[^]*?(?=    this\.renderNavigation\(\);)/)[0];
  const value=await page.evaluate(block=>{const run=new Function('seconds','t',block+'return {totalSeconds,minutes,remainder,humanTime};');return[59.99,60,234.8,234,0].map(s=>run(s,I.t));},block);
  assert.deepEqual(value.map(v=>[v.totalSeconds,v.minutes,v.remainder]),[[60,1,0],[60,1,0],[234.8,3,54.8],[234,3,54],[0,0,0]]);
 });
 await check('Only between-group dividers appear, disappear at row starts, and fit EN/KO/JA/ZH at 320–1600 and .8–1.6 type',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await page.setViewportSize({width,height:1000});await mount({language,scale});await page.waitForTimeout(20);
   const value=await page.evaluate(()=>{const total=document.querySelector('.mmc-tl-total'),groups=[...total.children],card=document.querySelector('[data-mmc-segment-index="0"]'),row=card.querySelector('.mmc-tl-card-refs'),frame=row.querySelector('.mmc-tl-card-frame-fact');return{overflow:document.documentElement.scrollWidth>innerWidth+1,total:total.scrollWidth<=total.clientWidth+1,groups:groups.map((node,i)=>({start:i===0||node.offsetTop!==groups[i-1].offsetTop,hidden:node.classList.contains('row-start'),pointer:getComputedStyle(node,'::before').pointerEvents,content:getComputedStyle(node,'::before').content})),card:card.scrollWidth<=card.clientWidth+1,facts:row.scrollWidth<=row.clientWidth+1,frameLines:frame.getBoundingClientRect().height/parseFloat(getComputedStyle(frame).lineHeight),separators:[...row.children].slice(1).map(n=>({width:getComputedStyle(n,'::before').width,pointer:getComputedStyle(n,'::before').pointerEvents}))};});
   const evidence=JSON.stringify({width,language,scale,value});assert.equal(value.overflow,false,evidence);assert.equal(value.total,true,evidence);assert.equal(value.card,true,evidence);assert.equal(value.facts,true,evidence);assert.ok(value.frameLines<1.1,evidence);for(const group of value.groups)assert.equal(group.hidden,group.start,evidence);for(const sep of value.separators)assert.deepEqual(sep,{width:'1px',pointer:'none'},evidence);
   layouts.push({width,language,scale});if(language==='ko'&&scale===1.6&&width!==640)await page.screenshot({path:path.join(output,'summary-'+width+'-ko-large.png'),fullPage:true});
  }
 });
 await check('OFF intrinsic width and ON shared aspect minimum accommodate 32,768-ref/frame facts without changing arithmetic',async()=>{
  await page.setViewportSize({width:1600,height:1000});
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const preview of [false,true]){
   await mount({language,scale});
   const before=await facts();if(preview)await page.locator('.mmc-tl-individual-preview').click();
   const value=await page.evaluate(()=>{const card=document.querySelector('[data-mmc-segment-index="0"]'),row=card.querySelector('.mmc-tl-card-refs'),frame=row.querySelector('.mmc-tl-card-frame-fact'),clip=document.querySelector('[data-mmc-segment-index="2"]');row.firstElementChild.textContent=I.t('{count} refs',{count:'32,768'});frame.textContent=I.t('{fps} fps · {frames} frames',{fps:60,frames:'32,768'});const aspect=node=>({ready:!!node.querySelector(':scope > .mmc-card-preview'),portrait:!!node.querySelector(':scope > .mmc-card-preview.mmc-card-preview-portrait'),wide:!!node.querySelector(':scope > .mmc-card-preview.mmc-card-preview-wide')});return{preview:timelineSubject.previewMode,cardWidth:card.getBoundingClientRect().width,minWidth:getComputedStyle(card).minWidth,aspect:aspect(card),clipAspect:aspect(clip),frameLines:frame.getBoundingClientRect().height/parseFloat(getComputedStyle(frame).lineHeight),facts:row.scrollWidth<=row.clientWidth+1,factStyles:[...row.children].map(node=>{const range=document.createRange();range.selectNodeContents(node);return{whiteSpace:getComputedStyle(node).whiteSpace,textLines:range.getClientRects().length};}),clipMin:getComputedStyle(clip).minWidth,clipFrameFacts:clip.querySelectorAll('.mmc-tl-card-frame-fact').length,commits:timelineSubject.commits,calls:timelineSubject.calls};});
   const evidence=JSON.stringify({language,scale,preview,value});assert.equal(value.preview,preview,evidence);assert.ok(value.frameLines<1.1,evidence);assert.equal(value.facts,true,evidence);assert.equal(value.clipFrameFacts,0,evidence);
   if(preview){const floor=aspect=>Math.max(aspect.portrait?338:aspect.wide?520:420,(aspect.portrait?38:58)+300*scale);assert.equal(value.minWidth,(value.aspect.ready?floor(value.aspect):58+300*scale)+'px',evidence);assert.equal(value.clipMin,(value.clipAspect.ready?floor(value.clipAspect):0)+'px',evidence);}
   else{assert.equal(value.minWidth,'0px',evidence);assert.equal(value.clipMin,'0px',evidence);for(const fact of value.factStyles){assert.equal(fact.whiteSpace,'nowrap',evidence);assert.equal(fact.textLines,1,evidence);}}
   const after=await facts();for(const key of ['seconds','frames','sampled','fps','count','snapshot'])assert.deepEqual(after[key],before[key],'Unchanged '+key+' '+evidence);assert.equal(value.commits,0,evidence);assert.deepEqual(value.calls,[],evidence);
  }
 });
 await check('Storyboard captions align right; absent/long translated captions never shift status, seed or footer controls',async()=>{
  const short={...blob,storyboard:'previous',segments:[blob.segments[0],{...blob.segments[1],duration_s:14.38}]};
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await mount({language,scale,blob:JSON.stringify(short)});
   const read=()=>page.evaluate(()=>{const card=document.querySelector('[data-mmc-segment-index="1"]'),rect=card.getBoundingClientRect(),meta=card.querySelector(':scope > .mmc-tl-card-meta'),caption=meta.querySelector(':scope > span');return{caption:caption?.textContent,expected:I.t('storyboard'),align:getComputedStyle(meta).textAlign,justify:getComputedStyle(meta).justifyContent,overflow:card.scrollWidth>card.clientWidth+1,captionRight:caption?.getBoundingClientRect().right,metaRight:meta.getBoundingClientRect().right,width:rect.width,positions:[...card.querySelectorAll('.mmc-tl-card-status > button,.mmc-tl-card-seed button,.mmc-tl-card-foot button')].map(n=>({text:n.textContent,x:n.getBoundingClientRect().left-rect.left,width:n.getBoundingClientRect().width}))};});
   const shown=await read();assert.equal(shown.caption,shown.expected);assert.equal(shown.align,'right');assert.equal(shown.justify,'flex-end');assert.ok(Math.abs(shown.captionRight-shown.metaRight)<1);
   await page.evaluate(()=>{const span=document.querySelector('[data-mmc-segment-index="1"] .mmc-tl-card-meta > span');span.textContent=(I.t('storyboard')+' — ').repeat(25);});const long=await read();assert.equal(long.overflow,false);assert.deepEqual(long.positions,shown.positions);assert.equal(long.width,shown.width);
   await page.evaluate(()=>{delete timelineSubject.timeline.storyboard;timelineSubject.renderStrip();});const absent=await read();assert.equal(absent.caption,undefined);assert.equal(absent.width,shown.width);assert.deepEqual(absent.positions,shown.positions);
   if(language==='ko'&&scale===1.6){await mount({language,scale,blob:JSON.stringify(short)});await page.screenshot({path:path.join(output,'storyboard-right-ko-large.png'),fullPage:true});}
  }
 });
 await check('Actual Cast shelf prepends registered-person count, including members with no files, and updates after removal',async()=>{
  const contrastPath=path.join(repo,'tests/browser/test-timeline-field-contrast.cjs'),text=fs.readFileSync(contrastPath,'utf8'),prefix=text.slice(0,text.indexOf('\nnew vm.Script(code,'));
  const castFixture=vm.runInNewContext(prefix+';({code,css});',{require,process,__dirname:path.dirname(contrastPath)});
  const castPage=await context.newPage();castPage.on('pageerror',error=>fixture.errors.push(error.message));await castPage.route('**/*',route=>{throw new Error('No cast API/network: '+route.request().url());});await castPage.setContent('<style>'+castFixture.css+'</style>');await castPage.evaluate('(()=>{'+castFixture.code+'})()');
  const result=await castPage.evaluate(()=>{subject.timeline.subjects=[{handle:'one',from:[]},{handle:'two',from:['ref-1','ref-2']}];subject.renderCast();const read=()=>[...subject.castShelf.section.head.querySelectorAll('.mmc-media-count')].map(n=>n.textContent);const two=read();subject.timeline.subjects.pop();subject.renderCast();const one=read();subject.timeline.subjects=[];subject.renderCast();return{two,one,zero:read()};});
  assert.equal(result.two[0],'Cast 2');assert.ok(result.two.includes('Supporting images 2'));assert.equal(result.one[0],'Cast 1');assert.equal(result.zero[0],'Cast 0');await castPage.close();
 });
 assert.equal(fixture.errors.length,0,JSON.stringify(fixture.errors));assert.equal(fixture.getRequests(),0);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,layouts,requests:0,errors:fixture.errors},null,2));console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,requests:0,errors:0}));
})().finally(async()=>{await browser?.close();}).catch(error=>{console.error(error);process.exitCode=1;});
