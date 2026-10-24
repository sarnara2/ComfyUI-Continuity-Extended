// Actual renderStrip/pass/generated/Clip/navigation and controller methods in
// offline Chrome. Only unrelated panels and known RAM-media/API boundaries are
// adapters. No live ComfyUI, files, workflow edits, AI, queue or GPU execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(repo,'web/creator'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=read('timeline.js'),method=(text,name)=>{const m=text.match(new RegExp('^  (?:async )?'+name+'\\([^]*?^  \\}','m'));assert.ok(m,name);return m[0];};
const stableWidthBlock='// Card controls have a stable base. Ready media uses the shared aspect-class\r\n// widths in CSS; only the sound lane and duration readouts represent time.\r\nconst cardWidth = () => 358;';
const durationWidthBlock='/**\r\n * Card width from duration. Compressed rather than linear: durations run 1 s to\r\n * 60 s, and at any scale that keeps a 1-second card wide enough for its own\r\n * buttons a 60-second one would be most of a metre. Square root keeps the\r\n * ordering legible — a longer shot is visibly a wider card — without that.\r\n * The lane in the node body stays strictly proportional; that is its whole job.\r\n */\r\nconst cardWidth = (seconds) => 132 + Math.round(Math.sqrt(seconds) * 26);';
const newline=source.includes('\r\n')?'\r\n':'\n',widthBlock=stableWidthBlock.replace(/\r\n/g,newline),widthStyle='style: { width: `${cardWidth()}px` },';
assert.equal(source.split(widthBlock).length,2,'One exact shared aspect-width constant/comment');assert.equal(source.split(widthStyle).length,3,'Exactly the Clip and generated duration-free style calls');
const durationWidthSource=source.replace(widthBlock,durationWidthBlock.replace(/\r\n/g,newline)).replace(widthStyle,'style: { width: `${cardWidth(seconds)}px` },').replace(widthStyle,'style: { width: `${cardWidth(seconds)}px`, "--mmc-tl-card-width": `${cardWidth(seconds)}px` },');
const titleHook=/    \/\/ BEGIN looping card titles\r?\n[^]*?    \/\/ END looping card titles\r?\n/;
assert.ok(titleHook.test(source),'Explicit view-only looping-title hook');
const withoutTitleHook=text=>text.replace(titleHook,'').replace('    this.cardTitleFit?.disconnect();\r\n    this.cardTitleFit = null;\r\n','').replace('    this.cardTitleFit?.disconnect();\n    this.cardTitleFit = null;\n','');
const scrollbarLines=[
 'import { createTimelineScrollbars } from "./timeline-scrollbars.js";',
 '    this.scrollbars = createTimelineScrollbars(this.modal.querySelector(":scope > .mmc-tl-body"), this.stripHost);',
 '    this.scrollbars?.destroy();',
 '    this.scrollbars = null;',
];
const withoutScrollbars=text=>{for(const line of scrollbarLines){assert.equal(text.split(line).length,2,'One exact separately approved scrollbar integration line');text=text.replace(line+'\r\n','').replace(line+'\n','');}return text;};
const styles=read('styles.js'),imports=Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(m=>[m[1],m[2]]));
const order=styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(s=>s.trim()).filter(Boolean);
const styleOwner=read('styles/timeline.js'),block=/\/\* --- compact cards without ready previews --- \*\/[^]*?\/\* --- end compact cards without ready previews --- \*\//;
assert.equal((styleOwner.match(/\/\* --- compact cards without ready previews --- \*\//g)||[]).length,1,'One named compact OFF block');
const compactBlock=styleOwner.match(block)?.[0];assert.ok(compactBlock);
for(const selector of compactBlock.replace(/\/\*[^]*?\*\//g,'').matchAll(/([^{}]+)\{/g))
 for(const part of selector[1].split(','))assert.ok(part.trim().startsWith('.mmc-tl-strip:not(.individual-preview) '),'OFF-only selector '+part);
const css=order.map(name=>read('styles/'+imports[name]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const priorCss=css.replace(compactBlock,'');assert.equal(priorCss.split(compactBlock).length,1);
// Whole source receipt: compact presentation has no additional JS mode or
// data/action change. Permit only the already-approved portrait/Edit markup.
const backup=path.resolve(process.env.CONTINUITY_PRESENTATION_BASELINE_DIR||path.resolve(repo,'../baseline'),'web/creator/timeline.js');
if(fs.existsSync(backup)){
 const previous=fs.readFileSync(backup,'utf8');
 const currentWheel=/    \/\/ Cards scroll the Timeline vertically\.[^]*?    \}, \{ passive: false \}\);\r?\n/g;
 const previousWheel=/    \/\/ A trackpad swipes sideways on its own;[^]*?    \}, \{ passive: false \}\);\r?\n/g;
 assert.equal((source.match(currentWheel)||[]).length,1,'One separately approved constructor wheel-band handler');
 assert.equal((previous.match(previousWheel)||[]).length,1,'One original constructor wheel handler');
 const reconstructed=withoutScrollbars(withoutTitleHook(durationWidthSource)).replace('class: "mmc-tl-edit mmc-tl-card-edit-action", text: t("Edit")','class: "mmc-tl-edit", text: t("Edit")')
  .replace('style: { width: `${cardWidth(seconds)}px`, "--mmc-tl-card-width": `${cardWidth(seconds)}px` },','style: { width: `${cardWidth(seconds)}px` },')
  .replace(currentWheel,previous.match(previousWheel)[0]);
 assert.equal(reconstructed,previous,'Only earlier named portrait/Edit markup, explicit view-only title hook, separate wheel-band handler and four exact scrollbar integration lines differ; compact has no Timeline JS edit');
 for(const name of ['renderStrip','renderNavigation','renderClipCard','holdSwitch','takeTools','takeChip','removeButton','cardPreview','clearCardPreviews'])
  assert.equal(withoutTitleHook(method(durationWidthSource,name)),method(previous,name),name+' data/action owner exact after named title observer and exactly restored width style');
}
const shared=path.join(repo,'tests/browser/test-card-individual-preview.cjs'),text=fs.readFileSync(shared,'utf8'),boundary=text.indexOf('\n(async()=>{');assert.ok(boundary>0);
const fixture=vm.runInNewContext(text.slice(0,boundary)+`;({setupPage,errors,getRequests:()=>requests,
 setMedia:media=>{mediaBase64=media.landscape;moduleSources['api.js']=moduleSources['api.js'].replace('window.badMediaUrl:window.mediaUrl',"window.badMediaUrl:(window.compactMediaUrls?.[filename.includes('portrait')?'portrait':'landscape']??window.mediaUrl)");}});`,
 {require,process,__dirname:path.dirname(shared)},{filename:shared});
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-card-compact-off'));
assert.ok(output!==repo&&!output.startsWith(repo+path.sep),'Evidence outside product');
const theme=':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}';
const longName='source/clip_'+('Very_long_원본_映像_😀_'.repeat(60))+'.webm';
const makeBlob=(filename=longName)=>JSON.stringify({version:2,face_schema:1,extended_ui:{card_names:{portrait:'Saved portrait',landscape:'Saved landscape',unready:'No take',clip:'Clip'}},segments:[
 {card_id:'portrait',prompt:'한'.repeat(33459),duration_s:14.38,hold:true,face:{on:true,canvas:512,denoise:.45},screens:[{handle:'phone-1',device:'phone',content:{filename:'metadata-only.png',kind:'image'}}],take:{filename:'portrait.webm [output]',duration_s:2.4,width:120,height:208,has_audio:false,stamp:'saved-portrait'}},
 {card_id:'landscape',prompt:'Small input',duration_s:8,face:{on:false,canvas:512,denoise:.45},take:{filename:'landscape.webm [output]',duration_s:2.4,width:160,height:90,has_audio:false,stamp:'saved-landscape'}},
 {card_id:'unready',prompt:'Not rendered',duration_s:1},
 {card_id:'clip',kind:'clip',filename,duration_s:2.4,width:160,height:90,has_audio:false},
]});
const checks=[],layouts=[],onLayouts=[],filenameCases=[];let browser;
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const context=await browser.newContext({viewport:{width:1600,height:1100}}),recording=await context.newPage();await recording.setContent('<button>RAM fixture</button>');
 const media=await recording.evaluate(async()=>{
  const create=async(width,height)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();let tick=0;const timer=setInterval(()=>{ctx.fillStyle=++tick%2?'#526878':'#456071';ctx.fillRect(0,0,width,height);},50);await new Promise(resolve=>setTimeout(resolve,500));clearInterval(timer);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let encoded='';for(const byte of bytes)encoded+=String.fromCharCode(byte);return btoa(encoded);};
  const [portrait,landscape]=await Promise.all([create(120,208),create(160,90)]);return{portrait,landscape};
 });await recording.close();fixture.setMedia(media);
 const page=await fixture.setupPage(context);
 await page.evaluate(({media,css,theme})=>{
  window.compactMediaUrls=Object.fromEntries(Object.entries(media).map(([key,value])=>{const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return[key,URL.createObjectURL(new Blob([bytes],{type:'video/webm'}))];}));
  document.querySelectorAll('style').forEach(node=>node.remove());window.compactStyle=document.createElement('style');compactStyle.textContent=css+theme;document.head.append(compactStyle);
 },{media,css,theme});
 const style=async(value)=>{await page.evaluate(({value,theme})=>compactStyle.textContent=value+theme,{value,theme});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const mount=async(options={})=>page.evaluate(options=>mountTimelineFixture(options),{blob:makeBlob(),...options});
 const metrics=()=>page.evaluate(()=>{
  const box=n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  return{data:JSON.stringify(timelineSubject.timeline),calls:timelineSubject.calls,commits:timelineSubject.commits,mode:timelineSubject.previewMode,
   previewCount:document.querySelectorAll('.mmc-tl-card > .mmc-card-preview').length,cards:[...document.querySelectorAll('.mmc-tl-card')].map(card=>{
    const cr=box(card),s=getComputedStyle(card),foot=card.querySelector('.mmc-tl-card-foot'),fr=box(foot),clip=card.classList.contains('mmc-tl-clip');
    const labels=[...card.querySelectorAll('.mmc-tl-card-count,.mmc-tl-card-frame-fact,.mmc-tl-edit,.mmc-tl-card-face,.mmc-tl-card-motion')].map(n=>{const r=document.createRange();r.selectNodeContents(n);return{text:n.textContent,box:box(n),glyph:box(r),font:getComputedStyle(n).fontSize,line:getComputedStyle(n).lineHeight,whiteSpace:getComputedStyle(n).whiteSpace};});
    const name=card.querySelector('.mmc-tl-clip-name');
    const preview=card.querySelector('.mmc-card-preview-stage');
    return{index:Number(card.dataset.mmcSegmentIndex),clip,width:cr.width,height:cr.height,padding:parseFloat(s.paddingBottom),border:parseFloat(s.borderBottomWidth),gap:cr.bottom-fr.bottom,
        overflow:card.scrollWidth>card.clientWidth+1,labels,preview:preview?box(preview):null,name:name?{text:name.textContent,title:name.title,whiteSpace:getComputedStyle(name).whiteSpace,textOverflow:getComputedStyle(name).textOverflow,overflow:getComputedStyle(name).overflow,display:getComputedStyle(name).display,scroll:name.scrollWidth,client:name.clientWidth,font:getComputedStyle(name).fontSize,loop:name.classList.contains('mmc-tl-title-loop'),moving:name.classList.contains('moving'),aria:name.getAttribute('aria-label')}:null};
   })};
 });
 await check('Actual OFF mixed strip gives every generated/Clip card a natural-height bottom and safe no-wrap control width',async()=>{
  for(const width of [320,640,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [1,1.6]){
   await page.setViewportSize({width,height:1100});const before=await mount({language,scale});await style(priorCss);const prior=await metrics();await style(css);const current=await metrics();
   assert.equal(current.data,before);assert.deepEqual(current.calls,[]);assert.equal(current.commits,0);assert.equal(current.mode,false);assert.equal(current.previewCount,0);assert.equal(current.cards.length,4);
   for(const [index,card]of current.cards.entries()){assert.equal(card.overflow,false,JSON.stringify({width,language,scale,card}));assert.ok(card.gap>=card.padding+card.border-.5&&card.gap<=card.padding+card.border+.5,JSON.stringify(card));
    for(const [labelIndex,label]of card.labels.entries()){assert.ok(label.glyph.height<=label.box.height+1&&label.glyph.width<=label.box.width+1,JSON.stringify(label));assert.equal(label.whiteSpace,'nowrap');assert.equal(label.font,prior.cards[index].labels[labelIndex].font,'No font shrink for compact width');}}
   assert.ok(current.cards.slice(0,3).some((card,i)=>card.gap+4<prior.cards[i].gap),'Extra metadata on one generated peer must not stretch other generated card bottoms');
   assert.ok(current.cards[3].gap+4<prior.cards[3].gap,'Stretched Clip bottom is reduced too');
   for(let i=0;i<3;i++)assert.ok(current.cards[i].width<prior.cards[i].width-1,JSON.stringify({width,language,scale,prior:prior.cards[i].width,current:current.cards[i].width}));
   layouts.push({width,language,scale,prior:prior.cards,current:current.cards});
   if(language==='ko'&&scale===1.6)await page.screenshot({path:path.join(output,'compact-off-'+width+'-ko-large.png'),fullPage:false});
  }
 });
 await check('Long Clip filename stays one-line in its bounded marquee and cannot size a wider card than the same short filename',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [1,1.6]){
   await mount({language,scale,blob:makeBlob('short.webm')});const short=await metrics();await mount({language,scale});const long=await metrics();
   const a=short.cards[3],b=long.cards[3];assert.equal(b.width,a.width);assert.equal(b.height,a.height);assert.equal(b.name.whiteSpace,'nowrap');assert.equal(b.name.overflow,'hidden');assert.equal(b.name.display,'block');assert.equal(b.name.loop,true);assert.ok(b.name.scroll>b.name.client);assert.equal(b.name.title,longName);assert.equal(b.name.text,longName.split('/').pop());assert.equal(b.name.aria,b.name.text);
   for(let i=0;i<3;i++){assert.equal(long.cards[i].width,short.cards[i].width);assert.equal(long.cards[i].height,short.cards[i].height);}
   filenameCases.push({language,scale,width:b.width,height:b.height,short:a.name,long:b.name});
  }
  await page.setViewportSize({width:640,height:1100});await mount({language:'ko',scale:1.6});
  await page.locator('[data-mmc-segment-index="3"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'compact-clip-off-640-ko-large.png'),fullPage:false});
 });
 await check('OFF → ON → OFF actual navigation keeps timeline data/callbacks intact and releases prepared media',async()=>{
  const before=await mount({language:'ko'});const off=await metrics();await page.locator('.mmc-tl-individual-preview').click();await page.waitForFunction(()=>[...timelineSubject.cardPreviews].every(player=>player.media.readyState>=2));const on=await metrics();
  assert.equal(on.mode,true);assert.equal(on.previewCount,3);assert.equal(on.data,before);assert.deepEqual(on.calls,[]);assert.equal(on.commits,0);
  await page.evaluate(()=>window.compactOldMedia=[...timelineSubject.cardPreviews].map(player=>player.media));await page.locator('.mmc-tl-individual-preview').click();const restored=await metrics();assert.equal(restored.mode,false);assert.equal(restored.previewCount,0);assert.equal(restored.data,before);assert.deepEqual(restored.calls,[]);assert.equal(restored.commits,0);
  assert.equal(await page.evaluate(()=>compactOldMedia.every(media=>media.paused&&!media.getAttribute('src'))&&timelineSubject.cardPreviews.size===0),true);
  assert.deepEqual(restored.cards.map(({width,height})=>({width,height})),off.cards.map(({width,height})=>({width,height})));
 });
 await check('ON portrait/landscape and Clip geometry is unchanged by the strictly OFF-only CSS block',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [1,1.6]){
   await page.setViewportSize({width:1600,height:1100});const before=await mount({language,scale});await page.locator('.mmc-tl-individual-preview').click();await page.waitForFunction(()=>[...timelineSubject.cardPreviews].every(player=>player.media.readyState>=2));
   await style(priorCss);const prior=await metrics();await style(css);const current=await metrics();
   // Animated Clip track scroll bounds can change with elapsed wall time;
   // its stable filename/container and all card/player geometry must not.
   const stable=value=>({...value,cards:value.cards.map(card=>({...card,name:card.name?{...card.name,scroll:undefined}:null}))});
   assert.deepEqual(stable(current),stable(prior));assert.equal(current.data,before);
   assert.ok(Math.abs(current.cards[0].preview.width/current.cards[0].preview.height-120/208)<.01);assert.ok(Math.abs(current.cards[1].preview.width/current.cards[1].preview.height-160/90)<.01);assert.ok(Math.abs(current.cards[3].preview.width/current.cards[3].preview.height-160/90)<.01);assert.equal(current.cards[2].preview,null);
   onLayouts.push({language,scale,cards:current.cards});
  }
 });
 await check('Every OFF card control remains hit-testable after independent native strip scrolling; original Edit/Trim/Clip action order remains',async()=>{
  await page.setViewportSize({width:640,height:1100});const before=await mount({language:'ko',scale:1.6});
  const targets=page.locator('.mmc-tl-card button:not(:disabled),.mmc-tl-card input:not(:disabled)');
  for(let i=0;i<await targets.count();i++){
   const target=targets.nth(i);if(!await target.isVisible())continue;await target.scrollIntoViewIfNeeded();assert.equal(await target.evaluate(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===node||node.contains(hit);}),true,await target.getAttribute('class'));
  }
  assert.equal((await metrics()).data,before);assert.deepEqual((await metrics()).calls,[]);
  const generated=page.locator('[data-mmc-segment-index="0"] .mmc-tl-card-edit-tools button');for(let i=0;i<await generated.count();i++)await generated.nth(i).click();
  const clip=page.locator('[data-mmc-segment-index="3"] .mmc-tl-card-edit-tools button');for(let i=0;i<await clip.count();i++)await clip.nth(i).click();
  assert.deepEqual(await page.evaluate(()=>timelineSubject.calls),[['trim',0],['crop',0],['edit',0],['clip-trim',3],['replace',3],['clip-crop',3]]);assert.equal((await metrics()).data,before);
 });
 await page.evaluate(()=>timelineSubject.close());assert.equal(fixture.getRequests(),0);assert.equal(fixture.errors.length,0,JSON.stringify(fixture.errors));
 const report={checks,layouts,onLayouts,filenameCases,requests:fixture.getRequests(),errors:fixture.errors,scope:'actual card/pass/strip/nav/controllers; CSS-only prior overlay on same DOM; RAM media and unrelated-host adapters; no live ComfyUI/render proof'};
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,onLayouts:onLayouts.length,filenameCases:filenameCases.length,requests:0,errors:0}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
