// Actual strip-face rail/panel and existing dashboard entry in isolated Chrome.
// No live ComfyUI, queueing, graph mutations, filesystem media writes or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.CONTINUITY_SOURCE_ROOT
  ? path.resolve(process.env.CONTINUITY_SOURCE_ROOT, 'web/creator')
  : path.resolve(__dirname, '../../web/creator');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const timeline = read('timeline.js');
const body = timeline.slice(timeline.indexOf('export class TimelineBody'));
const shell = read('fullscreen.js');
const fn = (source, name) => {
  const found = source.match(new RegExp(`(?:export )?function ${name}\\([^]*?^\\}`, 'm'));
  assert.ok(found, `production function ${name}`); return found[0].replace(/^export /, '');
};
const method = (source, name) => {
  const found = source.match(new RegExp(`^  (?:async )?${name}\\([^]*?^  \\}`, 'm'));
  assert.ok(found, `production method ${name}`); return found[0];
};
const baseline=process.env.CONTINUITY_BASELINE_DIR
  ? path.resolve(process.env.CONTINUITY_BASELINE_DIR,'web/creator/timeline.js')
  : path.resolve(__dirname,'../../../baseline/web/creator/timeline.js');
if(fs.existsSync(baseline)){
 const original=fs.readFileSync(baseline,'utf8'),oldRail=method(original.slice(original.indexOf('export class TimelineBody')),'renderRail');
 if(method(body,'renderRail')!==oldRail){
 const viewBlock=oldRail.match(/        \/\/ The strip face's view controls[^]*?class: "mmc-tool mmc-tool-expand" \}\)\] : \[\]\),/);
 assert.ok(viewBlock,'Original fullscreen callback/capability block');
 const eol=oldRail.includes('\r\n')?'\r\n':'\n';
 const leading=viewBlock[0].replace(' })] : []),',' }),'+eol+'          el("span", { class: "mmc-tool-view-divider", "aria-hidden": "true" })] : []),');
 const expected=oldRail.replace(viewBlock[0]+eol,'').replace('      el("div", { class: "mmc-rail-group" }, ['+eol,'      el("div", { class: "mmc-rail-group" }, ['+eol+leading+eol);
 assert.equal(method(body,'renderRail'),expected,'Only existing fullscreen block order and decorative separator differ; every rail callback/capability is exact');
 }
}
const css = ['base', 'editor', 'picker', 'overlays', 'timeline', 'fullscreen'].map(name => {
  const found = read(`styles/${name}.js`).match(/export const css = `([^]*)`;\s*$/);
  assert.ok(found, `production CSS ${name}`); return found[1];
}).join('\n');
const ko = vm.runInNewContext(read('locales/ko.js').replace(/^export const /m, 'const ') + ';ko;', {});
// Wiring is supplied only to TimelineBody, not silently lent to shot editors.
assert.match(read('../creator.js'), /tools: \(\) => requestAnimationFrame\(\(\) => openFullscreenTools\(node\)\)/);
assert.match(method(body, 'constructor'), /this\.tools = tools/);
assert.doesNotMatch(method(body, 'faceBody'), /tools:/);
assert.doesNotMatch(method(body, 'renderPanel'), /mmc-tl-open|mmc-fs-enter|renderPreStagePill|renderPreStageTool/);
assert.match(method(body, 'renderPanel'), /mmc-tl-summary-room", onclick: \(\) => this\.open\(\)/);
assert.match(method(body, 'renderLane'), /mmc-tl-reel", onclick: \(\) => this\.open\(\)/);
const cardArtFixtures = Object.fromEntries(['presets', 'controlnet', 'controlnet-depth', 'blockout', 'blockout-depth', 'upscale'].map(name =>
  [name, 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'cards', `${name}.webp`)).toString('base64')]));
const code = `
${fn(read('dom.js'), 'el')}
window.el=el;
${read('dom.js').match(/^export const ICONS =[^]*?^};/m)[0].replace(/^export /, '')}
${fn(read('dom.js'), 'svg')}
${fn(read('dom.js'), 'icon')}
let locale='en'; const ko=${JSON.stringify(ko)};
const t=(text,values={})=>(locale==='ko'?ko[text]??text:text).replace(/\\{([^}]+)\\}/g,(_,key)=>values[key]??key);
window.setLocale=value=>{locale=value;};
const S={takesReferences:piece=>piece.refs,takesKind:()=>true,isSingle:()=>false,
  passes:piece=>piece.segments.map((segment,start)=>({start,segments:[segment]})),
  timelineSeconds:piece=>piece.segments.reduce((total,s)=>total+s.duration_s,0),
  pieceFamily:()=> 'h3',activeGlobalLoras:piece=>piece.loras??[],hasAutoDuration:()=>false,
  cutTimes:segments=>({at:segments.map((_,i)=>i*14),total:segments.reduce((sum,s)=>sum+s.duration_s,0)}),
  segmentSeconds:s=>s.duration_s,isClip:s=>s.kind==='clip',mode:()=> 'REF2VA',continues:s=>!!s.continues,
  isHeld:()=>false,takeOn:()=>false,continueSource:(_s,i)=>i,shotTime:s=>s+' s'};
const probeAspectSizes=()=>{};
const timelineGeometry=()=>({width:480,height:832,ratio:9/16,fromInput:false});
const rulesFor=()=>({fps:24});
const describeRatio=()=> '9:16';
const familyPill=()=>el('span',{class:'mmc-pill mmc-pill-static'},[icon('model',16),el('span',{text:'MiniMax H3'})]);
const loraBase=entry=>entry.name;
const openPresetLibrary=()=>Promise.resolve(); const openPicker=()=>Promise.resolve();const openSettings=()=>Promise.resolve();
class Face {
 constructor({full=true,pre=true,tools=true,active=false,refs=true}={}){
  this.timeline={refs,segments:[{duration_s:14.38,prompt:'First shot'},{duration_s:14.38,prompt:'Next shot',continues:true}],
   prompt:'Replace the performer while retaining the source performance, camera, staging and soundtrack.',
   soundscape:'Reuse original source sound',music:'N/A',loras:[],assets:[],aspect:'9:16'};
  this.counts={full:0,pre:0,tools:0,open:0,clear:0,loras:0,renders:0};this.active=active;
  this.fullscreen=full?()=>this.counts.full++:null;
  this.preStage=pre?{active:()=>this.active,toggle:()=>{this.counts.pre++;this.active=!this.active;}}:null;
  this.tools=tools?()=>this.counts.tools++:null;
 }
 ${['renderRail','renderPanel','renderPreStageTool','renderLane','fitLane'].map(name=>method(body,name)).join('\n')}
 clearTool(){return el('button',{class:'mmc-tool mmc-tool-danger',onclick:()=>this.counts.clear++},[
  el('span',{class:'mmc-tool-icon'},[icon('eraser')]),el('span',{text:t('Clear')})]);}
 manageLoras(){this.counts.loras++;}addPoolAssets(){}presetTarget(){return{};}
 pieceView(){return null;}renderHeldPieceViewPill(){return [];}open(){this.counts.open++;}
 render(){this.counts.renders++;if(this.root)this.mount();}
 mount(width=960){this.root??=el('div',{class:'mmc-root',style:{width:width+'px',height:'620px'}});
  this.root.replaceChildren(this.renderRail(),this.renderPanel());this.fitLane();return this.root;}
}
window.Face=Face;window.mountFace=(options={},width=960)=>{window.face=new Face(options);
 const root=face.mount(width);document.body.replaceChildren(root);face.laneFit.observe(face.lane);return face;};
${read('navigate.js').replace(/^import [^;]+;\r?\n/gm,'').replace(/^export /gm,'')}
const cardArtFixtures=${JSON.stringify(cardArtFixtures)};
const cardArt=name=>cardArtFixtures[name];
const openControl=()=>{},openBlockout=()=>{},openChat=()=>{},openUpscale=()=>{},openLift=()=>{};
let open=null;let shells=0,unmounts=0,actions=0;
class Fullscreen {
 constructor(node){this.node=node;this.front=node;this.shown={};this.room=el('div',{class:'mmc-fs-room'});
  this.mark=el('button',{class:'mmc-fs-mark','aria-expanded':'false',text:'Continuity'});this.root=el('div',{class:'mmc-fs'},[
   el('div',{class:'mmc-fs-bar'},[this.mark]),this.room]);document.body.append(this.root);shells++;}
 ${['openDash','closeDash','destinations'].map(name=>method(shell,name)).join('\n')}
 pieceFrame(){return null;}goTo(){actions++;}unmount(){this.root.remove();unmounts++;}
}
${fn(shell,'openFullscreen')}
${fn(shell,'openFullscreenTools')}
${fn(shell,'close')}
window.toolsCase=()=>{const node={id:1,mmcBody:{showsStrip:()=>true,timeline:{subjects:[]}}};
 openFullscreenTools(node);const first=open,initialCards=open.dash.querySelectorAll('button').length;
 openFullscreenTools(node);const reused=open===first;
 const before={shells,unmounts,actions};openFullscreenTools(null);openFullscreenTools({id:2});
 const guarded=open===first&&shells===before.shells&&unmounts===before.unmounts;
 return {node,first,initialCards,reused,guarded};};
window.shellState=()=>({shells,unmounts,actions,dash:!!open?.dash,
 labels:open?[...open.dash?.querySelectorAll('.mmc-dash-name')??[]].map(n=>n.textContent):[],
 focus:document.activeElement?.className,expanded:open?.mark.getAttribute('aria-expanded')});
window.closeShell=close;
`;
new vm.Script(code);
const results=[],errors=[];let browser,requests=0;
async function check(name,fn){await fn();results.push({name,passed:true});}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:780}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',route=>{requests++;return route.abort();});
 await page.setContent(`<style>:root{--comfy-menu-bg:#1b1b1b;--fg-color:#eee;--bg-color:#1b1b1b;--input-text:#ddd;--descrip-text:#aaa;--warning-background:#efad45;--primary-background:#222;--destructive-background:#d45647;--border-color:#555;--content-bg:#242424;--error-text:#eb6c62}${css}</style><body style="background:#111;margin:20px;--mmc-type:1"></body>`);
 await page.evaluate(`(()=>{${code}})()`);
 await check('Strip tools preserve every callback availability combination',async()=>{
  assert.equal(await page.evaluate(()=>{
   for(let i=0;i<8;i++){
    const opts={full:!!(i&1),pre:!!(i&2),tools:!!(i&4)};const face=mountFace(opts);
    const rail=face.root.querySelector('.mmc-rail');
    if(!!rail.querySelector('.mmc-tool-expand:not(.mmc-tool-tools)')!==opts.full||
       !!rail.querySelector('.mmc-prestage-toggle')!==opts.pre||!!rail.querySelector('.mmc-tool-tools')!==opts.tools)return false;
    if(rail.querySelectorAll('.mmc-tool-view-divider').length!==Number(opts.full))return false;
    if(face.root.querySelector('.mmc-tl-open,.mmc-fs-enter,.mmc-panel .mmc-prestage-toggle'))return false;
   }return true;
  }),true);
 });
 await check('Fullscreen leads the rail; remaining tools follow their original order and the right machine group is unchanged',async()=>{
  assert.deepEqual(await page.evaluate(()=>{
   mountFace();return [...face.root.querySelector('.mmc-rail-group').querySelectorAll(':scope > button')].map(n=>n.lastChild.textContent);
  }),['Fullscreen','Add image','Add video','Add audio','Add LoRA','Clear','Pre-stage','Tools']);
  assert.deepEqual(await page.evaluate(()=>[...face.root.querySelector('.mmc-rail-group:last-child').querySelectorAll(':scope > button')].map(n=>n.lastChild.textContent)),['Presets','Gallery','Settings']);
 });
 await check('View tool clicks call originals once without modifying piece data',async()=>{
  assert.equal(await page.evaluate(()=>{
   const before=JSON.stringify(face.timeline);
   face.root.querySelector('.mmc-tool-expand:not(.mmc-tool-tools)').click();
   face.root.querySelector('.mmc-tool-tools').click();face.root.querySelector('.mmc-prestage-toggle').click();
   return before===JSON.stringify(face.timeline)&&face.counts.full===1&&face.counts.tools===1&&face.counts.pre===1&&face.counts.renders===1;
  }),true);
 });
 await check('Prestage active styling/ARIA and original toggle-off behavior survive',async()=>{
  assert.equal(await page.evaluate(()=>{
   let tool=face.root.querySelector('.mmc-prestage-toggle');
   const on=tool.classList.contains('on')&&tool.getAttribute('aria-pressed')==='true';
   const activeBorder=getComputedStyle(tool.querySelector('.mmc-tool-icon')).borderColor;
   tool.click();tool=face.root.querySelector('.mmc-prestage-toggle');
   return on&&!tool.classList.contains('on')&&tool.getAttribute('aria-pressed')==='false'&&face.counts.pre===2&&
    getComputedStyle(tool.querySelector('.mmc-tool-icon')).borderColor!==activeBorder;
  }),true);
 });
 await check('Families without reference tools still retain all available view controls',async()=>{
  assert.deepEqual(await page.evaluate(()=>{mountFace({refs:false});return [...face.root.querySelector('.mmc-rail-group').querySelectorAll(':scope > button')].map(n=>n.lastChild.textContent);}),
   ['Fullscreen','Add LoRA','Clear','Pre-stage','Tools']);
 });
 await check('Timeline remains reachable through actual prompt/reel click handlers',async()=>{
  assert.equal(await page.evaluate(()=>{
   const before=JSON.stringify(face.timeline);face.root.querySelector('.mmc-tl-summary-room').click();
   face.root.querySelector('.mmc-tl-tick').click();return face.counts.open===2&&before===JSON.stringify(face.timeline);
  }),true);
 });
 await check('All moved controls use existing toolbar icon geometry and readable labels',async()=>{
  assert.equal(await page.evaluate(()=>{
   mountFace();const basic=face.root.querySelector('.mmc-tool-icon').getBoundingClientRect();
   return [...face.root.querySelectorAll('.mmc-tool-expand,.mmc-prestage-toggle')].every(n=>{
    const r=n.querySelector('.mmc-tool-icon').getBoundingClientRect();return Math.abs(r.width-basic.width)<0.1&&Math.abs(r.height-basic.height)<0.1&&n.lastChild.textContent;
   });
  }),true);
 });
 await check('The optional leading divider is faded, pointer-transparent, aria-hidden and geometrically between the first two tools',async()=>{
  assert.equal(await page.evaluate(()=>{
   mountFace();const group=face.root.querySelector('.mmc-rail-group'),[first,divider,next]=group.children;
   const before=JSON.stringify(face.timeline),a=first.getBoundingClientRect(),d=divider.getBoundingClientRect(),b=next.getBoundingClientRect(),icon=first.querySelector('.mmc-tool-icon').getBoundingClientRect(),c=getComputedStyle(divider);
   return first.classList.contains('mmc-tool-expand')&&divider.className==='mmc-tool-view-divider'&&next.lastChild.textContent==='Add image'&&
    divider.getAttribute('aria-hidden')==='true'&&divider.tabIndex===-1&&!divider.onclick&&c.pointerEvents==='none'&&c.backgroundImage.includes('linear-gradient')&&
    Math.abs(d.width-1)<.1&&Math.abs(d.height-icon.height+2)<.1&&Math.abs(d.top-icon.top)<.1&&a.right<d.left&&d.right<b.left&&
    JSON.stringify(face.timeline)===before;
  }),true);
 });
 await check('Absent fullscreen capability creates no divider; no-reference families keep fullscreen and divider before LoRA/Clear',async()=>{
  assert.equal(await page.evaluate(()=>{
   for(const refs of [false,true]){
    mountFace({full:false,refs});const group=face.root.querySelector('.mmc-rail-group');
    if(group.querySelector('.mmc-tool-view-divider')||group.firstChild.lastChild.textContent!==(refs?'Add image':'Add LoRA'))return false;
    mountFace({refs});const children=[...face.root.querySelector('.mmc-rail-group').children];
    if(children[0].lastChild.textContent!=='Fullscreen'||children[1].className!=='mmc-tool-view-divider'||children[2].lastChild.textContent!==(refs?'Add image':'Add LoRA'))return false;
   }return true;
  }),true);
 });
 const out=process.env.CONTINUITY_ARTIFACT_DIR||path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:path.join(out,'node-toolbar-normal.png')});
 await check('Korean 620px node and enlarged type fit without horizontal clipping',async()=>{
  await page.setViewportSize({width:700,height:850});
  assert.equal(await page.evaluate(()=>{
   setLocale('ko');mountFace({active:true},620);document.documentElement.style.setProperty('--mmc-type','1.6');
   const root=face.root.getBoundingClientRect();return [...face.root.querySelectorAll('.mmc-rail .mmc-tool')].every(n=>{
    const r=n.getBoundingClientRect();return r.left>=root.left&&r.right<=root.right+1&&r.width>0;
   })&&!face.root.querySelector('.mmc-tl-open');
  }),true);
  await page.screenshot({path:path.join(out,'node-toolbar-ko-620.png')});
 });
 await check('Fullscreen existing hide rules keep its redundant doors hidden',async()=>{
  assert.equal(await page.evaluate(()=>{
   const wrapper=el('div',{class:'mmc-fs simple'});wrapper.append(face.root);document.body.replaceChildren(wrapper);
   const hidden=[...face.root.querySelectorAll('.mmc-tool-expand,.mmc-prestage-toggle,.mmc-tool-view-divider')].every(n=>getComputedStyle(n).display==='none');
   wrapper.classList.remove('simple');return hidden&&getComputedStyle(face.root.querySelector('.mmc-prestage-toggle')).display!=='none'&&getComputedStyle(face.root.querySelector('.mmc-tool-view-divider')).display==='none';
  }),true);
 });
 await check('Divider styling is confined to the new strip rail marker and never hides ordinary editing controls in fullscreen',async()=>{
  assert.equal(await page.evaluate(()=>{
   const wrapper=face.root.closest('.mmc-fs'),editing=[...face.root.querySelectorAll('.mmc-rail-group:first-child > button:not(.mmc-tool-expand):not(.mmc-prestage-toggle)')];
   const visible=editing.every(node=>getComputedStyle(node).display!=='none');wrapper.classList.remove('mmc-fs');
   const restored=getComputedStyle(face.root.querySelector('.mmc-tool-view-divider')).display!=='none'&&getComputedStyle(face.root.querySelector('.mmc-tool-expand:not(.mmc-tool-tools)')).display!=='none';
   const outside=el('span',{class:'mmc-tool-view-divider'});document.body.append(outside);const untouched=getComputedStyle(outside).backgroundImage==='none';outside.remove();return visible&&restored&&untouched;
  }),true);
 });
 await check('Tools reuses existing dashboard idempotently and rejects invalid nodes',async()=>{
  await page.setViewportSize({width:1100,height:850});
  assert.equal(await page.evaluate(()=>{
   setLocale('en');document.documentElement.style.setProperty('--mmc-type','1');document.body.replaceChildren();
   const result=toolsCase();const state=shellState();return result.initialCards===8&&result.reused&&result.guarded&&state.shells===1&&state.unmounts===0&&state.actions===0&&state.expanded==='true'&&state.focus==='mmc-dash-card';
  }),true);
  assert.deepEqual(await page.evaluate(()=>shellState().labels),['Pre-stage','Strip','Presets','ControlNet','Blockout','Chat','Upscale','Image to 3D','More to come']);
  await page.screenshot({path:path.join(out,'node-toolbar-tools-dashboard.png')});
 });
 await check('Dashboard cards execute only when selected; close remains the original route',async()=>{
  assert.equal(await page.evaluate(()=>{
   document.querySelector('.mmc-dash-card').click();const state=shellState();
   const clicked=state.actions===1&&!state.dash&&state.expanded==='false';closeShell();return clicked&&shellState().unmounts===1;
  }),true);
 });
 assert.equal(requests,0,'no network requests');
 assert.deepEqual(errors,[],'no page errors');
 console.log(JSON.stringify({checks:results.length,requests,errors,results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();});
