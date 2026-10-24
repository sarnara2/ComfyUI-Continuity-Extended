// Actual card callbacks, ordered production CSS and RAM-only preview controller.
// No live ComfyUI, user media/profile/workflow, model/API/GPU or file generation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=process.env.CONTINUITY_SOURCE_ROOT?path.resolve(process.env.CONTINUITY_SOURCE_ROOT):path.resolve(__dirname,'../..');
const root=path.join(repo,'web/creator'),task=path.resolve(repo,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||path.join(os.tmpdir(),'continuity-portrait-width'));
const legacyFile=path.join(repo,'tests/browser/test-card-footer-layout.cjs');
let prefix=fs.readFileSync(legacyFile,'utf8').split('\n(async()=>{')[0];
// The original narrow whole-view reconstruction predates this separately
// guarded portrait-only block/hook. Retain its callback, state and body guards.
const narrowStart=prefix.indexOf("if(fs.existsSync(path.join(narrowBaseline,'timeline.js'))){"),narrowEnd=prefix.indexOf('const addMarkup=',narrowStart);
assert.ok(narrowStart>0&&narrowEnd>narrowStart);prefix=prefix.slice(0,narrowStart)+prefix.slice(narrowEnd);
const {code,css}=vm.runInNewContext(prefix+';({code,css});',{require,process,__dirname:path.dirname(legacyFile)},{filename:legacyFile});
const portraitRule=/\/\* BEGIN ready portrait segment card width \*\/[^]*?\/\* END ready portrait segment card width \*\/\r?\n/;
const actualTimelineCss=read('styles/timeline.js').match(/export const css = `([^]*)`;\s*$/)[1];
assert.ok(css.includes(actualTimelineCss),'Actual ordered Timeline CSS');
const currentCss=css,baselineCss=css.replace(portraitRule,'');
{
 const preview=read('card-preview.js'),markers=preview.match(/^  (?:  )?root\.classList\.toggle\("mmc-card-preview-portrait", [^\r\n]*\);\r?\n/gm)||[];
 assert.equal(markers.length,3,'Exactly three presentation-only aspect markers');
 const wideMarkers=/^  (?:  )?root\.classList\.toggle\("mmc-card-preview-wide", [^\r\n]*\);\r?\n/gm,wideLines=preview.replace(/\r\n/g,'\n').match(wideMarkers)||[];
 assert.equal(wideLines.length,3,'Exactly three additional presentation-only wide markers');
 assert.equal(wideLines.filter(line=>line==='    root.classList.toggle("mmc-card-preview-wide", box.width / box.height >= 2.1);\n').length,2);
 assert.equal(wideLines.filter(line=>line==='  root.classList.toggle("mmc-card-preview-wide", Boolean(source.width && source.height) && box.width / box.height >= 2.1);\n').length,1);
 const before=fs.readFileSync(path.join(process.env.CONTINUITY_PORTRAIT_BASELINE_DIR||process.env.CONTINUITY_BASELINE_DIR||path.join(task,'baseline'),'web/creator/card-preview.js'),'utf8');
 const originalTitle=text=>text.replace('"aria-label": hint, ...(hover ? {} : { title: hint })','"aria-label": hint, title: hint');
 assert.equal(originalTitle(preview.replace(wideMarkers,'').replace(/^  (?:  )?root\.classList\.toggle\("mmc-card-preview-portrait", [^\r\n]*\);\r?\n/gm,'')),originalTitle(before),'Every existing source reader/playback/crop/volume/lifecycle callback remains byte-exact after only prior EXT73 title guard and three exact wide markers');
 assert.match(read('styles/timeline.js'),portraitRule,'One explicitly scoped removable portrait block');
}
const extra=`
window.portraitReset=(options={})=>{
 footerReset(options);
 document.querySelector('.fixture-footer-strip').classList.toggle('individual-preview',Boolean(options.preview));
 const segment=subject.timeline.segments[1];segment.assets=Array.from({length:options.refs??3},(_,i)=>({handle:'reference-'+i}));
 if(options.longFacts)segment.assets=Array.from({length:12345},(_,i)=>({handle:'reference-'+i}));
 subject.mount();
 return JSON.stringify(subject.timeline);
};
window.portraitStandalone=(options={})=>{
 for(const player of subject.cardPreviews)player.destroy();subject.cardPreviews.clear();
 const [width,height]=footerAspects[options.aspect||'portrait'];
 const source={filename:'standalone-'+(options.aspect||'portrait')+'.webm',range:{start:0,end:1},hasAudio:true,crop:options.crop||null,...(options.unknown?{}:{width,height})};
 window.standaloneAsset=source;window.standaloneSource=JSON.stringify(source);window.standalonePlayer=createCardPreview(source,{hover:false,label:'RAM aspect marker'});
 document.body.replaceChildren(el('div',{class:'mmc-root'},[standalonePlayer.root]));
 const before={portrait:standalonePlayer.root.classList.contains('mmc-card-preview-portrait'),ratio:standalonePlayer.root.querySelector('.mmc-card-preview-stage').style.aspectRatio};
 standalonePlayer.media.preload='auto';standalonePlayer.media.load();return before;
};
window.portraitMetrics=()=>{
 const card=document.querySelector('.mmc-tl-card'),cr=card.getBoundingClientRect();
 const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left-cr.left,right:r.right-cr.left,top:r.top-cr.top,bottom:r.bottom-cr.top,width:r.width,height:r.height};};
 const textLines=n=>{const walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT),out=[];while(walker.nextNode()){const text=walker.currentNode;if(!text.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(text);const tops=[];for(const r of range.getClientRects())if(!tops.some(top=>Math.abs(top-r.top)<.5))tops.push(r.top);out.push({text:text.textContent,lines:tops.length});}return out;};
 const selectors=['.mmc-tl-card-head','.mmc-tl-card-count','.mmc-tl-card-refs','.mmc-tl-card-status','.mmc-tl-card-seed','.mmc-tl-card-transport','.mmc-tl-card-edit-tools'];
 const nodes=selectors.map(selector=>{const node=card.querySelector(selector);return node?{selector,box:rect(node),text:textLines(node),style:{font:getComputedStyle(node).fontSize,color:getComputedStyle(node).color}}:null;}).filter(Boolean);
 const stage=card.querySelector('.mmc-card-preview-stage'),media=card.querySelector('video');
 return{width:cr.width,height:cr.height,padding:parseFloat(getComputedStyle(card).paddingRight),border:parseFloat(getComputedStyle(card).borderRightWidth),nodes,stage:stage?rect(stage):null,ratio:stage?getComputedStyle(stage).aspectRatio:null,portrait:!!card.querySelector('.mmc-card-preview-portrait'),overflow:card.scrollWidth>card.clientWidth+1,muted:media?.muted,volume:media?.volume,commits:subject.commits,snapshot:JSON.stringify(subject.timeline)};
};
`;
const checks=[],layouts=[],errors=[];let browser,requests=0;
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<.2,message+' '+JSON.stringify({a,b}));
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
 const page=await browser.newPage({viewport:{width:1600,height:1400}});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent('<style id="portrait-styles">'+currentCss+'</style><style>:root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:24px;background:#171718}.fixture-host{width:max-content;height:auto;padding:0}.fixture-footer-strip{width:calc(100vw - 48px);box-sizing:border-box}</style>');
 await page.evaluate(async()=>{
  window.footerMediaUrls={};
  for(const [aspect,[width,height]]of Object.entries({portrait:[120,208],landscape:[160,90],ultrawide:[240,60]})){
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#37516a';ctx.fillRect(0,0,width,height);
   const stream=canvas.captureStream(10),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();let frame=0;
   const ticker=setInterval(()=>{ctx.fillStyle=++frame%2?'#d6e6ee':'#37516a';ctx.fillRect(0,0,1,1);},50);await new Promise(resolve=>setTimeout(resolve,600));clearInterval(ticker);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
   window.footerMediaUrls[aspect]=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
  }
 });
 await page.evaluate('(()=>{'+code+'\n'+extra+'})()');
 const reset=options=>page.evaluate(options=>portraitReset(options),options);
 const pair=async options=>{
  const snapshot=await reset(options);await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=2||v.error));
  const current=await page.evaluate(()=>portraitMetrics());
  await page.evaluate(content=>document.getElementById('portrait-styles').textContent=content,baselineCss);const old=await page.evaluate(()=>portraitMetrics());await page.evaluate(content=>document.getElementById('portrait-styles').textContent=content,currentCss);
  return{current,old,snapshot};
 };
 await check('Normal Korean ready portrait is only slightly narrower, with unchanged one-line controls and aspect',async()=>{
  const value=await pair({language:'ko',scale:1,preview:true,aspect:'portrait',face:true,faceOff:true});
  fs.writeFileSync(path.join(output,'prototype-normal.json'),JSON.stringify(value,null,2));console.log('NORMAL '+JSON.stringify({width:value.current.width,old:value.old.width,height:value.current.height,oldHeight:value.old.height}));
  assert.ok(value.old.width-value.current.width>0&&value.old.width-value.current.width<=20.2,JSON.stringify(value));
  assert.equal(value.current.snapshot,value.snapshot);assert.equal(value.current.commits,0);assert.equal(value.current.muted,true);assert.equal(value.current.volume,0);
  assert.equal(value.current.overflow,false);assert.ok(value.current.nodes.flatMap(n=>n.text).every(n=>n.lines===1));
  close(value.current.stage.width/value.current.stage.height,120/208,'Portrait aspect unchanged');assert.ok(value.current.height<value.old.height);
  await page.locator('.fixture-footer-strip').screenshot({path:path.join(output,'portrait-ko-normal.png')});
 });
 await check('Portrait no-wrap floors preserve labels, right anchors, type and facts for all status choices and locales',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const state of [{kept:true},{kept:true,edited:true},{kept:false},{kept:false,edited:true},{motion:false,face:false},{face:true,faceOff:true,fixed:false},{face:true,faceOff:false,fixed:true}]){
   const options={language,scale,preview:true,aspect:'portrait',...state},value=await pair(options),g=value.current,old=value.old;
   assert.equal(g.snapshot,value.snapshot);assert.equal(g.commits,0);assert.equal(g.overflow,false);assert.equal(g.muted,true);assert.equal(g.volume,0);
   assert.ok(old.width-g.width>=-.2&&old.width-g.width<=20.2,JSON.stringify({options,g,old}));
   for(const node of g.nodes){assert.ok(node.text.every(n=>n.lines===1),JSON.stringify({options,node}));const prior=old.nodes.find(n=>n.selector===node.selector);assert.deepEqual(node.style,prior.style);close(node.box.top,prior.box.top,'Stable control y');close(node.box.height,prior.box.height,'Stable control height');close(g.width-node.box.right,old.width-prior.box.right,'Stable right inset');}
   close(g.stage.width/g.stage.height,120/208,'All portrait aspect cases');layouts.push(options);
  }
 });
 await check('Landscape, ultrawide and supplied Clip cards use shared aspect widths; no-ready and preview OFF keep prior geometry',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6])for(const state of [{aspect:'landscape',preview:true},{aspect:'ultrawide',preview:true},{aspect:'portrait',preview:false},{aspect:'portrait',preview:true,take:false},{aspect:'portrait',preview:true,clip:true}]){
   const options={language,scale,...state},value=await pair(options);
   if(Math.abs(value.current.height-value.old.height)>.2)fs.writeFileSync(path.join(output,'unscoped-height-diagnostic.json'),JSON.stringify({options,...value},null,2));
   if(options.preview&&options.take!==false){
    const portrait=options.aspect==='portrait',wide=options.aspect==='ultrawide',ratio=portrait?120/208:wide?240/60:160/90;
    close(value.current.width,Math.max(portrait?338:wide?520:420,(portrait?38:58)+300*scale),'Shared aspect-class width '+JSON.stringify(options));
    close(value.current.stage.width/value.current.stage.height,ratio,'Whole source aspect stays unchanged '+JSON.stringify(options));
    close(value.current.height-value.old.height,value.current.stage.height-value.old.stage.height,'Only the preview aspect height follows its shared width '+JSON.stringify(options));
   }else{close(value.current.width,value.old.width,'Unscoped width '+JSON.stringify(options));close(value.current.height,value.old.height,'Unscoped height '+JSON.stringify(options));}
   assert.equal(value.current.snapshot,value.snapshot);assert.equal(value.current.commits,0);assert.equal(value.current.overflow,false);layouts.push(options);
  }
 });
 await check('Long fact labels widen safely without wraps; a custom card name cannot force a wide card',async()=>{
  for(const language of ['en','ko','ja','zh'])for(const scale of [.8,1,1.6]){
   await reset({language,scale,preview:true,aspect:'portrait'});
   const stress=await page.evaluate(()=>{
    const before=portraitMetrics();subject.timeline.segments[1].extended_card_name='A manually named card '.repeat(12);subject.mount();
    const named=portraitMetrics(),snapshot=JSON.stringify(subject.timeline);
    // Isolated presentation stress, not a changed compiler/frame count: the
    // actual fact node must accommodate a future longer translated label.
    document.querySelector('.mmc-tl-card-frame-fact').textContent='24 fps · 123,456,789,012,345 frames — extended translated frame fact';
    return{before,named,wide:portraitMetrics(),snapshot};
   });
   close(stress.named.width,stress.before.width,'Custom card name remains ellipsized/contained');assert.ok(stress.wide.width>=stress.named.width);
   assert.equal(stress.wide.overflow,false);assert.ok(stress.wide.nodes.flatMap(n=>n.text).every(n=>n.lines===1),JSON.stringify({language,scale,stress}));assert.equal(stress.wide.snapshot,stress.snapshot);assert.equal(stress.wide.commits,0);
  }
 });
 await check('Saved unknown dimensions and real cropped/turned metadata select the marker without altering playback or source',async()=>{
  for(const options of [{unknown:true,portrait:true,initial:false},{crop:{turn:90},portrait:false,initial:false},{aspect:'landscape',crop:{x:0,y:0,w:.25,h:1},portrait:true,initial:true}]){
   const initial=await page.evaluate(options=>portraitStandalone(options),options);assert.equal(initial.portrait,options.initial);
   await page.waitForFunction(()=>standalonePlayer.media.readyState>=2);
   const result=await page.evaluate(()=>({portrait:standalonePlayer.root.classList.contains('mmc-card-preview-portrait'),muted:standalonePlayer.media.muted,volume:standalonePlayer.media.volume,paused:standalonePlayer.media.paused,source:JSON.stringify(standaloneAsset),sourceBefore:standaloneSource,ratio:standalonePlayer.root.querySelector('.mmc-card-preview-stage').style.aspectRatio}));
   assert.equal(result.portrait,options.portrait);assert.equal(result.muted,true);assert.equal(result.volume,0);assert.equal(result.paused,true);
   const ratio=result.ratio.split('/').map(Number);assert.equal(ratio[1]>ratio[0],options.portrait);
   assert.equal(result.source,result.sourceBefore);assert.equal(JSON.parse(result.source).filename,'standalone-'+(options.aspect||'portrait')+'.webm');
   await page.evaluate(()=>standalonePlayer.destroy());assert.equal(await page.locator('.mmc-card-preview').count(),0);
  }
 });
 await check('An already-sized large portrait source remains silent and its view-only marker cleans up normally',async()=>{
  const initial=await page.evaluate(()=>portraitStandalone({}));assert.equal(initial.portrait,true);await page.waitForFunction(()=>standalonePlayer.media.readyState>=2);
  const before=await page.evaluate(()=>({label:standalonePlayer.root.getAttribute('aria-label'),volume:standalonePlayer.media.volume,muted:standalonePlayer.media.muted,source:standaloneSource}));
  assert.equal(before.label,'RAM aspect marker');assert.equal(before.volume,0);assert.equal(before.muted,true);
  await page.evaluate(()=>{standalonePlayer.suspend();standalonePlayer.resume();standalonePlayer.destroy();});assert.equal(await page.locator('.mmc-card-preview').count(),0);
 });
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(requests,0);
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,layouts,requests,errors},null,2));console.log(JSON.stringify({passed:checks.length,layouts:layouts.length,requests,errors:errors.length}));
})().finally(async()=>{await browser?.close();}).catch(error=>{console.error(error);process.exitCode=1;});
