// Actual Timeline mount/disclosures/strip wheel handler and complete CSS in its
// production concatenation order. Ready-preview controllers use RAM-only media;
// catalogue/panels/Sound rendering reuse the explicit header-fixture adapters.
// No ComfyUI, user workflow, model request, live media, profile or GPU execution.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT) : path.resolve(__dirname, '../..');
const root = path.join(sourceRoot, 'web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const normalize = value => value.replace(/\r\n/g, '\n');
const baselineRoot = process.env.CONTINUITY_BASELINE_DIR
  ? path.resolve(process.env.CONTINUITY_BASELINE_DIR) : path.resolve(sourceRoot, '../baseline');
const cssSource = read('styles/timeline.js');
const scrollbarBlock = /\/\* The full Timeline already scrolls here;[^]*?(?=\.mmc-tl-prompt \{)/;
assert.equal(cssSource.match(scrollbarBlock)?.length, 1, 'Exactly one scoped native-body scrollbar addition');
if (fs.existsSync(path.join(baselineRoot, 'web/creator/styles/timeline.js'))) {
  const baselineCss = fs.readFileSync(path.join(baselineRoot, 'web/creator/styles/timeline.js'), 'utf8');
  if (baselineCss.match(scrollbarBlock)) {
    // Later additive releases may change other owner modules/CSS. EXT52's rail
    // itself must still be retained byte-for-byte; the release-scope audit owns
    // the complete-tree comparison for those explicitly authorized changes.
    assert.equal(cssSource.match(scrollbarBlock)[0], baselineCss.match(scrollbarBlock)[0],
      'Existing EXT52 native-body scrollbar block remains byte-exact');
  } else {
    assert.equal(normalize(cssSource).replace(scrollbarBlock, ''), normalize(baselineCss),
      'Removing only the body-scrollbar block recovers complete prior Timeline CSS');
  const visit = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    if (['.git','__pycache__'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? visit(file) : entry.isFile() ? [file] : [];
  });
  for (const file of visit(baselineRoot)) {
    const rel = path.relative(baselineRoot, file).split(path.sep).join('/');
    if ((rel.endsWith('.py') && !rel.startsWith('tests/'))
      || (rel.startsWith('web/') && rel.endsWith('.js') && rel !== 'web/creator/styles/timeline.js')) {
      assert.deepEqual(fs.readFileSync(path.join(sourceRoot, rel)), fs.readFileSync(file), 'Unchanged product owner '+rel);
    }
  }
  }
} else if (process.env.CONTINUITY_BASELINE_DIR) assert.fail('Explicit baseline must exist');

// Reuse the maintained, actual-method header adapter without executing its
// browser suite. The shared fixture keeps mount(), section state and wheel code
// current; this test supplies only read-only content-height/media boundaries.
const headerFile = path.join(sourceRoot, 'tests/browser/test-timeline-header-layout.cjs');
const headerPrefix = fs.readFileSync(headerFile, 'utf8').split('let browser, requests = 0;')[0];
assert.ok(headerPrefix.includes("new vm.Script(code"), 'Explicit maintained header fixture boundary');
const {code:headerCode} = vm.runInNewContext(headerPrefix+'\n;({code});',
  {require,process,__dirname:path.dirname(headerFile)}, {filename:headerFile});
const styles = read('styles.js');
const imports = Object.fromEntries([...styles.matchAll(/import \{ css as (\w+) \} from "\.\/styles\/(\w+)\.js";/g)]
  .map(match => [match[1],match[2]]));
const cssOrder = styles.match(/const CSS = \[([^]*?)\]\.join\(""\);/)[1]
  .replace(/\/\/[^\n]*/g,'').split(',').map(item=>item.trim()).filter(Boolean);
assert.equal(cssOrder.at(-1),'fullscreen','Actual final fullscreen override order');
const css = cssOrder.map(owner => {
  assert.ok(imports[owner], 'Known production CSS owner '+owner);
  return read('styles/'+imports[owner]+'.js').match(/export const css = `([^]*)`;\s*$/)[1];
}).join('\n');
const previewCode = read('card-preview.js').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const code = headerCode+`\n
const viewUrl=()=>window.localMediaUrl;
${previewCode}
window.fixtureEl=el;
window.scrollPlayers=[];
window.installScrollFixture=(options={})=>{
  for(const controller of scrollPlayers)controller.destroy();scrollPlayers=[];
  const segments=Array.from({length:options.count??6},(_,index)=>index===3
    ? {kind:'clip',duration_s:14.38,filename:'synthetic-clip.webm'}
    : {prompt:'Preserve source performance and framing.',duration_s:14.38,hold:true,
       take:{filename:'synthetic-ready-'+index+'.webm',width:120,height:208,duration_s:1}});
  setFixture({language:options.language||'en',scale:options.scale||1,segments});
  const body=subject.modal.querySelector(':scope > .mmc-tl-body');
  subject.promptSection.setOpen(false);subject.soundscapeSection.setOpen(false);subject.musicSection.setOpen(false);
  subject.poolSection.setOpen(false);
  subject.sound.host.hidden=false;
  subject.sound.host.replaceChildren(el('div',{class:'mmc-snd-head'},[
    el('span',{class:'mmc-snd-name',text:'Sound (isolated read-only lane)'}),
  ]),el('div',{class:'mmc-snd-reel'},[el('div',{class:'mmc-snd-pass',style:{left:'0',width:'100%'},text:'1 · 2 · 3 · 4 · 5 · 6'})]),
    el('div',{class:'mmc-snd-lane has-refs'},[el('div',{class:'mmc-snd-block',style:{left:'5%',width:'85%'},text:'RAM-only sound lane'})]));
  subject.stripHost.classList.toggle('individual-preview',Boolean(options.ready));
  for(const [index,card]of [...subject.stripHost.children].entries()){
    card.style.height='auto';card.style.gridRow='2';
    card.replaceChildren(el('div',{class:'mmc-tl-card-head'},[
      el('span',{class:'mmc-tl-solo',text:String(index+1)}),
      el('span',{class:'mmc-tl-card-name',text:t(index===3?'Clip':'Segment')}),
    ]),el('div',{class:'mmc-tl-card-prompt',text:'Read-only fixture: preserve source performance and framing.'}),
      el('div',{class:'mmc-tl-card-refs',text:'References 3 · 14.38 s'}),
      el('div',{class:'mmc-tl-card-status'},[el('span',{class:'mmc-tl-card-state kept',text:'take · kept'})]),
      el('div',{class:'mmc-tl-card-foot'},[el('span',{class:'mmc-tl-card-edit-tools',text:'Edit | Trim | Crop'})]));
    if(options.ready){
      const controller=createCardPreview({filename:'ram-preview-'+index+'.webm',range:{start:0,end:1},
        width:120,height:208,hasAudio:false},{key:'scroll-'+index,label:'Read-only preview '+(index+1)});
      controller.media.preload='auto';
      card.append(controller.root);scrollPlayers.push(controller);
    }
  }
  window.scrollFixture={body,header:subject.modal.querySelector('.mmc-tl-header'),sound:subject.sound.host,
    strip:subject.stripHost,baseline:snapshot()};
  body.scrollTop=0;subject.stripHost.scrollLeft=0;
  return snapshot();
};
window.scrollMetrics=()=>{
  const {body,header,strip,sound}=scrollFixture,br=body.getBoundingClientRect(),hr=header.getBoundingClientRect();
  const sr=strip.getBoundingClientRect(),ar=sound.getBoundingClientRect();
  const style=getComputedStyle(body),rail=getComputedStyle(body,'::-webkit-scrollbar');
  return {body:{left:br.left,right:br.right,top:br.top,bottom:br.bottom,width:br.width,height:br.height,
    clientWidth:body.clientWidth,clientHeight:body.clientHeight,scrollWidth:body.scrollWidth,scrollHeight:body.scrollHeight,
    scrollTop:body.scrollTop,gutter:body.offsetWidth-body.clientWidth},
    header:{top:hr.top,bottom:hr.bottom},strip:{left:sr.left,top:sr.top,bottom:sr.bottom,scrollLeft:strip.scrollLeft,
      clientWidth:strip.clientWidth,scrollWidth:strip.scrollWidth,clientHeight:strip.clientHeight,scrollHeight:strip.scrollHeight},
    sound:{top:ar.top,bottom:ar.bottom},scrollbarWidth:style.scrollbarWidth,scrollbarColor:style.scrollbarColor,
    scrollbarGutter:style.scrollbarGutter,railDisplay:rail.display,railWidth:rail.width,
    thumbRadius:getComputedStyle(body,'::-webkit-scrollbar-thumb').borderRadius,
    pageOverflow:document.documentElement.scrollWidth>innerWidth+1,documentScroll:scrollY};
};
`;
new vm.Script(code,{filename:'timeline-native-body-scrollbar-fixture.js'});
const results=[],layouts=[],errors=[];let browser,requests=0;
const output=path.resolve(process.env.CONTINUITY_ARTIFACT_DIR||process.env.CONTINUITY_UX_SCREENSHOT_DIR
  ||path.join(os.tmpdir(),'continuity-body-scrollbar'));
assert.ok(output!==sourceRoot&&!output.startsWith(sourceRoot+path.sep),'Evidence outside product');
const check=async(name,run)=>{await run();results.push({name,passed:true});console.log('PASS '+name);};
(async()=>{
  // Playwright's default --hide-scrollbars would suppress native painting and
  // native thumb hit-testing despite correct computed CSS and reserved gutter.
  browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],
    executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{requests++;return route.abort();});
  await page.setContent('<html class="dark-theme"><head><style>'+css+
    ':root{--comfy-menu-bg:#181819;--fg-color:#ddd;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}body{margin:0;background:#171718}</style></head><body></body></html>');
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=208;
    const context=canvas.getContext('2d');context.fillStyle='#374958';context.fillRect(0,0,120,208);
    context.fillStyle='#aac8d3';context.font='13px sans-serif';context.fillText('RAM preview',20,105);
    const stream=canvas.captureStream(10),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=event=>chunks.push(event.data);
    recorder.start();const paint=setInterval(()=>{context.fillStyle='#aac8d3';context.fillRect(0,0,1,1);},50);
    await new Promise(resolve=>setTimeout(resolve,500));clearInterval(paint);recorder.stop();await done;
    stream.getTracks().forEach(track=>track.stop());window.localMediaUrl=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
  });
  await page.evaluate('(()=>{'+code+'})()');
  await check('Only the direct Timeline body reveals a thin native rail matching the existing picker/popover tokens',async()=>{
    await page.evaluate(()=>installScrollFixture({ready:true}));
    const metrics=await page.evaluate(()=>scrollMetrics());
    assert.equal(metrics.scrollbarWidth,'thin');assert.equal(metrics.scrollbarGutter,'stable');
    assert.equal(metrics.railDisplay,'block');assert.equal(metrics.railWidth,'6px');assert.equal(metrics.thumbRadius,'3px');
    assert.ok(metrics.body.scrollHeight>metrics.body.clientHeight+20);assert.ok(metrics.body.gutter>0);
    const scoped=await page.evaluate(()=>{
      const grid=fixtureEl('div',{class:'mmc-grid'}),picker=fixtureEl('div',{class:'mmc-modal'},[grid]);document.body.append(picker);
      const nested=fixtureEl('div',{class:'mmc-tl-body'}),wrapper=fixtureEl('div',{},[nested]);subject.modal.append(wrapper);
      const plain=fixtureEl('div',{class:'mmc-tl-body'});document.body.append(plain);
      const bodies=[scrollFixture.body,grid,nested,plain,subject.promptBox.root];
      const result=bodies.map(node=>({width:getComputedStyle(node).scrollbarWidth,
        color:getComputedStyle(node).scrollbarColor,display:getComputedStyle(node,'::-webkit-scrollbar').display,
        thumb:getComputedStyle(node,'::-webkit-scrollbar-thumb').backgroundColor,radius:getComputedStyle(node,'::-webkit-scrollbar-thumb').borderRadius}));
      result[0].visibleThumb=getComputedStyle(subject.modal.querySelector('.mmc-tl-scroll-rail.vertical > .mmc-tl-scroll-thumb')).backgroundColor;
      picker.remove();wrapper.remove();plain.remove();return result;
    });
    assert.equal(scoped[0].visibleThumb,scoped[1].thumb,'Managed visible rail preserves picker palette');
    assert.equal(scoped[0].color,'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)','Only native paint is now transparent');
    assert.equal(scoped[0].thumb,'rgba(0, 0, 0, 0)');
    for(const property of ['width','display','radius'])assert.equal(scoped[0][property],scoped[1][property],'Original native geometry '+property);
    for(const index of [2,3,4]){assert.equal(scoped[index].width,'none');assert.equal(scoped[index].display,'none');}
  });
  await check('Whole-body vertical wheel reaches ready-card controls and the bottom Sound lane without moving the header/page',async()=>{
    await page.evaluate(()=>installScrollFixture({ready:true}));
    await page.waitForFunction(()=>scrollPlayers.every(controller=>controller.media.readyState>=2));
    const before=await page.evaluate(()=>scrollMetrics());
    await page.mouse.move(before.body.right-14,before.body.top+70);await page.mouse.wheel(0,3000);
    await page.waitForFunction(()=>scrollFixture.body.scrollTop>100);
    const after=await page.evaluate(()=>scrollMetrics());
    assert.deepEqual(after.header,before.header);assert.equal(after.documentScroll,0);assert.equal(after.strip.scrollLeft,0);
    assert.ok(after.sound.bottom<=after.body.bottom-10&&after.sound.top>=after.body.top);
    assert.ok(after.strip.scrollHeight<=after.strip.clientHeight+1,'No second vertical rail clipping card controls');
    assert.equal(await page.evaluate(()=>[...subject.stripHost.querySelectorAll('.mmc-card-preview-controls')].every(node=>{
      const r=node.getBoundingClientRect(),s=subject.stripHost.getBoundingClientRect();return r.bottom<s.bottom&&r.height>0;
    })),true);
    assert.deepEqual(await page.evaluate(()=>snapshot()),await page.evaluate(()=>scrollFixture.baseline));
  });
  await check('The managed right-edge thumb preserves direct pointer drag of the entire body rather than a card or editor',async()=>{
    await page.evaluate(()=>{scrollFixture.body.scrollTop=0;});
    const before=await page.evaluate(()=>scrollMetrics());
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const thumb=await page.locator('.mmc-tl-scroll-rail.vertical > .mmc-tl-scroll-thumb').boundingBox();assert.ok(thumb);
    const x=thumb.x+thumb.width/2,y=thumb.y+thumb.height/2;
    assert.equal(await page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('.mmc-tl-scroll-rail.vertical'),[x,y]),true,'Native pointer reaches actual managed rail');
    fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'native-thumb-before.png')});
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+150,{steps:15});await page.mouse.up();
    await page.waitForFunction(()=>scrollFixture.body.scrollTop>30);
    const after=await page.evaluate(()=>scrollMetrics());
    assert.ok(after.body.scrollTop>30);assert.equal(after.strip.scrollLeft,0);assert.deepEqual(after.header,before.header);
  });
  await check('The existing horizontal strip wheel remains independent of body vertical scrolling',async()=>{
    await page.evaluate(()=>installScrollFixture({ready:true,count:10}));
    const position=await page.evaluate(()=>{const body=scrollFixture.body;
      body.scrollTop=Math.max(0,subject.stripHost.offsetTop-body.offsetTop+subject.stripHost.offsetHeight-body.clientHeight+40);
      const r=subject.stripHost.getBoundingClientRect();return{x:r.left+50,y:r.bottom-16};});
    const before=await page.evaluate(()=>scrollMetrics());
    await page.mouse.move(position.x,position.y);await page.mouse.wheel(0,160);
    await page.waitForFunction(()=>subject.stripHost.scrollLeft>0);
    const after=await page.evaluate(()=>scrollMetrics());
    assert.equal(after.body.scrollTop,before.body.scrollTop);assert.ok(after.strip.scrollLeft>before.strip.scrollLeft);
    assert.deepEqual(after.header,before.header);
  });
  await check('Short content has no vertical overflow; disclosure/ready growth retains the same reserved gutter and content alignment',async()=>{
    await page.setViewportSize({width:1600,height:1200});await page.evaluate(()=>installScrollFixture({ready:false,count:2}));
    const short=await page.evaluate(()=>scrollMetrics());
    assert.ok(short.body.scrollHeight<=short.body.clientHeight+1);assert.equal(short.body.scrollTop,0);
    await page.evaluate(()=>{
      subject.poolSection.body.replaceChildren(...Array.from({length:15},(_,index)=>fixtureEl('div',{text:'Read-only reference '+index,style:{height:'70px',flex:'none'}})));
      subject.poolSection.setOpen(true);
    });
    const open=await page.evaluate(()=>scrollMetrics());
    assert.ok(open.body.scrollHeight>open.body.clientHeight);assert.equal(open.body.clientWidth,short.body.clientWidth);
    assert.equal(open.body.gutter,short.body.gutter);assert.equal(open.strip.left,short.strip.left);
    await page.evaluate(()=>subject.poolSection.setOpen(false));
    const closed=await page.evaluate(()=>scrollMetrics());assert.equal(closed.body.clientWidth,short.body.clientWidth);
    assert.ok(closed.body.scrollHeight<=closed.body.clientHeight+1);
    await page.evaluate(()=>installScrollFixture({ready:true,count:2}));
    const ready=await page.evaluate(()=>scrollMetrics());assert.equal(ready.body.clientWidth,short.body.clientWidth);
    assert.equal(ready.body.gutter,short.body.gutter);assert.equal(ready.strip.left,short.strip.left);
  });
  await check('Normal/enlarged EN/KO at wide, medium and compact widths keep the native rail on the body right edge and bottom content reachable',async()=>{
    for(const width of [1600,900,640,320])for(const language of ['en','ko'])for(const scale of [1,1.5]){
      await page.setViewportSize({width,height:900});await page.evaluate(options=>installScrollFixture(options),{ready:true,language,scale});
      await page.evaluate(()=>{scrollFixture.body.scrollTop=scrollFixture.body.scrollHeight;});
      const metrics=await page.evaluate(()=>scrollMetrics());
      assert.equal(metrics.pageOverflow,false,JSON.stringify({width,language,scale,metrics}));
      assert.equal(metrics.scrollbarWidth,'thin');assert.ok(metrics.body.gutter>0);
      assert.ok(metrics.body.scrollTop>0);assert.ok(metrics.sound.bottom<=metrics.body.bottom-10);
      assert.ok(metrics.sound.top>=metrics.body.top);assert.equal(metrics.documentScroll,0);
      assert.ok(metrics.strip.scrollHeight<=metrics.strip.clientHeight+1);
      layouts.push({width,language,scale,body:metrics.body,header:metrics.header});
    }
  });
  await check('Light-palette wide/compact rails follow the same derived picker thumb and transparent track without layout leakage',async()=>{
    for(const width of [1600,320]){
      await page.setViewportSize({width,height:900});
      await page.mouse.move(0,0);
      await page.evaluate(()=>{
        const style=document.documentElement.style;
        for(const [name,value]of Object.entries({'--comfy-menu-bg':'#f5f5f5','--fg-color':'#222','--input-text':'#222','--descrip-text':'#666','--bg-color':'#fff'}))style.setProperty(name,value);
        installScrollFixture({ready:true,language:'ko',scale:1.5});
      });
      const color=await page.evaluate(()=>{
        const grid=fixtureEl('div',{class:'mmc-grid'}),picker=fixtureEl('div',{class:'mmc-modal'},[grid]);document.body.append(picker);
        const result={body:getComputedStyle(subject.modal.querySelector('.mmc-tl-scroll-rail.vertical > .mmc-tl-scroll-thumb')).backgroundColor,
          native:getComputedStyle(scrollFixture.body,'::-webkit-scrollbar-thumb').backgroundColor,
          picker:getComputedStyle(grid,'::-webkit-scrollbar-thumb').backgroundColor,
          track:getComputedStyle(scrollFixture.body,'::-webkit-scrollbar-track').backgroundColor};
        picker.remove();result.metrics=scrollMetrics();return result;
      });
      assert.equal(color.body,color.picker);assert.match(color.body,/0\.133333/);
      assert.equal(color.native,'rgba(0, 0, 0, 0)','Managed native paint is transparent, native geometry remains reserved');
      assert.equal(color.track,'rgba(0, 0, 0, 0)');assert.equal(color.metrics.pageOverflow,false);
      assert.ok(color.metrics.body.gutter>0);assert.equal(color.metrics.scrollbarWidth,'thin');
      await page.screenshot({path:path.join(output,'timeline-body-scrollbar-ko-light-'+width+'.png')});
    }
    await page.evaluate(()=>{for(const name of ['--comfy-menu-bg','--fg-color','--input-text','--descrip-text','--bg-color'])document.documentElement.style.removeProperty(name);});
  });
  await check('Nested prompt scrolling retains its prior hidden rail and input contents; Close remains a native hit target',async()=>{
    await page.setViewportSize({width:900,height:900});await page.evaluate(()=>installScrollFixture({ready:true,language:'ko',scale:1.5}));
    await page.evaluate(()=>{subject.promptSection.setOpen(true);subject.promptBox.root.textContent=Array(60).fill('Synthetic line, not user input.').join('\n');});
    const before=await page.evaluate(()=>snapshot());
    const prompt=await page.evaluate(()=>{const n=subject.promptBox.root,r=n.getBoundingClientRect();return{scroll:n.scrollHeight,client:n.clientHeight,width:getComputedStyle(n).scrollbarWidth,x:r.left+30,y:r.top+30};});
    assert.ok(prompt.scroll>prompt.client);assert.equal(prompt.width,'none');
    await page.mouse.move(prompt.x,prompt.y);await page.mouse.wheel(0,120);
    await page.waitForFunction(()=>subject.promptBox.root.scrollTop>0);
    assert.deepEqual(await page.evaluate(()=>snapshot()),before);
    const close=await page.evaluate(()=>{const n=subject.modal.querySelector('.mmc-close'),r=n.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===n};});
    assert.equal(close.hit,true);await page.mouse.click(close.x,close.y);assert.equal(await page.evaluate(()=>subject.overlay.isConnected),false);
  });
  fs.mkdirSync(output,{recursive:true});
  for(const width of [1600,900,640,320]){
    await page.setViewportSize({width,height:900});await page.evaluate(options=>installScrollFixture(options),{ready:true,language:'ko',scale:1.5});
    await page.screenshot({path:path.join(output,'timeline-body-scrollbar-ko-large-'+width+'-top.png')});
    await page.evaluate(()=>{scrollFixture.body.scrollTop=scrollFixture.body.scrollHeight;});
    await page.screenshot({path:path.join(output,'timeline-body-scrollbar-ko-large-'+width+'-bottom.png')});
  }
  assert.equal(requests,0);assert.deepEqual(errors,[]);
  const report={sourceRoot,baselineRoot,cssOrder,checks:results.length,results,layouts,requests,errors,
    limits:'Isolated actual mount/controller/CSS with explicit panel/catalog/read-only Sound adapters and RAM WebM; not live ComfyUI, user media codecs, GPU or AI output.'};
  fs.writeFileSync(path.join(output,'timeline-body-scrollbar-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:results.length,layouts:layouts.length,requests,errors,output}));
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
