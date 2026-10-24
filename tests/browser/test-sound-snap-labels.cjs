// Actual SoundLane snap/label methods and actual passWindows/frame math, with
// local piece data. No API, ComfyUI, media decoding or generation is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT, 'web/creator')
  : path.resolve(__dirname, '../../web/creator');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const sound = read('soundlane.js'), state = read('state.js'), canvas = read('canvas.js');
const method = (name, source=sound) => {
  const found=source.match(new RegExp(`^  ${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found,`Production method ${name}`);return found[0];
};
const fn = (source,name) => {
  const found=source.match(new RegExp(`export function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found,`Production function ${name}`);return found[0].replace(/^export /,'');
};
const baseline=path.resolve(__dirname,'../../../baseline/web/creator/soundlane.js');
if(fs.existsSync(baseline)) {
  const before=fs.readFileSync(baseline,'utf8');
  for(const name of ['snapPoints','snap','snapMove','commit']) {
    assert.equal(method(name),method(name,before),`Existing ${name} is unchanged`);
  }
  // EXT71 adds cancellation ownership and releases capture on teardown only;
  // every original pointer/frame/edit/one-commit statement must still match.
  const oldDrag=text=>method('drag',text)
    .replace(/^        this\.cancelDrag = null;\r?\n/m,'')
    .replace(/^        if \(node\.hasPointerCapture\(event\.pointerId\)\) node\.releasePointerCapture\(event\.pointerId\);\r?\n/m,'')
    .replace('if (dirty && !this.destroyed) this.render();','if (dirty) this.render();')
    .replace(/^      this\.cancelDrag = \(\) => up\(\{ type: "pointercancel", pointerId: event\.pointerId \}\);\r?\n/m,'');
  assert.equal(oldDrag(sound),oldDrag(before),'Original audio drag recovered after cancellation-only additions');
}
const css=['base','timeline'].map(name=>read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/)[1]).join('\n');
const snapNodes=sound.match(/    this\.snapEl = el\([^]*?(?=    this\.gapsEl =)/);
assert.ok(snapNodes,'Actual hint node creation');
const code=`
${fn(read('dom.js'),'el')}
${['legalFrameCounts','framesForSeconds','secondsForFrames'].map(name=>fn(canvas,name)).join('\n')}
${['passes','clipSeconds','cutTimes','passWindows','timelineFrames','shotTime','feather'].map(name=>fn(state,name)).join('\n')}
const merged=segment=>segment.merge===true;
const continues=segment=>segment.continue===true;
const isClip=segment=>segment?.kind==='clip';
const segmentSeconds=segment=>isClip(segment)?clipSeconds(segment):Number(segment.duration_s)||0;
const pieceFamily=()=> 'fixture';
const featherGridOf=()=> [1,5,22,39,56,73];
let RULES={fps:24,frameStep:17,frameOffset:5,minSeconds:1,maxSeconds:60};
const rulesFor=()=> RULES;
${read('sound.js').match(/export const atFrame =[^]*?;/)[0].replace(/^export /,'')}
${fn(read('sound.js'),'lane')}
const SNAP_PX=7;
const S={passes,cutTimes,passWindows,timelineFrames,pieceFamily,shotTime};
let language='en';
const words={
  'Segment {number} start':'구간 {number} 시작',
  'Segment {number} end':'구간 {number} 끝',
  'Sound clip {number} start':'사운드 클립 {number} 시작',
  'Sound clip {number} end':'사운드 클립 {number} 끝',
  'Piece start':'전체 시작','Piece end':'전체 끝',
  '{time} · frame {frame}':'{time} · 프레임 {frame}',
};
const t=(text,values={})=>(language==='ko'?words[text]||text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
class Subject {
  ${['snapPoints','snap','snapMove','snapLabels','showSnap'].map(name=>method(name)).join('\n')}
  get piece(){return this.data;}
  rules(){return rulesFor();}
  seconds(frames){return secondsForFrames(frames,this.rules());}
  total(){return Math.max(1,timelineFrames(this.piece));}
  pct(frames){return ((frames/this.total())*100)+'%';}
  perPixel(){return this.total()/(this.laneEl.getBoundingClientRect().width||1);}
  snapping(index){return this.snaps.has(this.piece.sound?.[index]);}
  blocks(){return this.working??lane(this.piece);}
  at(blocks,index){return blocks.find(block=>block.index===index);}
  nodes(){
    ${snapNodes[0]}
    this.laneEl=el('div',{class:'mmc-snd-lane'},[this.snapEl,this.snapHintEl]);
    document.querySelector('.fixture').replaceChildren(this.laneEl);
  }
}
window.subject=Object.assign(new Subject(),{data:null,dragging:0,working:null,snaps:new Set()});
window.setPiece=(segments,sound=[{filename:'moving.wav',at_s:0.5,in_s:0,out_s:1}])=> {
  subject.data={segments,sound,prompt:'Do not change',assets:[]};subject.working=null;
  subject.dragging=0;subject.snaps=new Set([sound[0]]);language='en';subject.nodes();
};
window.inspect=frame=> {
  subject.showSnap(frame);
  return {labels:subject.snapLabels(frame),line:subject.snapEl.style.left,
    text:subject.snapTimeEl.textContent,title:subject.snapHintEl.title,
    target:subject.snapHintEl.getAttribute('data-frame'),
    windows:passWindows(subject.piece),points:subject.snapPoints(subject.dragging)};
};
window.useLanguage=value=>{language=value;};
window.useRules=value=>{RULES=value;};
setPiece([{duration_s:3},{duration_s:3}]);
`;
new vm.Script(code,{filename:'production-sound-snap-labels-fixture.js'});
const checks=[];let browser,requests=0;
const check=async(name,fn)=>{await fn();checks.push({name,passed:true});};
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined});
  const page=await browser.newPage({viewport:{width:960,height:450}});
  await page.route('**/*',route=>{requests++;return route.abort();});
  await page.setContent(`<html class="dark-theme"><head><style>${css}
    :root{--comfy-menu-bg:#171718;--fg-color:#fff;--input-text:#ddd;--descrip-text:#999;--bg-color:#202020;--primary-background:#0b8ce9;--destructive-background:#b33a3a;--error-text:#f44}
    body{margin:0;background:#171718}.fixture{width:900px;margin:20px;box-sizing:border-box}
  </style></head><body><div class="fixture"></div></body></html>`);
  await page.evaluate(`(()=>{${code}})()`);
  await check('One shared boundary keeps previous end and next start at its exact frame',async()=>{
    const value=await page.evaluate(()=>inspect(73));
    assert.deepEqual(value.labels,['Segment 1 end','Segment 2 start']);
    assert.equal(value.line,'50%');assert.equal(value.target,'73');
    assert.equal(value.text,'00:03.042 · frame 73');
    assert.ok(value.title.includes('3.041667 s')&&value.title.includes('last frame finishes'));
    assert.deepEqual(value.windows.map(window=>[window.at,window.frames,window.sampledAt]),[[0,73,0],[73,73,73]]);
  });
  await check('Piece edges keep individual segment start/end with no one-frame-early targets',async()=>{
    assert.deepEqual(await page.evaluate(()=>({start:inspect(0).labels,end:inspect(146).labels,
      early:subject.snapPoints(0).includes(72)})),{start:['Segment 1 start'],end:['Segment 2 end'],early:false});
  });
  await check('Merged internal cut keeps both segment numbers on the sampled cut clock',async()=>{
    await page.evaluate(()=>setPiece([{duration_s:3},{duration_s:3,merge:true}]));
    const value=await page.evaluate(()=>inspect(72));
    assert.deepEqual(value.labels,['Segment 1 end','Segment 2 start']);
    assert.deepEqual(value.windows.map(window=>[window.at,window.frames,window.sampledAt]),[[0,141,0]]);
    assert.ok(value.points.includes(72));assert.deepEqual(await page.evaluate(()=>inspect(141).labels),['Segment 2 end']);
  });
  await check('Continuation head trim shifts merged internal cut by sampledAt, never delivered at',async()=>{
    await page.evaluate(()=>setPiece([{duration_s:3},{duration_s:3.3,continue:true,feather:22},{duration_s:3.3,merge:true}]));
    const value=await page.evaluate(()=>inspect(130));
    assert.deepEqual(value.windows.map(window=>[window.at,window.frames,window.sampledAt,window.sampled]),[[0,73,0,73],[73,136,51,158]]);
    assert.deepEqual(value.labels,['Segment 2 end','Segment 3 start']);
    assert.ok(value.points.includes(130));assert.ok(!value.points.includes(152));
  });
  await check('Trimmed supplied clip uses its delivered duration and backwards blend tail',async()=>{
    await page.evaluate(()=>setPiece([{duration_s:6},{kind:'clip',duration_s:9,trim:{start:2,end:4},continue:true,feather:22}]));
    const value=await page.evaluate(()=>inspect(119));
    assert.deepEqual(value.windows.map(window=>[window.at,window.frames,window.sampledAt]),[[0,119,0],[119,48,119]]);
    assert.deepEqual(value.labels,['Segment 1 end','Segment 2 start']);
    assert.deepEqual(await page.evaluate(()=>inspect(167).labels),['Segment 2 end']);
  });
  await check('Other sound clips name both edges and exclude the clip being dragged',async()=>{
    await page.evaluate(()=>setPiece([{duration_s:3},{duration_s:3}],
      [{filename:'moving.wav',at_s:1,in_s:0,out_s:1},{filename:'other.wav',at_s:0,in_s:0,out_s:73/24}]));
    assert.deepEqual(await page.evaluate(()=>({start:inspect(0).labels,end:inspect(73).labels,own:inspect(24).labels})),
      {start:['Segment 1 start','Sound clip 2 start'],end:['Segment 1 end','Segment 2 start','Sound clip 2 end'],own:[]});
  });
  await check('Snap threshold, both-edge move choice and disabled magnet stay unchanged',async()=>{
    await page.evaluate(()=>setPiece([{duration_s:3},{duration_s:3}],
      [{filename:'moving.wav',at_s:0.5,in_s:0,out_s:1}]));
    assert.deepEqual(await page.evaluate(()=>{
      const reached=subject.snap(74,0),outside=subject.snap(75,0),body=subject.snapMove(50,0);
      subject.snaps.clear();const disabled=subject.snap(74,0);return{reached,outside,body,disabled};
    }),{reached:{frame:73,snapped:73},outside:{frame:75,snapped:null},body:{frame:49,snapped:73,gap:1},disabled:{frame:74,snapped:null}});
  });
  await check('Read-only labels never alter data, snap points, working blocks or exact target line',async()=>{
    assert.equal(await page.evaluate(()=>{
      subject.working=subject.blocks();const before=JSON.stringify({piece:subject.piece,working:subject.working,points:subject.snapPoints(0)});
      for(const frame of [0,73,146,73])subject.showSnap(frame);
      return before===JSON.stringify({piece:subject.piece,working:subject.working,points:subject.snapPoints(0)})&&subject.snapEl.style.left==='50%';
    }),true);
  });
  await check('Pointer release hides and clears stale target text and explanatory title',async()=>{
    assert.deepEqual(await page.evaluate(()=>{
      subject.showSnap(73);subject.showSnap(null);return{lineOn:subject.snapEl.classList.contains('on'),hintOn:subject.snapHintEl.classList.contains('on'),
        label:subject.snapLabelEl.textContent,time:subject.snapTimeEl.textContent,title:subject.snapHintEl.getAttribute('title'),target:subject.snapHintEl.getAttribute('data-frame')};
    }),{lineOn:false,hintOn:false,label:'',time:'',title:null,target:null});
  });
  await check('Fractional 29.97fps times are read from actual frame/fps and retain exact frame index',async()=>{
    await page.evaluate(()=>{useRules({fps:29.97,frameStep:8,frameOffset:1,minSeconds:1,maxSeconds:60});setPiece([{duration_s:3},{duration_s:3}]);});
    const value=await page.evaluate(()=>inspect(89));
    assert.deepEqual(value.labels,['Segment 1 end','Segment 2 start']);assert.equal(value.target,'89');
    assert.equal(value.text,'00:02.970 · frame 89');assert.ok(value.title.includes('2.969636 s'));
  });
  await check('Narrow Korean shared boundary labels and both-end hints fit inside lane',async()=>{
    await page.setViewportSize({width:320,height:450});
    await page.addStyleTag({content:'.fixture{width:100%;margin:0;padding:8px}'});
    await page.evaluate(()=>{useRules({fps:24,frameStep:17,frameOffset:5,minSeconds:1,maxSeconds:60});setPiece([{duration_s:3},{duration_s:3}]);useLanguage('ko');});
    for(const scale of [1,1.6])for(const frame of [0,73,146]) {
      const value=await page.evaluate(({scale,frame})=>{
        document.documentElement.style.setProperty('--mmc-type',String(scale));subject.showSnap(frame);
        const lane=subject.laneEl.getBoundingClientRect(),hint=subject.snapHintEl.getBoundingClientRect();
        return{lane:{left:lane.left,right:lane.right,top:lane.top,bottom:lane.bottom},hint:{left:hint.left,right:hint.right,top:hint.top,bottom:hint.bottom},
          label:subject.snapLabelEl.textContent,page:document.documentElement.scrollWidth,width:innerWidth};
      },{scale,frame});
      assert.ok(value.hint.left>=value.lane.left-1&&value.hint.right<=value.lane.right+1,JSON.stringify(value));
      assert.ok(value.page<=value.width,JSON.stringify(value));
      if(frame===73)assert.equal(value.label,'구간 1 끝 · 구간 2 시작');
    }
    if(process.env.CONTINUITY_UX_SCREENSHOT_DIR){
      fs.mkdirSync(process.env.CONTINUITY_UX_SCREENSHOT_DIR,{recursive:true});
      await page.evaluate(()=>subject.showSnap(73));
      await page.screenshot({path:path.join(process.env.CONTINUITY_UX_SCREENSHOT_DIR,'sound-snap-shared-boundary-ko-320.png'),fullPage:true});
    }
  });
  assert.equal(requests,0,'No network requests');
  console.log(JSON.stringify({suite:'sound-snap-labels',checks:checks.length,requests,results:checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
