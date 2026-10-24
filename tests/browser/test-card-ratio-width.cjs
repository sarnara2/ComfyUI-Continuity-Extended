// Actual Timeline/state/preview modules and ordered production CSS in offline
// Chrome. All media is generated in RAM; no user file/profile/API/GPU is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(repo,'web/creator'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const baseline=path.resolve(process.env.CONTINUITY_CARD_RATIO_BASELINE_DIR||path.join(repo,'../baseline'));
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-card-ratio-width'));
assert.ok(output!==repo&&!output.startsWith(repo+path.sep),'Evidence outside product');
const source=read('timeline.js'),oldSource=fs.readFileSync(path.join(baseline,'web/creator/timeline.js'),'utf8');
const widthBlock=/\/\/ Card controls have a stable base\.[^]*?const cardWidth = \(\) => 358;/;
const oldWidthBlock=/\/\*\*\r?\n \* Card width from duration\.[^]*?const cardWidth = \(seconds\) => 132 \+ Math\.round\(Math\.sqrt\(seconds\) \* 26\);/;
assert.equal((source.match(/const cardWidth =/g)||[]).length,1);assert.match(source,widthBlock);assert.match(oldSource,oldWidthBlock);
assert.equal((source.match(/style: \{ width: `\$\{cardWidth\(\)\}px` \},/g)||[]).length,2,'Exactly two shared stable-base card styles');
let reconstructed=source.replace(widthBlock,oldSource.match(oldWidthBlock)[0]);
reconstructed=reconstructed.replace('style: { width: `${cardWidth()}px` },','style: { width: `${cardWidth(seconds)}px` },');
reconstructed=reconstructed.replace('style: { width: `${cardWidth()}px` },','style: { width: `${cardWidth(seconds)}px`, "--mmc-tl-card-width": `${cardWidth(seconds)}px` },');
assert.equal(reconstructed,oldSource,'Only the presentation width helper/comment and its two card styles change; every callback/calculation is exact');
const ratioBlock=/\/\* BEGIN ready portrait segment card width \*\/[^]*?\/\* END ready portrait segment card width \*\//;
const offMetaBlock=/\.mmc-tl-strip:not\(\.individual-preview\) \.mmc-tl-clip > \.mmc-tl-card-meta \{\r?\n  contain: inline-size; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\r?\n\}\r?\n/;
const style=read('styles/timeline.js'),oldStyle=fs.readFileSync(path.join(baseline,'web/creator/styles/timeline.js'),'utf8');
assert.match(style,ratioBlock);assert.match(oldStyle,ratioBlock);assert.match(style,offMetaBlock);
assert.equal(style.replace(ratioBlock,oldStyle.match(ratioBlock)[0]).replace(offMetaBlock,''),oldStyle,'Only the named ready aspect-width block and OFF Clip metadata containment change');
const before=JSON.parse(fs.readFileSync(path.join(baseline,'../before-manifest.json'),'utf8'));
const wideMarkers=/^  (?:  )?root\.classList\.toggle\("mmc-card-preview-wide", [^\r\n]*\);\r?\n/gm;
assert.equal((read('card-preview.js').match(wideMarkers)||[]).length,3,'Exactly three presentation-only panorama classification lines');
assert.equal(crypto.createHash('sha256').update(read('card-preview.js').replace(wideMarkers,'')).digest('hex').toUpperCase(),before.files['web/creator/card-preview.js'],'All canvas/crop/source/playback arithmetic and callbacks exact after only three view-class lines');
for(const name of ['reference-preview.js','state.js','canvas.js','api.js']){
 const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex').toUpperCase();
 assert.equal(sha,before.files['web/creator/'+name],name+' remains byte-exact, including playback/crop/source/state/API');
}
const styles=read('styles.js'),imports=Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)].map(m=>[m[1],m[2]]));
const order=styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(s=>s.trim()).filter(Boolean);
const css=order.map(name=>read('styles/'+imports[name]+'.js').match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const shared=path.join(repo,'tests/browser/test-card-individual-preview.cjs'),text=fs.readFileSync(shared,'utf8'),boundary=text.indexOf('\n(async()=>{');assert.ok(boundary>0);
const fixture=vm.runInNewContext(text.slice(0,boundary)+`;({setupPage,errors,getRequests:()=>requests,
 setMedia:media=>{mediaBase64=media.landscape160;moduleSources['api.js']=moduleSources['api.js'].replace('window.badMediaUrl:window.mediaUrl',"window.badMediaUrl:(window.ratioMediaUrls?.[filename.split('/').pop().split('.')[0]]??window.mediaUrl)");}});`,
 {require,process,__dirname:path.dirname(shared)},{filename:shared});
const theme=':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}';
const dimensions={landscape160:[160,90],landscape640:[640,360],landscape1280:[1280,720],landscape1920:[1920,1080],landscape3840:[3840,2160],nearWide:[1268,720],portrait:[120,208],square:[160,160],panorama21:[252,108],panorama32:[320,90],ultrawide:[240,60]};
const durations=[1,27,218.6,3600],checks=[],matrix=[],layouts=[],cropCases=[];let browser;
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<.2,message+' '+JSON.stringify({a,b}));
const makeBlob=(entries)=>JSON.stringify({version:2,face_schema:1,extended_ui:{card_names:Object.fromEntries(entries.map((entry,index)=>['ratio-'+index,entry.name||'Card '+(index+1)]))},segments:entries.map((entry,index)=>{
 const {kind='clip',key='landscape160',seconds=27,unknown=false,crop=null,name='',ready=true}=entry;
 const [width,height]=dimensions[key],filename=key+'.webm',base={card_id:'ratio-'+index,duration_s:seconds};
 const asset={filename,duration_s:seconds,has_audio:false,...(unknown?{}:{width,height}),...(crop?{crop}:{})};
 return kind==='clip'?{...base,kind:'clip',...asset}:{...base,prompt:'Keep source performance. ',face:{on:false,canvas:512,denoise:.45},...(ready?{take:{...asset,stamp:'saved-'+index}}:{})};
})});
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const context=await browser.newContext({viewport:{width:1600,height:1200}}),recording=await context.newPage();await recording.setContent('<button>RAM only</button>');
 const media=await recording.evaluate(async dimensions=>{
  const out={};
  for(const [key,[width,height]]of Object.entries(dimensions)){
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');for(const [x,y,color]of [[0,0,'#d93938'],[width/2,0,'#21a85a'],[0,height/2,'#247fe5'],[width/2,height/2,'#dfc633']]){ctx.fillStyle=color;ctx.fillRect(x,y,width/2,height/2);}
   const stream=canvas.captureStream(10),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();let tick=0;
   const timer=setInterval(()=>{ctx.fillStyle=++tick%2?'#7292a7':'#3d596b';ctx.fillRect(width/2-8,height/2-8,16,16);},50);await new Promise(resolve=>setTimeout(resolve,600));clearInterval(timer);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
   const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let data='';for(const byte of bytes)data+=String.fromCharCode(byte);out[key]=btoa(data);
  }
  return out;
 },dimensions);await recording.close();fixture.setMedia(media);
 const page=await fixture.setupPage(context);
 await page.evaluate(({media,css,theme})=>{
  window.ratioMediaUrls=Object.fromEntries(Object.entries(media).map(([key,value])=>{const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return[key,URL.createObjectURL(new Blob([bytes],{type:'video/webm'}))];}));
  document.querySelectorAll('style').forEach(node=>node.remove());const style=document.createElement('style');style.textContent=css+theme;document.head.append(style);
  window.ratioMetrics=()=>{
   const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   return{snapshot:JSON.stringify(timelineSubject.timeline),calls:timelineSubject.calls,commits:timelineSubject.commits,mode:timelineSubject.previewMode,cards:[...document.querySelectorAll('.mmc-tl-card')].map(card=>{
    const cr=rect(card),stage=card.querySelector('.mmc-card-preview-stage'),preview=card.querySelector('.mmc-card-preview'),media=card.querySelector('video'),canvas=card.querySelector('canvas');
    const labels=[...card.querySelectorAll('.mmc-tl-card-count,.mmc-tl-card-refs > span,.mmc-tl-edit,.mmc-tl-card-face,.mmc-tl-card-motion,.mmc-tl-card-seed .mmc-seed-mode')].map(n=>{
     const range=document.createRange();range.selectNodeContents(n);const lines=[];for(const r of range.getClientRects())if(r.width>.1&&!lines.some(top=>Math.abs(top-r.top)<.5))lines.push(r.top);
     return{text:n.textContent,box:rect(n),lines:lines.length,whiteSpace:getComputedStyle(n).whiteSpace,font:getComputedStyle(n).fontSize};
    });
    const foot=card.querySelector('.mmc-tl-card-foot'),transport=card.querySelector('.mmc-tl-card-transport'),tools=card.querySelector('.mmc-tl-card-edit-tools');
    const cs=getComputedStyle(card);return{index:Number(card.dataset.mmcSegmentIndex),clip:card.classList.contains('mmc-tl-clip'),name:card.querySelector('.mmc-tl-card-name-button')?.textContent,width:cr.width,height:cr.height,overflow:card.scrollWidth>card.clientWidth+1,labels,
     stage:stage?rect(stage):null,ratio:stage?getComputedStyle(stage).aspectRatio:null,portrait:!!preview?.classList.contains('mmc-card-preview-portrait'),wide:!!preview?.classList.contains('mmc-card-preview-wide'),canvas:canvas?{width:canvas.width,height:canvas.height,corners:[[.125,.125],[.875,.125],[.125,.875],[.875,.875]].map(([x,y])=>Array.from(canvas.getContext('2d').getImageData(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1).data))}:null,
     media:media?{width:media.videoWidth,height:media.videoHeight,ready:media.readyState,duration:media.duration,error:media.error?.code,paused:media.paused,muted:media.muted,volume:media.volume,source:media.getAttribute('src')}:null,
     foot:rect(foot),transport:rect(transport),tools:rect(tools),bottomGap:cr.bottom-rect(foot).bottom,padding:parseFloat(cs.paddingBottom),border:parseFloat(cs.borderBottomWidth)};
   })};
  };
 },{media,css,theme});
 const mount=async(entries,options={})=>{
  const snapshot=await page.evaluate(options=>mountTimelineFixture(options),{blob:makeBlob(entries),...options});
  await page.locator('.mmc-tl-individual-preview').click();const initial=await page.evaluate(()=>ratioMetrics());
  await page.waitForFunction(()=>[...timelineSubject.cardPreviews].every(player=>player.media.readyState>=2||player.media.error));
  return{snapshot,initial,current:await page.evaluate(()=>ratioMetrics())};
 };
 const integrity=(value,snapshot)=>{assert.equal(value.snapshot,snapshot);assert.deepEqual(value.calls,[]);assert.equal(value.commits,0);for(const card of value.cards){assert.equal(card.overflow,false,JSON.stringify(card));if(card.media){assert.equal(card.media.paused,true);assert.equal(card.media.muted,true);assert.equal(card.media.volume,0);assert.ok(card.media.ready>=2,JSON.stringify(card));}}};
 const fullFrame=(card)=>{const expected=[[217,57,56],[33,168,90],[36,127,229],[223,198,51]];for(let i=0;i<4;i++){const pixel=card.canvas.corners[i];assert.ok(pixel[3]>=250,'Full-frame corner is opaque apart from canvas interpolation, not a blank UI bar');for(let channel=0;channel<3;channel++)assert.ok(Math.abs(pixel[channel]-expected[i][channel])<=20,'Original RAM frame corner preserved '+JSON.stringify({pixel,expected:expected[i],card:card.index}));}};
 const readable=(card)=>{for(const label of card.labels){assert.ok(label.lines<=1,JSON.stringify({card:card.index,label}));assert.ok(label.box.right<=card.tools.right+1||label.text===card.labels[0]?.text,JSON.stringify(label));}};
 await check('Same 16:9 delivered cards keep identical widths across actual decoded 160p–4K sources and 1–3600s lengths',async()=>{
  for(const key of ['landscape160','landscape640','landscape1280','landscape1920','landscape3840']){
   const entries=durations.flatMap(seconds=>[{kind:'clip',key,seconds},{kind:'generated',key,seconds}]),value=await mount(entries,{language:'ko'});integrity(value.current,value.snapshot);
   for(const card of value.current.cards){close(card.width,420,'Common landscape width');assert.equal(card.portrait,false);assert.deepEqual([card.media.width,card.media.height],dimensions[key]);close(card.stage.width/card.stage.height,16/9,'Exact display aspect');readable(card);fullFrame(card);}
   matrix.push({key,dimensions:dimensions[key],durations,cards:value.current.cards});
  }
  const screenshot=await mount([{key:'landscape1280',seconds:27},{key:'nearWide',seconds:218.6}],{language:'ko'});integrity(screenshot.current,screenshot.snapshot);
  close(screenshot.current.cards[0].width,screenshot.current.cards[1].width,'User 1280×720/1268×720 example is equally sized');assert.ok(screenshot.current.cards[0].width>=400,'27s clip no longer becomes a 267px card');
  await page.locator('.mmc-tl-strip').screenshot({path:path.join(output,'same-landscape-two-clips.png')});
 });
 await check('Portrait, square and panorama previews share class widths while preserving their full original display aspect',async()=>{
  for(const key of ['portrait','square','panorama21','panorama32','ultrawide']){
   const value=await mount(durations.flatMap(seconds=>[{kind:'clip',key,seconds},{kind:'generated',key,seconds}]),{language:'ko'});integrity(value.current,value.snapshot);
   for(const card of value.current.cards){const wide=dimensions[key][0]/dimensions[key][1]>=2.1;close(card.width,key==='portrait'?338:wide?520:420,'Shared aspect-class width');assert.equal(card.portrait,key==='portrait');assert.equal(card.wide,wide);close(card.stage.width/card.stage.height,dimensions[key][0]/dimensions[key][1],'Full source aspect preserved, not normalized/cropped to card class');readable(card);fullFrame(card);}
   matrix.push({key,dimensions:dimensions[key],durations,cards:value.current.cards});
  }
 });
 await check('Prepared-card labels, footer anchors and hit targets remain one-line at all supported locales, type sizes and narrow viewports',async()=>{
  for(const viewport of [320,1600])for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await page.setViewportSize({width:viewport,height:1200});const entries=[{key:'portrait',kind:'clip'},{key:'portrait',kind:'generated'},{key:'landscape160',kind:'clip'},{key:'landscape160',kind:'generated'},{key:'panorama21',kind:'clip'},{key:'panorama32',kind:'generated'}];
   const value=await mount(entries,{language,scale});integrity(value.current,value.snapshot);
   for(const card of value.current.cards){const portrait=card.portrait;close(card.width,Math.max(portrait?338:card.wide?520:420,(portrait?38:58)+300*scale),'Readable common type floor');readable(card);assert.ok(card.transport.height>=26*scale-.2);assert.ok(card.tools.height>=26*scale-.2);close(card.foot.right,card.tools.right,'Aligned edit tools');close(card.foot.right,card.transport.right,'Aligned transport controls');}
   close(value.current.cards[0].width,value.current.cards[1].width,'Portrait clip/generated equality');close(value.current.cards[2].width,value.current.cards[3].width,'Landscape clip/generated equality');close(value.current.cards[4].width,value.current.cards[5].width,'21:9/32:9 panorama equality');layouts.push({viewport,language,scale,cards:value.current.cards});
   if(viewport===1600&&language==='ko'&&scale===1)await page.locator('.mmc-tl-strip').screenshot({path:path.join(output,'mixed-aspects-ko.png')});
  }
 });
 await check('Real rotated/cropped/unknown metadata updates display classification without rewriting source, crop or saved duration',async()=>{
  await page.setViewportSize({width:1600,height:1200});
  for(const options of [{key:'landscape160',crop:{turn:90},portrait:true},{key:'portrait',crop:{turn:90,mirror:'hv'},portrait:false},{key:'landscape160',crop:{x:0,y:0,w:.25,h:1},portrait:true},{key:'landscape160',crop:{mirror:'hv'},portrait:false},{key:'portrait',unknown:true,portrait:true},{key:'panorama21',unknown:true,portrait:false,wide:true}]){
   const entries=['clip','generated'].map(kind=>({...options,kind,seconds:218.6})),value=await mount(entries,{language:'ko'});integrity(value.current,value.snapshot);
   for(const card of value.current.cards){assert.equal(card.portrait,options.portrait);assert.equal(card.wide,options.wide===true);close(card.width,options.portrait?338:options.wide?520:420,'Final actual framed aspect class');}
   const parsed=JSON.parse(value.snapshot);for(const segment of parsed.segments){const asset=segment.kind==='clip'?segment:segment.take;assert.equal(asset.duration_s,218.6);assert.deepEqual(asset.crop,options.crop);}
   cropCases.push({options,initial:value.initial.cards,current:value.current.cards});
  }
 });
 await check('OFF compact Clip width is independent of resolution digits, and OFF → ON → OFF preserves data and releases prepared media',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [1,1.6]){
   await page.setViewportSize({width:1600,height:1200});const entries=Object.keys(dimensions).filter(key=>key.startsWith('landscape')).map(key=>({key,seconds:27}));
   const snapshot=await page.evaluate(options=>mountTimelineFixture(options),{blob:makeBlob(entries),language,scale}),off=await page.evaluate(()=>ratioMetrics());integrity(off,snapshot);
   for(const card of off.cards){close(card.width,off.cards[0].width,'Resolution digits cannot size compact Clip');close(card.bottomGap,card.padding+card.border,'No empty compact bottom');}
   await page.locator('.mmc-tl-individual-preview').click();await page.waitForFunction(()=>[...timelineSubject.cardPreviews].every(player=>player.media.readyState>=2||player.media.error));const on=await page.evaluate(()=>ratioMetrics());integrity(on,snapshot);
   await page.evaluate(()=>window.ratioOldMedia=[...timelineSubject.cardPreviews].map(player=>player.media));await page.locator('.mmc-tl-individual-preview').click();const restored=await page.evaluate(()=>ratioMetrics());integrity(restored,snapshot);
   assert.deepEqual(restored.cards.map(c=>({width:c.width,height:c.height})),off.cards.map(c=>({width:c.width,height:c.height})));assert.equal(await page.evaluate(()=>ratioOldMedia.every(media=>media.paused&&!media.getAttribute('src'))&&timelineSubject.cardPreviews.size===0),true);
  }
 });
 await check('Long custom labels and canvas backing pixels cannot enlarge ready cards; close disposes observers and media normally',async()=>{
  await page.setViewportSize({width:1600,height:1200});const entries=[{key:'landscape160',kind:'generated'},{key:'landscape160',kind:'clip'}],value=await mount(entries,{language:'ko'});integrity(value.current,value.snapshot);
  const customName='긴 수동 카드 제목 '.repeat(80),named=await mount(entries.map(entry=>({...entry,name:customName})),{language:'ko'});integrity(named.current,named.snapshot);assert.deepEqual(named.current.cards.map(c=>c.width),value.current.cards.map(c=>c.width));for(const card of named.current.cards)assert.equal(card.name,customName.trim().slice(0,80),'Actual canonical saved name limit');
  const backing=await page.evaluate(()=>{document.querySelectorAll('.mmc-card-preview canvas').forEach(canvas=>{canvas.width=7680;canvas.height=4320;});return ratioMetrics();});integrity(backing,named.snapshot);assert.deepEqual(backing.cards.map(c=>c.width),value.current.cards.map(c=>c.width));
  const disposed=await page.evaluate(()=>{const old=[...timelineSubject.cardPreviews].map(player=>player.media);timelineSubject.close();return{players:timelineSubject.cardPreviews.size,observer:timelineSubject.cardTitleFit,unloaded:old.every(media=>media.paused&&!media.getAttribute('src')),overlay:document.querySelector('.fixture-timeline-overlay')!==null};});
  assert.equal(disposed.players,0);assert.equal(disposed.observer,null);assert.equal(disposed.unloaded,true);assert.equal(disposed.overlay,false);
 });
 assert.equal(fixture.getRequests(),0);assert.equal(fixture.errors.length,0,JSON.stringify(fixture.errors));
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,matrix,layouts,cropCases,requests:fixture.getRequests(),errors:fixture.errors},null,2));
 console.log(JSON.stringify({passed:checks.length,resolutionDurationCards:matrix.reduce((n,m)=>n+m.cards.length,0),responsiveLayouts:layouts.length,cropCases:cropCases.length,requests:fixture.getRequests(),errors:fixture.errors.length}));
})().finally(async()=>{await browser?.close();}).catch(error=>{console.error(error);process.exitCode=1;});
